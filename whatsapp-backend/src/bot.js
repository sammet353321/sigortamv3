const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const db = require('./db');
const fs = require('fs');
const qrcode = require('qrcode');
const makeInMemoryStore = require('../simple_store');

// Initialize Store
const store = makeInMemoryStore();
store.readFromFile('./baileys_store_multi.json');
setInterval(() => {
    store.writeToFile('./baileys_store_multi.json');
}, 10_000);

const sessions = new Map();
const sessionRetries = new Map(); // Track connection retries
const MAX_RETRIES = 10;
const RETRY_DELAY = 5000;

// Helper: Normalize JID (Handle LIDs)
const getPhoneFromJid = (jid) => {
    if (!jid) return null;
    if (jid.includes('@lid')) {
        const contact = store.contacts[jid];
        if (contact && contact.id && !contact.id.includes('@lid')) {
            return contact.id.split('@')[0];
        }
    }
    return jidNormalizedUser(jid).split('@')[0].split(':')[0];
};

async function startSock(userId, socketIO) {
    if (sessions.has(userId)) return sessions.get(userId);

    const { state, saveCreds } = await useMultiFileAuthState(`auth_info_multi/${userId}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`Starting session for ${userId} with v${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, 
        auth: state,
        browser: ["Sigorta CRM", "Chrome", "1.0.0"],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        keepAliveIntervalMs: 30_000, // Keep connection alive every 30s
        connectTimeoutMs: 60_000,    // Wait up to 60s for connection
        retryRequestDelayMs: 2000,   // Retry requests after 2s
        getMessage: async (key) => {
            return { conversation: 'hello' };
        }
    });

    store?.bind(sock.ev);

    // --- Message Processing Logic (Extracted) ---
    const processMessage = async (msg) => {
         // CHECK 1: Is content empty?
         if (!msg.message) return;

         // CHECK 2: Is it status?
         if (msg.key.remoteJid === 'status@broadcast') return;

         try {
            const remoteJid = msg.key.remoteJid;
            
            // 2. Resolve Group ID
            let groupId = null;
            const isGroup = remoteJid.endsWith('@g.us');
            
            if (isGroup) {
                groupId = await db.getGroupByJid(remoteJid);
                if (!groupId) {
                     let subject = 'Bilinmeyen Grup';
                     try {
                         const meta = await sock.groupMetadata(remoteJid);
                         subject = meta.subject;
                     } catch (e) {}
                     groupId = await db.ensureGroup(remoteJid, subject);
                }
            } else {
                 let contactName = remoteJid.split('@')[0];
                 try {
                     const contact = store.contacts[remoteJid];
                     if (contact) {
                        contactName = contact.name || contact.notify || contact.verifiedName || contactName;
                     }
                 } catch(e) {}
                 groupId = await db.ensureDMGroup(remoteJid, contactName, userId);
            }

            if (!groupId) return;

            // 3. Resolve Sender
            const participant = isGroup ? (msg.key.participant || msg.participant) : remoteJid;
            const normalizedSenderJid = jidNormalizedUser(participant);
            const senderPhone = getPhoneFromJid(normalizedSenderJid);
            
            // Self-message detection (Enhanced)
            const myJid = jidNormalizedUser(sock.user?.id);
            const myPhone = getPhoneFromJid(myJid);
            
            // Normalize for comparison (remove country code prefix if needed, or keep last 10 digits)
            const cleanSender = senderPhone ? senderPhone.slice(-10) : '';
            const cleanMyPhone = myPhone ? myPhone.slice(-10) : '';

            const isFromMe = msg.key.fromMe || (cleanSender && cleanMyPhone && cleanSender === cleanMyPhone);

            let senderName = senderPhone;
            if (!isFromMe) {
                const dbName = await db.getMemberName(groupId, senderPhone);
                if (dbName) senderName = dbName;
                else if (msg.pushName) senderName = msg.pushName;
            } else {
                senderName = 'Siz';
            }

            // 4. Extract Content
            // Filter out metadata keys to find the actual message type
            const allKeys = Object.keys(msg.message);
            const ignoredKeys = ['messageContextInfo', 'senderKeyDistributionMessage'];
            const validKeys = allKeys.filter(k => !ignoredKeys.includes(k));

            if (validKeys.length === 0) {
                // If only metadata exists (e.g. key distribution), ignore the message
                return;
            }

            const msgType = validKeys[0];
            
            let content = '';
            let type = 'text';
            let mediaUrl = null;
            let quotedMessageId = null;

            const messageContent = msg.message[msgType];
            
            // Check for contextInfo in the main message OR inside the specific message type
            const contextInfo = msg.message.messageContextInfo || messageContent?.contextInfo;
            if (contextInfo?.stanzaId) {
                quotedMessageId = contextInfo.stanzaId;
            }

            // Helper for media download with retry
            const downloadMediaWithRetry = async (msg, maxRetries = 5) => {
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        const buffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            { },
                            { 
                                logger: pino({ level: 'silent' }),
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );
                        return buffer;
                    } catch (err) {
                        console.log(`[Media] Download attempt ${i + 1}/${maxRetries} failed: ${err.message}`);
                        if (i === maxRetries - 1) throw err;
                        await new Promise(r => setTimeout(r, 2000 * (i + 1))); 
                    }
                }
            };

            if (msgType === 'conversation') {
                content = msg.message.conversation;
            } else if (msgType === 'extendedTextMessage') {
                content = msg.message.extendedTextMessage.text;
            } else if (msgType === 'imageMessage') {
                type = 'image';
                content = msg.message.imageMessage.caption || 'Resim';
                 try {
                    const buffer = await downloadMediaWithRetry(msg);
                    const fileName = `${msg.key.id}.jpg`;
                    const filePath = `received-media/${fileName}`;
                    const { error: uploadError } = await db.client.storage
                        .from('chat-media')
                        .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: true });
                    if (!uploadError) {
                        const { data: { publicUrl } } = db.client.storage.from('chat-media').getPublicUrl(filePath);
                        mediaUrl = publicUrl;
                    }
                } catch (e) { console.error('[Media] Image download failed', e.message); }
            } else if (msgType === 'videoMessage') {
                type = 'video';
                content = msg.message.videoMessage.caption || 'Video';
            } else if (msgType === 'documentMessage' || msgType === 'documentWithCaptionMessage') {
                type = 'document';
                
                // Handle both simple document and document with caption
                const docMsg = msg.message[msgType].message ? msg.message[msgType].message.documentMessage : msg.message[msgType];
                
                content = docMsg.fileName || msg.message[msgType].caption || 'Dosya';
                
                try {
                    const buffer = await downloadMediaWithRetry(msg);
                    const fileName = docMsg.fileName || `${msg.key.id}.pdf`;
                    // Ensure unique path but keep extension
                    const ext = fileName.split('.').pop();
                    const uniquePath = `received-documents/${msg.key.id}_${Date.now()}.${ext}`;
                    const mimeType = docMsg.mimetype || 'application/pdf';

                    const { error: uploadError } = await db.client.storage
                        .from('chat-media')
                        .upload(uniquePath, buffer, { contentType: mimeType, upsert: true });
                        
                    if (!uploadError) {
                        const { data: { publicUrl } } = db.client.storage.from('chat-media').getPublicUrl(uniquePath);
                        mediaUrl = publicUrl;
                    } else {
                        console.error('[Media] Upload failed:', uploadError.message);
                    }
                } catch (e) { console.error('[Media] Document download failed', e.message); }
            } else if (msgType === 'audioMessage') {
                type = 'audio';
                content = 'Ses Kaydı';
            } else if (msgType === 'stickerMessage') {
                type = 'sticker';
                content = 'Çıkartma';
            } else if (msgType === 'reactionMessage') {
                // Ignore reactions to avoid polluting chat with "Unsupported Message"
                return; 
            } else if (msgType === 'pollCreationMessage' || msgType === 'pollUpdateMessage') {
                // Ignore polls for now
                return;
            } else {
                 if (type === 'text') {
                    const rawContent = JSON.stringify(msg.message);
                    if (rawContent.length >= 50) {
                        content = `[Desteklenmeyen Mesaj Tipi: ${msgType}]`;
                    } else {
                        return; // Skip empty/junk
                    }
                 }
            }

            // 5. Save to DB
            // Ensure timestamp is a number (handle Long or Number)
            let timestamp = msg.messageTimestamp;
            if (typeof timestamp === 'object' && timestamp !== null) {
                timestamp = timestamp.toNumber ? timestamp.toNumber() : (timestamp.low || Date.now()/1000);
            }
            if (!timestamp) timestamp = Date.now() / 1000;

            const messageData = {
                whatsapp_message_id: msg.key.id,
                user_id: userId,
                group_id: groupId,
                sender_phone: senderPhone,
                sender_name: senderName,
                direction: isFromMe ? 'outbound' : 'inbound',
                type: type,
                content: content,
                media_url: mediaUrl,
                quoted_message_id: quotedMessageId,
                status: isFromMe ? 'sent' : 'received',
                created_at: new Date(timestamp * 1000).toISOString() // Use actual message time!
            };

            const { error } = await db.saveMessage(messageData);
            
            if (!error && socketIO) {
                socketIO.to(`group-${groupId}`).emit('new_message', messageData);
                socketIO.to(`user-${userId}`).emit('new_message', messageData);
            }
        } catch (err) {
            console.error('[ProcessMessage] Error:', err);
        }
    };

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(`QR Generated for ${userId}`);
            const qrDataUrl = await qrcode.toDataURL(qr);
            await db.updateSession(userId, { status: 'scanning', qr_code: qrDataUrl });
            if (socketIO) socketIO.emit('qr_code', { userId, qr: qrDataUrl });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            const error = lastDisconnect.error;
            const isBadMac = error?.message?.includes('Bad MAC') || error?.toString().includes('Bad MAC');

            console.log(`Connection closed for ${userId}. Reconnecting: ${shouldReconnect}. Error: ${error?.message}`);
            
            await db.updateSession(userId, { status: 'disconnected', qr_code: null });
            
            // CRITICAL FIX: Remove the closed session from memory so startSock creates a NEW one
            sessions.delete(userId);
            
            if (isBadMac) {
                console.error(`[CRITICAL] Bad MAC error detected for ${userId}. Corrupted session. Deleting data...`);
                sessionRetries.delete(userId);
                try { 
                    fs.rmSync(`auth_info_multi/${userId}`, { recursive: true, force: true }); 
                    console.log(`[CRITICAL] Deleted corrupted session data for ${userId}`);
                } catch(e) {
                    console.error(`[CRITICAL] Failed to delete session data: ${e.message}`);
                }
                // Do NOT reconnect automatically. Let the user re-scan.
                return;
            }

            if (shouldReconnect) {
                const retries = sessionRetries.get(userId) || 0;
                if (retries < MAX_RETRIES) {
                    sessionRetries.set(userId, retries + 1);
                    console.log(`Retrying connection for ${userId} (${retries + 1}/${MAX_RETRIES})...`);
                    setTimeout(() => startSock(userId, socketIO), RETRY_DELAY);
                } else {
                    console.log(`Max retries reached for ${userId}. Stopping.`);
                    sessionRetries.delete(userId);
                }
            } else {
                console.log(`Session logged out for ${userId}. Deleting session.`);
                try { fs.rmSync(`auth_info_multi/${userId}`, { recursive: true, force: true }); } catch(e) {}
            }
        } else if (connection === 'open') {
            console.log(`Connection opened for ${userId}`);
            const userJid = sock.user.id;
            const phoneNumber = userJid.split(':')[0].split('@')[0];
            sessionRetries.set(userId, 0);
            await db.updateSession(userId, { status: 'connected', phone_number: phoneNumber, qr_code: null });
            if (socketIO) socketIO.emit('connection_open', { userId, phone: phoneNumber });
            syncGroupsAndMembers(sock, userId);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // MESSAGE HANDLING
    sock.ev.on('messages.upsert', async (m) => {
        console.log(`\n[Upsert] Count: ${m.messages.length}, Type: ${m.type}`);
        for (const msg of m.messages) {
             await processMessage(msg);
        }
    });

    // HISTORY SYNC HANDLING
    sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
        console.log(`[History] Receiving history. Count: ${messages.length}, Latest: ${isLatest}`);
        for (const msg of messages) {
            // Process historical messages just like new ones
            // Using a slight delay to prevent DB choking if thousands
            await processMessage(msg);
        }
        console.log('[History] Sync complete.');
    });

    sessions.set(userId, sock);
    return sock;
}

