const Baileys = require('@whiskeysockets/baileys');
const makeWASocket = Baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, areJidsSameUser } = Baileys;

// REMOVED makeInMemoryStore declaration from here to avoid conflict
// const makeInMemoryStore = ... 

const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const socket = require('./socket');

// Simple Custom Store Implementation since Baileys export is missing/changed
function makeInMemoryStore(config) {
    return {
        contacts: {},
        messages: {},
        bind(ev) {
            ev.on('contacts.upsert', (contacts) => {
                for (const contact of contacts) {
                    this.contacts[contact.id] = {
                        ...(this.contacts[contact.id] || {}),
                        ...contact
                    };
                }
            });
            ev.on('contacts.update', (updates) => {
                for (const update of updates) {
                     if (this.contacts[update.id]) {
                         Object.assign(this.contacts[update.id], update);
                     }
                }
            });
            ev.on('messages.upsert', ({ messages }) => {
                 for (const msg of messages) {
                     const jid = msg.key.remoteJid;
                     if (!this.messages[jid]) this.messages[jid] = [];
                     // Limit to last 50 messages per chat to save memory
                     this.messages[jid].push(msg);
                     if (this.messages[jid].length > 50) this.messages[jid].shift();
                 }
            });
        },
        async loadMessage(jid, id) {
            if (this.messages[jid]) {
                return this.messages[jid].find(m => m.key.id === id);
            }
            return null;
        }
    };
}

