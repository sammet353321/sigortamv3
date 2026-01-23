const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const db = require('./Database');

class SessionManager {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.baseAuthPath = path.join('auth_info_baileys');
        this.currentAuthPath = null;
        this.isInitializing = false;
        this.isDisconnecting = false;
        this.reconnectAttempts = 0;
        this.sentMessagesCache = new Set();
    }

    async start(isReconnect = false) {
        if (this.isInitializing) return;
        this.isInitializing = true;
        this.isDisconnecting = false;

        console.log(`[${this.userId}] Starting session... (Reconnect: ${isReconnect})`);

        try {
            // Determine auth path
            if (!this.currentAuthPath) {
                // Persistent Session: Use fixed path based on User ID
                // Do NOT use timestamp to allow session resumption after restart
                this.currentAuthPath = path.join(this.baseAuthPath, `session-${this.userId}`);
                console.log(`[${this.userId}] Auth path: ${this.currentAuthPath}`);
            }

            // If reconnect is false (fresh start requested) AND we are not just restarting the process,
            // we might want to clear old session. BUT for persistence, we should only clear if explicitly requested (e.g. logout).
            // Here 'start(false)' usually means "init", so we keep files if they exist.
            
            // Create dir if not exists
            if (!fs.existsSync(this.currentAuthPath)) {
                fs.mkdirSync(this.currentAuthPath, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.currentAuthPath);
            const { version } = await fetchLatestBaileysVersion();

            // Unique browser description to avoid conflict on same WA account
            // Adding a random component to ensure uniqueness even if user ID prefix is same (unlikely but safe)
            const browserId = `${this.userId.substring(0, 5)}-${Math.floor(Math.random() * 1000)}`;

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'error' }), // Only errors
                printQRInTerminal: true, // Enable terminal QR for debugging
                auth: state,
                browser: ['Sigortam Panel', 'Chrome', `v-${browserId}`], // Unique browser per user
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                retryRequestDelayMs: 500
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;

                for (const msg of messages) {
                    if (!msg.message || msg.key.fromMe) continue;

                    try {
                        const remoteJid = msg.key.remoteJid;
                        const isGroup = remoteJid.endsWith('@g.us');
                        
                        // Detect message type
                        const isImage = !!msg.message.imageMessage;
                        const isText = !!(msg.message.conversation || msg.message.extendedTextMessage?.text);
                        
                        let content = '';
                        let msgType = 'text';
                        let mediaUrl = null;

                        if (isText) {
                            content = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                        } else if (isImage) {
                            msgType = 'image';
                            content = msg.message.imageMessage.caption || '';
                            
                            try {
                                // Download media
                                const buffer = await downloadMediaMessage(
                                    msg,
                                    'buffer',
                                    { },
                                    { 
                                        logger: pino({ level: 'silent' }),
                                        reuploadRequest: this.sock.updateMediaMessage
                                    }
                                );
                                
                                // Upload to Supabase
                                const fileName = `whatsapp-media/${this.userId}/${Date.now()}.jpeg`;
                                
                                // Ensure bucket exists (best effort, ideally done once)
                                // We'll just try upload, if it fails due to bucket missing, we log it.
                                // But usually buckets are setup. Let's try to upload.
                                const { data, error } = await db.client
                                    .storage
                                    .from('chat-media')
                                    .upload(fileName, buffer, {
                                        contentType: 'image/jpeg',
                                        upsert: true
                                    });

                                if (error) {
                                    console.error(`[${this.userId}] Media upload failed:`, error);
                                    // Fallback: If upload fails, treat as text with warning
                                    msgType = 'text';
                                    content = `[Görsel Yüklenemedi] ${content}`;
                                } else {
                                    // Get Public URL
                                    const { data: { publicUrl } } = db.client
                                        .storage
                                        .from('chat-media')
                                        .getPublicUrl(fileName);
                                    
                                    mediaUrl = publicUrl;
                                    console.log(`[${this.userId}] Media uploaded: ${mediaUrl}`);
                                }
                            } catch (err) {
                                console.error(`[${this.userId}] Failed to process image:`, err);
                                msgType = 'text';
                                content = `[Görsel Hatası] ${content}`;
                            }
                        } else {
                            // Other types ignored for now
                            continue;
                        }

                        // If it was supposed to be an image but failed (no url), don't save as image
                        if (msgType === 'image' && !mediaUrl) {
                            msgType = 'text';
                            content = `[Görsel] ${content}`; 
                        }

                        if (!content && msgType === 'text') continue;

                        // Sender logic
                        const senderJid = isGroup ? (msg.key.participant || msg.participant) : remoteJid;
                        const senderPhone = senderJid ? senderJid.split('@')[0] : 'Unknown';
                        const senderName = msg.pushName || senderPhone; 

                        // STRICT ECHO CHECK:
                        // If the sender is ME (my phone number), ignore this message.
                        // This prevents self-messages or sync-echoes from appearing as Inbound messages.
                        
                        // 1. Check Baileys 'fromMe' flag (Standard)
                        if (msg.key.fromMe) continue;

                        // 2. Check if the message ID looks like a Baileys outbound message (BAE5 prefix)
                        // Even if fromMe is false (weird bug?), if it starts with BAE5, it's likely ours.
                        if (msg.key.id && msg.key.id.startsWith('BAE5')) continue;
                        
                        // 3. Compare Sender Phone with Bot's Phone (Robust Last 10 Digits Check)
                        if (this.sock?.user?.id) {
                            const normalize = (p) => String(p || '').replace(/\D/g, '').slice(-10);
                            
                            // Ensure clean number extraction (remove :suffix and @suffix)
                            const myPhoneFull = jidNormalizedUser(this.sock.user.id).split(':')[0].split('@')[0];
                            const sPhoneFull = senderPhone.split(':')[0].split('@')[0];
                            const rPhoneFull = remoteJid.split(':')[0].split('@')[0];

                            const myPhone10 = normalize(myPhoneFull);
                            const sPhone10 = normalize(sPhoneFull);
                            const rPhone10 = normalize(rPhoneFull);

                            // Check if sender is me
                            if (sPhone10 && myPhone10 && sPhone10 === myPhone10) {
                                // console.log(`[${this.userId}] Ignoring message from self (Echo/PhoneMatch): ${content}`);
                                continue;
                            }
                            // Also check if remoteJid is me (in case of direct self-message)
                            if (!isGroup && rPhone10 && myPhone10 && rPhone10 === myPhone10) {
                                 // console.log(`[${this.userId}] Ignoring direct self-message (Echo/PhoneMatch): ${content}`);
                                 continue;
                            }
                        }

                        // 4. Content-Based Echo Cache Check (The "Nuclear Option")
                        // If we recently sent this EXACT text to this EXACT person, it is an echo.
                        const cacheKey = `${remoteJid}:${content.trim()}`;
                        if (this.sentMessagesCache.has(cacheKey)) {
                            console.log(`[${this.userId}] Ignoring cached echo: ${content.substring(0, 20)}...`);
                            continue;
                        }

                        console.log(`[${this.userId}] Incoming ${msgType} from ${senderName}: ${content || '[Media]'}`);

                        // Insert into DB
                        await db.client.from('messages').insert({
                            user_id: this.userId,
                            direction: 'inbound',
                            type: msgType,
                            content: content,
                            media_url: mediaUrl,
                            wa_message_id: msg.key.id,
                            status: 'delivered',
                            sender_phone: senderPhone,
                            sender_name: senderName,
                            group_id: isGroup ? remoteJid : null,
                            created_at: new Date(msg.messageTimestamp * 1000).toISOString()
                        });

                    } catch (err) {
                        console.error(`[${this.userId}] Failed to save incoming message:`, err);
                    }
                }
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log(`[${this.userId}] QR Generated`);
                    const dataUrl = await qrcode.toDataURL(qr);
                    await db.updateSession(this.userId, { 
                        qr_code: dataUrl, 
                        status: 'scanning' 
                    });
                }

                if (connection === 'open') {
                    console.log(`[${this.userId}] Connected`);
                    this.reconnectAttempts = 0;
                    const userJid = this.sock.user.id;
                    const phone = jidNormalizedUser(userJid).split('@')[0];
                    
                    await db.updateSession(this.userId, { 
                        status: 'connected', 
                        qr_code: null, 
                        phone_number: phone 
                    });
                    this.isInitializing = false;
                }

                if (connection === 'close') {
                    this.isInitializing = false; // Reset init flag on close
                    const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`[${this.userId}] Connection closed. Code: ${statusCode}, Reconnect: ${shouldReconnect}`);

                    if (this.isDisconnecting) {
                        console.log(`[${this.userId}] Intentional disconnect. Stopping.`);
                        await this.stop();
                        return;
                    }

                    // Handle 401/405 specifically
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 405) {
                        console.log(`[${this.userId}] Critical error (401/405). Cleaning up and restarting...`);
                        
                        // Stop socket first
                        if (this.sock) {
                            this.sock.end(undefined);
                            this.sock = null;
                        }

                        this.cleanupFiles();
                        this.reconnectAttempts = 0;
                        
                        // Update DB to disconnected to stop QR loop
                        // Use async wrapper to not block event loop
                        (async () => {
                            try {
                                await db.updateSession(this.userId, { 
                                    status: 'disconnected', 
                                    qr_code: null,
                                    phone_number: null
                                });
                                console.log(`[${this.userId}] Session marked as disconnected in DB.`);
                            } catch (err) {
                                console.error(`[${this.userId}] Failed to update status to disconnected:`, err);
                            }
                        })();

                        // Do NOT auto-restart here to avoid infinite loop. 
                        // Let user manually request new QR from UI if they want to reconnect.
                        return;
                    }

                    if (shouldReconnect) { // Removed retry limit for robustness
                        this.reconnectAttempts++;
                        const delay = Math.min(this.reconnectAttempts * 2000, 10000); // Backoff
                        console.log(`[${this.userId}] Reconnecting in ${delay}ms...`);
                        setTimeout(() => this.start(true), delay); // Pass true for reconnect
                    } else {
                        // Only destroy if strictly NOT reconnectable (Logged Out)
                        console.log(`[${this.userId}] Fatal error (Not Reconnectable).`);
                        await this.destroy();
                    }
                }
            });

        } catch (err) {
            console.error(`[${this.userId}] Fatal start error:`, err);
            this.isInitializing = false;
        }
    }

    async stop() {
        this.isDisconnecting = true;
        if (this.sock) {
            try {
                await this.sock.logout(); // Try logout first
            } catch (e) {}
            try {
                this.sock.end(undefined);
            } catch (e) {}
            this.sock = null;
        }
        await this.clearWAGroups();
        await db.clearSession(this.userId);
        this.cleanupFiles();
    }

    async destroy() {
        this.isDisconnecting = true;
        if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
        }
        await this.clearWAGroups();
        await db.clearSession(this.userId);
        this.cleanupFiles();
    }

    cleanupFiles() {
        // Ensure path is known
        if (!this.currentAuthPath) {
            this.currentAuthPath = path.join(this.baseAuthPath, `session-${this.userId}`);
        }

        if (this.currentAuthPath && fs.existsSync(this.currentAuthPath)) {
            try {
                // Try to rename first to ensure the path is free immediately
                const trashPath = this.currentAuthPath + '_trash_' + Date.now();
                fs.renameSync(this.currentAuthPath, trashPath);
                console.log(`[${this.userId}] Session folder moved to trash: ${trashPath}`);
                
                // Then try to delete the trash
                try {
                    fs.rmSync(trashPath, { recursive: true, force: true });
                    console.log(`[${this.userId}] Trash deleted.`);
                } catch (e) {
                    console.warn(`[${this.userId}] Could not delete trash immediately (locked?), will ignore: ${e.message}`);
                }

                // Do NOT set currentAuthPath to null, so we can reuse it or it gets reset in start()
                // Actually start() checks !this.currentAuthPath. 
                // Let's keep it null to be consistent with "no active session" state?
                // But start() re-sets it. Okay.
                this.currentAuthPath = null;
            } catch (e) {
                // If rename fails, try direct delete
                console.error(`[${this.userId}] Rename failed, trying direct delete:`, e.message);
                try {
                    fs.rmSync(this.currentAuthPath, { recursive: true, force: true });
                    console.log(`[${this.userId}] Session files deleted directly.`);
                    this.currentAuthPath = null;
                } catch (err) {
                    console.error(`[${this.userId}] CRITICAL: Failed to delete session files:`, err.message);
                    this.currentAuthPath = null; 
                }
            }
        } else {
             console.log(`[${this.userId}] No session files found to clean at ${this.currentAuthPath}`);
        }
    }

    cleanupOldSessions() {
        if (!fs.existsSync(this.baseAuthPath)) {
            fs.mkdirSync(this.baseAuthPath, { recursive: true });
            return;
        }

        try {
            const files = fs.readdirSync(this.baseAuthPath);
            const userSessionPrefix = `session-${this.userId}-`;
            
            for (const file of files) {
                if (file.startsWith(userSessionPrefix) || file === `session-${this.userId}`) {
                    const filePath = path.join(this.baseAuthPath, file);
                    try {
                        fs.rmSync(filePath, { recursive: true, force: true });
                        console.log(`[${this.userId}] Old session cleaned: ${file}`);
                    } catch (err) {
                        console.error(`[${this.userId}] Failed to clean old session ${file}:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error(`[${this.userId}] Error scanning for old sessions:`, error);
        }
    }
    // --- GROUP MANAGEMENT ---
    async createGroup(name, participants = []) {
        if (!this.sock) return { success: false, error: 'Not connected' };
        try {
            const group = await this.sock.groupCreate(name, participants);
            console.log(`[${this.userId}] Group created: ${name} (${group.id})`);
            return { success: true, gid: group.id };
        } catch (error) {
            console.error(`[${this.userId}] Create group error:`, error);
            return { success: false, error: error.message };
        }
    }

    async deleteGroup(gid) {
        if (!this.sock) return { success: false, error: 'Not connected' };
        try {
            // 1. Fetch group metadata to check participants and admin status
            const metadata = await this.sock.groupMetadata(gid);
            const participants = metadata.participants.map(p => p.id);
            const myId = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const amIAdmin = metadata.participants.find(p => p.id === myId)?.admin;

            // 2. If admin, remove all participants first (except self)
            // Safety check: Only remove if we are sure we are admin
            if (amIAdmin) {
                const others = participants.filter(id => id !== myId);
                if (others.length > 0) {
                    try {
                        await this.sock.groupParticipantsUpdate(gid, others, 'remove');
                        console.log(`[${this.userId}] Removed ${others.length} members from ${gid}`);
                        // Wait a bit to ensure propagation
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (err) {
                        console.error(`[${this.userId}] Failed to remove participants:`, err);
                        // Continue to leave anyway
                    }
                }
            }

            // 3. Leave group
            await this.sock.groupLeave(gid);
            console.log(`[${this.userId}] Left group: ${gid}`);
            return { success: true };
        } catch (error) {
            console.error(`[${this.userId}] Leave group error:`, error);
            // Even if error (e.g. already left), return true to clear DB
            return { success: true, error: error.message };
        }
    }

    async syncGroups() {
        if (!this.sock) {
            console.log(`[${this.userId}] Cannot sync: Socket not connected`);
            return;
        }
        try {
            console.log(`[${this.userId}] Fetching groups from WA...`);
            const groups = await this.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups);
            console.log(`[${this.userId}] Found ${groupList.length} groups on WA.`);
            
            for (const g of groupList) {
                const { error } = await db.client.from('chat_groups').upsert({
                    id: g.id, 
                    name: g.subject,
                    is_whatsapp_group: true,
                    created_at: new Date(g.creation * 1000).toISOString(),
                    status: 'active',
                    created_by: this.userId
                }, { onConflict: 'id' });
                
                if (error) console.error(`[${this.userId}] Group upsert error (${g.subject}):`, error);
            }
            console.log(`[${this.userId}] Synced ${groupList.length} groups to DB.`);
        } catch (error) {
            console.error(`[${this.userId}] Sync CRITICAL error:`, error);
        }
    }
    
    async clearWAGroups() {
        try {
            console.log(`[${this.userId}] Clearing WA groups from DB for this user...`);
            // Only delete groups created by this user/session to avoid wiping other users' groups
            await db.client.from('chat_groups')
                .delete()
                .eq('is_whatsapp_group', true)
                .eq('created_by', this.userId);
        } catch (error) {
            console.error(`[${this.userId}] Clear groups error:`, error);
        }
    }

    // --- MESSAGING ---
    async sendMessage(phone, text) {
        if (!this.sock) return;
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        
        // Cache the outgoing message to prevent echo
        const cacheKey = `${jid}:${text.trim()}`;
        this.sentMessagesCache.add(cacheKey);
        
        // Auto-remove from cache after 15 seconds
        setTimeout(() => {
            this.sentMessagesCache.delete(cacheKey);
        }, 15000);

        await this.sock.sendMessage(jid, { text });
    }
}

module.exports = SessionManager;