// Sync Logic
async function syncGroupsAndMembers(sock, userId) {
    try {
        console.log(`[Sync] Fetching groups for ${userId}...`);
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups);
        const groupUuidMap = await db.syncGroups(userId, groupList);
        const syncPromises = groupList.map(async (group) => {
            const uuid = groupUuidMap[group.id];
            if (uuid) await db.syncGroupMembers(uuid, group.participants, store);
        });
        await Promise.all(syncPromises);
        console.log(`[Sync] Complete for ${userId}`);
    } catch (err) {
        console.error('Error in sync:', err);
    }
}

module.exports = { 
    startSession: startSock,
    startSock, 
    sessions,
    getSession: (userId) => sessions.get(userId),
    stopSession: async (userId) => {
        try {
            const sock = sessions.get(userId);
            if (sock) {
                sock.ev.removeAllListeners('connection.update'); 
                sock.end(undefined);
                sessions.delete(userId);
            }
        } catch (err) {
            console.error(`Error stopping session for ${userId}:`, err);
        }
    },
    getAllSessions: () => Array.from(sessions.keys()),
    syncGroups: syncGroupsAndMembers,
    deleteSessionData: async (userId) => {
        try {
            const path = `auth_info_multi/${userId}`;
            if (fs.existsSync(path)) {
                fs.rmSync(path, { recursive: true, force: true });
                console.log(`[Session] Deleted session data for ${userId}`);
            }
        } catch (err) {
            console.error(`[Session] Error deleting data for ${userId}:`, err);
        }
    },
    getStore: () => store
};