const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });
if (!store) console.warn('Warning: makeInMemoryStore not found, contact names will be missing.');
const SESSIONS_DIR = path.join(__dirname, '../sessions');
// Save/Read store from file (optional, but good for restart)
// setInterval(() => {
//    store.writeToFile('./baileys_store_multi.json')
// }, 10_000)

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.qrCode = null;
        this.isInitializing = false;
        this.reconnectAttempts = 0;
        this.isStopped = false; // Flag to prevent auto-reconnect on manual stop
        this.currentSessionPath = null; // Store dynamic path
        this.connectionState = 'close'; // Track connection state
        this.userRole = null; // Store user role (admin/employee)
    }

    async waitForConnection(timeoutMs = 15000) {
        if (this.connectionState === 'open') return true;
        
        return new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
                if (this.connectionState === 'open') {
                    clearInterval(interval);
                    resolve(true);
                } else if (Date.now() - start > timeoutMs) {
                    clearInterval(interval);
                    console.warn(`[${this.userId}] Connection timeout after ${timeoutMs}ms`);
                    resolve(false);
                }
            }, 500);
        });
    }

    async start(forceClear = false) {
        if (this.isInitializing || this.isStopped) return;
        this.isInitializing = true;
        this.isStopped = false; // Reset on start

        try {
            // Logic for Dynamic Session Path
            // 1. If forceClear is true, we ALWAYS generate a new path
            // 2. If forceClear is false (reconnect/restart), we try to find the LATEST existing folder for this user
            // 3. If no folder exists, we generate a new one
            
            let targetPath = null;
            
            if (forceClear) {
                // Generate NEW unique path
                const timestamp = Date.now();
                targetPath = path.join(SESSIONS_DIR, `session-${this.userId}-${timestamp}`);
                console.log(`[${this.userId}] Force Clear requested. New session path: ${targetPath}`);
                
                // Cleanup OLD folders for this user to save space
                await this.cleanupOldSessions();
                
            } else {
                // Try to find existing session folder
                const existingFolders = fs.readdirSync(SESSIONS_DIR)
                    .filter(f => f.startsWith(`session-${this.userId}-`))
                    .sort() // Timestamp is in name, so sort works to find latest? 
                    // Actually numeric sort is better but alpha sort on `session-ID-TIMESTAMP` works if ID is constant
                    .reverse(); // Newest first
                    
                if (existingFolders.length > 0) {
                    targetPath = path.join(SESSIONS_DIR, existingFolders[0]);
                    console.log(`[${this.userId}] Resuming session from: ${targetPath}`);
                } else {
                    // No existing session, create new
                    const timestamp = Date.now();
                    targetPath = path.join(SESSIONS_DIR, `session-${this.userId}-${timestamp}`);
                    console.log(`[${this.userId}] No previous session found. Created: ${targetPath}`);
                }
            }
            
            this.currentSessionPath = targetPath;
            if (!fs.existsSync(this.currentSessionPath)) fs.mkdirSync(this.currentSessionPath, { recursive: true });

            const { state, saveCreds } = await useMultiFileAuthState(this.currentSessionPath);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                browser: ['Sigorta Bot', 'Chrome', '10.0'],
                generateHighQualityLinkPreview: true,
                getMessage: async (key) => {
                    if (store) {
                        const msg = await store.loadMessage(key.remoteJid, key.id);
                        return msg?.message || undefined;
                    }
                    return { conversation: 'hello' };
                }
            });

            // Bind Store
            if (store) store.bind(this.sock.ev);

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        this.qrCode = await QRCode.toDataURL(qr);
                        console.log(`[${this.userId}] QR Code generated (Length: ${this.qrCode.length})`);
                        
                        // 1. Emit to Socket (Fastest)
                        socket.emit('session_qr', { userId: this.userId, qr: this.qrCode });
                        
                        // 2. Save to DB (Persistence)
                        // Ensure we update status AND qr_code together
                        const { error } = await db.updateSession(this.userId, { 
                            status: 'scanning', 
                            qr_code: this.qrCode,
                            updated_at: new Date().toISOString()
                        });
                        
                        if (error) console.error(`[${this.userId}] DB Update Error:`, error);
                        else console.log(`[${this.userId}] QR saved to DB successfully.`);
                        
                    } catch (err) {
                        console.error(`[${this.userId}] QR Generation Error:`, err);
                    }
                }

                if (connection === 'open') {
                    console.log(`[${this.userId}] Connected!`);
                    this.connectionState = 'open';
                    this.reconnectAttempts = 0;
                    this.qrCode = null;

                    try {
                        // 1. Get Phone Number (and Format it)
                        let phone = 'unknown';
                        if (this.sock?.user?.id) {
                            phone = this.sock.user.id.split(':')[0]; // Remove @s.whatsapp.net
                        }

                        // 2. Fetch and Sync Groups
                        console.log(`[${this.userId}] Syncing groups...`);

                        // Fetch User Role first
                        try {
                            const { data: profile } = await db.client
                                .from('profiles')
                                .select('role')
                                .eq('id', this.userId)
                                .single();
                            this.userRole = profile?.role;
                            console.log(`[${this.userId}] User Role: ${this.userRole}`);
                        } catch (roleErr) {
                            console.error(`[${this.userId}] Failed to fetch user role:`, roleErr);
                        }

                        const groups = await this.sock.groupFetchAllParticipating();
                        const groupList = Object.values(groups);
                        console.log(`[${this.userId}] Found ${groupList.length} groups.`);
                        
                        const shouldSyncMembers = await db.syncGroups(this.userId, groupList);

                        // Sync Members for each group (Async to not block startup)
                        // Be careful with rate limits if many groups
                        // Only sync members if the user is an Admin (shouldSyncMembers is true)
                        if (shouldSyncMembers) {
                            (async () => {
                                console.log(`[${this.userId}] Waiting 5s for contacts to sync before processing members...`);
                                await new Promise(r => setTimeout(r, 5000));
                                
                                console.log(`[${this.userId}] Starting member sync for ${groupList.length} groups...`);
                                for (const g of groupList) {
                                    try {
                                        // Fetch full metadata to get participants
                                        // groupFetchAllParticipating already returns participants in 'participants' field
                                        if (g.participants && g.participants.length > 0) {
                                            console.log(`[${this.userId}] Syncing ${g.participants.length} members for group ${g.subject}`);
                                            await db.syncGroupMembers(g.id, g.participants, store); // Pass store
                                        } else {
                                            console.log(`[${this.userId}] No participants found for group ${g.subject} (ID: ${g.id})`);
                                            // Try fetching metadata explicitly if participants are missing
                                            try {
                                                const metadata = await this.sock.groupMetadata(g.id);
                                                if (metadata.participants) {
                                                    console.log(`[${this.userId}] Fetched metadata: ${metadata.participants.length} members.`);
                                                    await db.syncGroupMembers(g.id, metadata.participants, store); // Pass store
                                                }
                                            } catch (metaErr) {
                                                console.warn(`[${this.userId}] Failed to fetch metadata for ${g.id}:`, metaErr);
                                            }
                                        }
                                    } catch (e) {
                                        console.error(`Error syncing members for ${g.id}:`, e);
                                    }
                                }
                                console.log(`[${this.userId}] Member sync completed.`);
                            })();
                        } else {
                            console.log(`[${this.userId}] Skipping member sync (Not Admin).`);
                        }

                        // 3. Update Session Status
                        const payload = { status: 'connected', qr_code: null, phone_number: phone };
                        socket.emit('session_status', { userId: this.userId, ...payload });
                        
                        console.log(`[${this.userId}] Updating DB status to Connected (Phone: ${phone})...`);
                        const { error } = await db.updateSession(this.userId, payload);
                        
                        if (error) console.error(`[${this.userId}] Failed to update session status:`, error);
                        else console.log(`[${this.userId}] DB updated: Connected.`);

                    } catch (err) {
                        console.error(`[${this.userId}] Error in connection open handler:`, err);
                    }
                }

                if (connection === 'close') {
                    this.connectionState = 'close';
                    // If manually stopped, do NOT reconnect or restart
                    if (this.isStopped) {
                        console.log(`[${this.userId}] Session stopped manually. No reconnect.`);
                        return;
                    }

                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log(`[${this.userId}] Connection closed. Reconnecting: ${shouldReconnect}`);

                    if (shouldReconnect) {
                        if (this.reconnectAttempts < 5) {
                            this.reconnectAttempts++;
                            setTimeout(() => this.start(), 2000); // Fast reconnect
                        } else {
                            console.log(`[${this.userId}] Too many reconnect attempts.`);
                            this.stop();
                        }
                    } else {
                        // Logged out or Auth Failure (401)
                        console.log(`[${this.userId}] Logged out. Cleaning session...`);
                        
                        // Clean DB Groups
                        await db.clearUserGroups(this.userId);
                        
                        await this.stop();
                        await this.clearSession(); // Delete corrupted files
                        
                        // AUTO RESTART FOR NEW QR (Only if NOT manually stopped)
                        if (!this.isStopped) {
                            this.isInitializing = false; 
                            setTimeout(() => this.start(), 1000);
                        }
                    }
                    
                    if (!shouldReconnect) {
                         // Don't mark as disconnected yet, we are trying to recover a new QR
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;

                for (const msg of messages) {
                    if (!msg.message) continue;
                    
                    // Basic processing
                    const isFromMe = msg.key.fromMe;
                    const remoteJid = msg.key.remoteJid;
                    const content = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

                    // IGNORE STATUS UPDATES
                    if (remoteJid === 'status@broadcast') return;

                    console.log(`[${this.userId}] New Message Raw: JID=${remoteJid}, Content=${content}`);

                    // --- ECHO PREVENTION FOR OUTBOUND MESSAGES ---
                    // If message is from me, check if it was recently sent via API to avoid duplication
                    if (isFromMe) {
                        // Check for recent outbound message with same content in DB
                        // We check pending or sent messages created in last 10 seconds
                        // Since we don't have the exact WA ID yet in DB for pending messages, we match by content & recipient
                        const { data: recentEcho } = await db.client
                            .from('messages')
                            .select('id')
                            .eq('direction', 'outbound')
                            .eq('content', content) // Content match
                            //.eq('sender_phone', senderPhone) // Recipient match (sender_phone is recipient for outbound)
                            .gt('created_at', new Date(Date.now() - 15000).toISOString()) // Last 15 seconds
                            .limit(1);
                        
                        if (recentEcho && recentEcho.length > 0) {
                            console.log(`[${this.userId}] Skipping Echo Message (Already in DB): ${content}`);
                            return;
                        }
                    }

                    // --- MASTER SESSION FILTER ---
                    let groupId = null;
                    let isMasterForThisGroup = true; 

                    // 1. Try to find the group in DB by JID (Works for both Groups @g.us and DMs @s.whatsapp.net)
                    const { data: group } = await db.client
                        .from('chat_groups')
                        .select('id, created_by, name')
                        .eq('group_jid', remoteJid) // Exact match for JID
                        .single();
                    
                    if (group) {
                        groupId = group.id;
                        console.log(`[${this.userId}] Chat Matched: ${group.name} (ID: ${group.id})`);
                        
                        const masterId = group.created_by;
                        
                        // Check if Master is Online
                        const masterSession = sessions.get(masterId);
                        const isMasterOnline = masterSession && masterSession.connectionState === 'open';

                        if (this.userId === masterId) {
                            // I am the owner/master
                            isMasterForThisGroup = true;
                        } else if (!isMasterOnline) {
                            // Failover
                            console.log(`[${this.userId}] Taking over message saving for '${group.name}' (Master Offline)`);
                            isMasterForThisGroup = true;
                        } else {
                            // Master is online.
                            // TEMPORARY FIX: Always save to ensure message delivery
                            console.log(`[${this.userId}] Saving anyway to prevent data loss. (Master: ${masterId})`);
                            isMasterForThisGroup = true;
                        }
                    } else {
                        // Not found in DB
                        if (remoteJid.endsWith('@g.us')) {
                             // CRITICAL: Only Admins can have "orphan" groups (unsynced groups).
                             // Employees should NEVER process messages from groups that are not in DB (personal groups).
                             if (this.userRole === 'admin') {
                                 console.warn(`[${this.userId}] Warning: Group ${remoteJid} not found in DB. Saving as Admin.`);
                                 isMasterForThisGroup = true; // Save as orphan (Admin only)
                             } else {
                                 // console.log(`[${this.userId}] Ignoring message from unsynced group ${remoteJid} (User not Admin).`);
                                 return; // SKIP processing completely
                             }
                        } else {
                             console.log(`[${this.userId}] DM from ${remoteJid}. Creating/Fetching DM Group...`);
                             
                             // Try to find name in store
                             let contactName = null;
                             if (store && store.contacts[remoteJid]) {
                                 contactName = store.contacts[remoteJid].name || store.contacts[remoteJid].notify;
                             }

                             // Ensure DM Group exists
                             const dmGroupId = await db.ensureDMGroup(remoteJid, contactName, this.userId);
                             
                             if (dmGroupId) {
                                 groupId = dmGroupId;
                                 console.log(`[${this.userId}] Linked DM to Group ID: ${groupId}`);
                                 
                                 // Also sync members so it appears in the list
                                 const phone = remoteJid.split('@')[0];
                                 await db.client.from('chat_group_members').upsert({
                                     group_id: groupId,
                                     phone: phone,
                                     name: contactName || phone,
                                     created_at: new Date().toISOString()
                                 }, { onConflict: 'group_id,phone' });
                             }
                             
                             isMasterForThisGroup = true;
                        }
                    }

                    if (!isMasterForThisGroup) {
                        // Skip logging and saving if this session isn't the primary owner of this group
                        // This prevents duplicate messages in DB and terminal clutter
                        return; 
                    }

                    console.log(`[${this.userId}] New Message: ${content}`);

                    // --- CORRECT SENDER IDENTIFICATION ---
                    let senderPhone = null;
                    if (isFromMe) {
                        senderPhone = this.sock.user.id.split(':')[0].split('@')[0];
                    } else {
                        if (remoteJid.endsWith('@g.us')) {
                            // In groups, the sender is in msg.key.participant
                            const participant = msg.key.participant || msg.participant;
                            senderPhone = participant ? participant.split(':')[0].split('@')[0] : remoteJid.split('@')[0];
                        } else {
                            senderPhone = remoteJid.split(':')[0].split('@')[0];
                        }
                    }
                    
                    const senderName = msg.pushName || null;

                    // --- INBOUND ECHO PREVENTION ---
                    // If message is inbound (!isFromMe), it might be an echo of a message sent via API 
                    // by another session (e.g. Admin sending on behalf of Employee).
                    // If we have a recent OUTBOUND message in this group with SAME content, ignore this inbound.
                    if (!isFromMe && groupId) {
                         const { data: recentOutbound } = await db.client
                            .from('messages')
                            .select('id')
                            .eq('group_id', groupId)
                            .eq('direction', 'outbound')
                            .eq('content', content)
                            .gt('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
                            .limit(1);

                         if (recentOutbound && recentOutbound.length > 0) {
                             console.log(`[${this.userId}] Skipping Inbound Echo (Matched Outbound in DB): ${content}`);
                             return;
                         }
                    }

                    // 1. Emit to Socket (Instant UI update)
                    socket.emit('new_message', {
                        userId: this.userId,
                        message: { ...msg, group_id: groupId, sender_phone: senderPhone }
                    });

                    console.log(`[${this.userId}] Saving Message -> Group: ${groupId}, Sender: ${senderPhone}, Content: ${content}`);

                    // 2. Save to DB
                    const { data: savedMsg, error: saveErr } = await db.saveMessage({
                        user_id: this.userId,
                        group_id: groupId,
                        direction: isFromMe ? 'outbound' : 'inbound',
                        sender_phone: senderPhone,
                        sender_name: senderName,
                        content: content,
                        status: 'received'
                    });

                    if (saveErr) {
                        console.error(`[${this.userId}] Failed to save message to DB:`, saveErr.message);
                    } else {
                        console.log(`[${this.userId}] Message saved to DB successfully!`);
                    }
                }
            });

        } catch (error) {
            console.error(`[${this.userId}] Error starting session:`, error);
        } finally {
            this.isInitializing = false;
        }
    }

    async stop() {
        try {
            this.isStopped = true; // Mark as manually stopped
            
            if (this.sock) {
                // CRITICAL: Remove 'creds.update' listener to prevent saving old credentials 
                // while we are trying to delete them.
                this.sock.ev.removeAllListeners('creds.update');
                
                // Try to logout to invalidate session on server
                try {
                    await this.sock.logout();
                    console.log(`[${this.userId}] Logout called.`);
                } catch (err) {
                    // Ignore logout error (e.g. if already disconnected)
                }

                this.sock.end(undefined);
                this.sock = null;
            }
            // FORCE DELETE SESSION FOLDER TO PREVENT AUTO-RECONNECT
            await this.clearSession();
        } catch (e) {
            console.error('Error stopping session:', e);
        }
    }

    async clearSession() {
        try {
            // Delete CURRENT session path if it exists
            if (this.currentSessionPath) {
                 console.log(`[${this.userId}] Clearing current session files at: ${this.currentSessionPath}`);
                 if (fs.existsSync(this.currentSessionPath)) {
                    fs.rmSync(this.currentSessionPath, { recursive: true, force: true });
                    console.log(`[${this.userId}] Current session files deleted.`);
                 }
                 this.currentSessionPath = null;
            } else {
                // Fallback: Try to delete ANY session folder for this user just in case
                await this.cleanupOldSessions();
            }

            // 4. Also clear store for this user if needed (store is global here, but we can filter)
            // Ideally we'd have per-session stores but global is ok for small scale
        } catch (err) {
            console.error(`[${this.userId}] Error clearing session:`, err);
        }
    }

    async cleanupOldSessions() {
        try {
            const files = fs.readdirSync(SESSIONS_DIR);
            const userFiles = files.filter(f => f.startsWith(`session-${this.userId}-`) || f === `session-${this.userId}` || f === this.userId); // handle legacy names too
            
            for (const file of userFiles) {
                const fullPath = path.join(SESSIONS_DIR, file);
                console.log(`[${this.userId}] Cleanup: Deleting old session ${file}`);
                fs.rmSync(fullPath, { recursive: true, force: true });
            }
        } catch (e) {
            console.error(`[${this.userId}] Error cleaning old sessions:`, e);
        }
    }

    async createGroup(subject, participants) {
        if (!this.sock) throw new Error('Session not connected');
        const group = await this.sock.groupCreate(subject, participants);
        return { success: true, gid: group.id, ...group };
    }

    async deleteGroup(jid) {
        if (!this.sock) throw new Error('Session not connected');
        // WhatsApp doesn't have a direct "delete group" for admins in one go if they created it?
        // Usually you have to remove participants, then leave.
        // For now, let's try leave.
        await this.sock.groupLeave(jid);
        return { success: true };
    }

    async sendMessage(jid, text) {
        if (!this.sock) throw new Error('Session not connected');
        // Ensure JID format
        if (!jid.includes('@')) jid = jid + '@s.whatsapp.net';
        
        await this.sock.sendMessage(jid, { text });
    }

    async addParticipant(jid, participants) {
        if (!this.sock) throw new Error('Session not connected');
        
        // 1. Check if bot is admin
        const isAdmin = await this.isBotAdmin(jid);
        if (!isAdmin) {
            throw new Error('Bot bu grupta yetkili (admin) değil. Üye ekleyemez.');
        }

        const formatted = participants.map(p => p.includes('@') ? p : p + '@s.whatsapp.net');
        console.log(`[${this.userId}] Attempting to add participants:`, formatted);
        const results = await this.sock.groupParticipantsUpdate(jid, formatted, 'add');
        
        // results is an array of objects: { jid: string, status: string, content: any }
        // Status 200 = Success, 403 = Privacy settings, 408 = Timeout, 409 = Already in group
        console.log(`[${this.userId}] Add member results:`, JSON.stringify(results));
        
        const failure = results.find(r => r.status !== '200' && r.status !== '409');
        if (failure) {
            console.error(`[${this.userId}] Member addition failed for ${failure.jid}: Status ${failure.status}`);
            throw new Error(`Üye eklenemedi (Hata Kodu: ${failure.status}). Kişinin gizlilik ayarları kapalı olabilir.`);
        }

        return results;
    }

    async removeParticipant(jid, participants) {
        if (!this.sock) throw new Error('Session not connected');
        
        const isAdmin = await this.isBotAdmin(jid);
        if (!isAdmin) {
            throw new Error('Bot bu grupta yetkili (admin) değil. Üye çıkaramaz.');
        }

        const formatted = participants.map(p => p.includes('@') ? p : p + '@s.whatsapp.net');
        return await this.sock.groupParticipantsUpdate(jid, formatted, 'remove');
    }

    async isBotAdmin(jid) {
        if (!this.sock) return false;
        
        let metadata = null;
        let attempts = 0;
        
        // Retry logic for metadata (sometimes fails immediately after group creation)
        while (attempts < 3) {
            try {
                metadata = await this.sock.groupMetadata(jid);
                break; 
            } catch (e) {
                attempts++;
                if (attempts >= 3) {
                    console.error(`[Admin Check] [${this.userId}] Final attempt to fetch metadata failed for ${jid}:`, e.message);
                    return false;
                }
                console.warn(`[Admin Check] [${this.userId}] Metadata fetch attempt ${attempts} failed for ${jid}, retrying in 1s...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        try {
            const myJid = this.sock.user.id;
            
            // Log participants for debugging
            console.log(`[Admin Check] [${this.userId}] Group: ${jid}, My JID: ${myJid}`);
            // console.log(`[Admin Check] [${this.userId}] Participants Count: ${metadata.participants.length}`);
            
            const me = metadata.participants.find(p => areJidsSameUser(p.id, myJid));
            
            if (!me) {
                console.warn(`[Admin Check] [${this.userId}] Bot is NOT a participant in group ${jid}. Available participants:`, metadata.participants.map(p => p.id).join(', '));
                return false;
            }

            const isAdmin = me.admin === 'admin' || me.admin === 'superadmin';
            if (!isAdmin) {
                console.warn(`[Admin Check] [${this.userId}] Bot found but is NOT admin in ${jid}. Role: ${me.admin}`);
            } else {
                console.log(`[Admin Check] [${this.userId}] Bot is admin in ${jid} (Role: ${me.admin})`);
            }

            return isAdmin;
        } catch (e) {
            console.error(`[Admin Check] [${this.userId}] Error processing metadata for ${jid}:`, e.message);
            return false;
        }
    }
}

// Session Manager Singleton
const sessions = new Map();

module.exports = {
    getSession: (userId) => sessions.get(userId),
    startSession: async (userId, forceClear = false) => {
        let session = sessions.get(userId);
        if (!session) {
            session = new BotSession(userId);
            sessions.set(userId, session);
        }
        await session.start(forceClear);
        return session;
    },
    stopSession: async (userId) => {
        const session = sessions.get(userId);
        if (session) {
            await session.stop();
            sessions.delete(userId);
        }
    },
    getAllSessions: () => Array.from(sessions.keys())
};

// --- AUTO CLEANUP TASK (Task 4) ---
// Deletes messages older than 2 days to reduce DB load
setInterval(async () => {
    console.log('[Cleanup] Running auto-delete for old messages (>2 days)...');
    try {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const { error, count } = await db.client
            .from('messages')
            .delete({ count: 'exact' })
            .lt('created_at', twoDaysAgo);
            
        if (error) console.error('[Cleanup] Error:', error);
        else console.log(`[Cleanup] Deleted ${count || 'some'} old messages.`);
    } catch (err) {
        console.error('[Cleanup] Exception:', err);
    }
}, 12 * 60 * 60 * 1000); // Run every 12 hours

// Run once on startup after 1 minute
setTimeout(async () => {
     console.log('[Cleanup] Running initial cleanup...');
     try {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await db.client.from('messages').delete().lt('created_at', twoDaysAgo);
        if (error) console.error('[Cleanup] Initial Error:', error);
        
        // Also clean up bad groups
        await db.cleanupBadGroups();
        
     } catch (e) { console.error('[Cleanup] Initial Exception:', e); }
}, 60 * 1000);
