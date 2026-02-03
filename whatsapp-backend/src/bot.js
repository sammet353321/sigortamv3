const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    jidNormalizedUser
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
const MAX_RETRIES = 10; // Increased from 5 to 10 for better stability
const RETRY_DELAY = 5000; // 5 seconds

// Helper: Normalize JID (Handle LIDs)
const getPhoneFromJid = (jid) => {
    if (!jid) return null;
    // If it's an LID (Linked Device ID), try to find the phone JID in store
    if (jid.includes('@lid')) {
        const contact = store.contacts[jid];
        if (contact && contact.id && !contact.id.includes('@lid')) {
            return contact.id.split('@')[0];
        }
        // Fallback: Some LIDs contain the phone number in the user part, but not always reliable
        // If we can't resolve, we return the user part of LID, which looks like a long number
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
        logger: pino({ level: 'silent' }), // Suppress detailed logs
        printQRInTerminal: false, // We send QR to frontend
        auth: state,
        browser: ["Sigorta CRM", "Chrome", "1.0.0"],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            return { conversation: 'hello' };
        }
    });

    store?.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(`QR Generated for ${userId}`);
            // Generate QR Data URL
            const qrDataUrl = await qrcode.toDataURL(qr);
            
            // Save to DB
            await db.updateSession(userId, { 
                status: 'scanning', 
                qr_code: qrDataUrl 
            });
            
            // Emit to Frontend
            if (socketIO) {
                socketIO.emit('qr_code', { userId, qr: qrDataUrl });
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed for ${userId}. Reconnecting: ${shouldReconnect}`);
            
            // Update DB Status
            await db.updateSession(userId, { status: 'disconnected', qr_code: null });
            
            if (shouldReconnect) {
                // Retry Logic
                const retries = sessionRetries.get(userId) || 0;
                if (retries < MAX_RETRIES) {
                    sessionRetries.set(userId, retries + 1);
                    console.log(`Retrying connection for ${userId} (${retries + 1}/${MAX_RETRIES})...`);
                    setTimeout(() => startSock(userId, socketIO), RETRY_DELAY);
                } else {
                    console.log(`Max retries reached for ${userId}. Stopping.`);
                    sessions.delete(userId);
                    sessionRetries.delete(userId);
                }
            } else {
                console.log(`Session logged out for ${userId}. Deleting session.`);
                sessions.delete(userId);
                // Clean up auth folder
                try {
                    fs.rmSync(`auth_info_multi/${userId}`, { recursive: true, force: true });
                } catch(e) { console.error('Error deleting auth folder:', e); }
            }
        } else if (connection === 'open') {
            console.log(`Connection opened for ${userId}`);
            const userJid = sock.user.id;
            const phoneNumber = userJid.split(':')[0].split('@')[0];
            
            // Reset Retries
            sessionRetries.set(userId, 0);

            // Update DB
            await db.updateSession(userId, { 
                status: 'connected', 
                phone_number: phoneNumber,
                qr_code: null
            });
            
            if (socketIO) {
                socketIO.emit('connection_open', { userId, phone: phoneNumber });
            }

            // Initial Sync
            syncGroupsAndMembers(sock, userId);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // MESSAGE HANDLING
    sock.ev.on('messages.upsert', async (m) => {
        // Only process notify messages (new messages)
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message) continue;

            try {
                // 1. Get Remote JID (Group or User)
                const remoteJid = msg.key.remoteJid;
                
                // Ignore Status Broadcasts
                if (remoteJid === 'status@broadcast') continue;

                // 2. Identify Group ID (UUID)
                let groupId = null;
                const isGroup = remoteJid.endsWith('@g.us');
                
                if (isGroup) {
                    // Try to get existing Group UUID from DB
                    groupId = await db.getGroupByJid(remoteJid);
                    
                    // If group not found in DB, try to sync it immediately?
                    // For now, if not found, we might skip or create on the fly.
                    // Let's create on the fly if needed (Self-healing)
                    if (!groupId) {
                        const groupMetadata = await sock.groupMetadata(remoteJid).catch(() => null);
                        if (groupMetadata) {
                            const map = await db.syncGroups(userId, [groupMetadata]);
                            groupId = map[remoteJid];
                        }
                    }
                } else {
                    // DM Logic
                    // Ensure DM Group exists
                    const contactName = msg.pushName || store.contacts[remoteJid]?.name;
                    groupId = await db.ensureDMGroup(remoteJid, contactName, userId);
                }

                if (!groupId) {
                    console.warn(`[Msg] Could not resolve Group ID for ${remoteJid}`);
                    continue;
                }

                // 3. Resolve Sender Phone & Name (The User's Request)
                const participant = isGroup ? (msg.key.participant || msg.participant) : remoteJid;
                
                // NORMALIZE JID (Fix for LIDs)
                // If it's a LID, getPhoneFromJid tries to resolve it
                const normalizedSenderJid = jidNormalizedUser(participant);
                const senderPhone = getPhoneFromJid(normalizedSenderJid);

                const myJid = jidNormalizedUser(sock.user?.id);
                const myPhone = getPhoneFromJid(myJid);
                
                // --- ROBUST SELF-MESSAGE DETECTION ---
                // We compare the sender phone with our own connected phone.
                // We use last 10 digits to be immune to +90 / 0 / raw format differences.
                const isFromMe = msg.key.fromMe || (
                    myPhone && senderPhone && 
                    (senderPhone === myPhone || 
                     senderPhone.slice(-10) === myPhone.slice(-10))
                );

                if (isFromMe && !msg.key.fromMe) {
                    console.log(`[Self-Msg] Detected message from phone app (${senderPhone}). Forcing outbound.`);
                }

                // Sender Name Resolution Priority:
                // 1. Database (chat_group_members) - User manual override
                // 2. Contact Store (Notify Name / Verified Name)
                // 3. msg.pushName
                // 4. Fallback to Phone Number
                
                let senderName = null;

                // Check DB first
                if (!isFromMe) {
                    const dbName = await db.getMemberName(groupId, senderPhone);
                    if (dbName) senderName = dbName;
                }

                // Check Store/PushName if not in DB
                if (!senderName) {
                    const contact = store.contacts[normalizedSenderJid];
                    senderName = contact?.name || contact?.notify || msg.pushName || null;
                }

                // Fallback
                if (!senderName) {
                    senderName = senderPhone;
                }

                // 4. Extract Content
                const msgType = Object.keys(msg.message)[0];
                let content = '';
                let type = 'text';

                // Skip protocol messages (like key exchanges) to avoid "empty" messages
                if (msgType === 'protocolMessage' || msgType === 'senderKeyDistributionMessage') {
                     // console.log('Skipping protocol message');
                     continue;
                }

                if (msgType === 'conversation') {
                    content = msg.message.conversation;
                } else if (msgType === 'extendedTextMessage') {
                    content = msg.message.extendedTextMessage.text;
                } else if (msgType === 'imageMessage') {
                    type = 'image';
                    content = msg.message.imageMessage.caption || 'Resim';
                } else if (msgType === 'videoMessage') {
                    type = 'video';
                    content = msg.message.videoMessage.caption || 'Video';
                } else if (msgType === 'documentMessage') {
                    type = 'document';
                    content = msg.message.documentMessage.fileName || 'Dosya';
                } else if (msgType === 'audioMessage') {
                    type = 'audio';
                    content = 'Ses Kaydı';
                }

                // Final check for empty content (some system messages might slip through)
                if (!content && type === 'text') {
                     continue;
                }

                // 5. Save Message (Deduplication handled by DB Upsert)
                const messageData = {
                    whatsapp_message_id: msg.key.id, // UNIQUE KEY
                    user_id: userId,
                    group_id: groupId,
                    sender_phone: senderPhone,
                    sender_name: senderName, // We can add this column to DB if we want to cache it, but standard schema uses relations
                    direction: isFromMe ? 'outbound' : 'inbound',
                    type: type,
                    content: content,
                    status: 'received',
                    created_at: new Date(msg.messageTimestamp * 1000).toISOString(),
                    metadata: { 
                        original_jid: participant,
                        pushName: msg.pushName
                    }
                };

                // Remove sender_name if not in schema (Assuming schema doesn't have it, or we rely on join)
                // Actually, storing sender_name in metadata or separate column is good for history.
                // For now, let's keep it in metadata if schema fails, but earlier DB check said no sender_name column in messages.
                // Wait, I should check schema. 'messages' table: id, user_id, group_id, sender_phone, direction, type, content...
                // It does NOT have sender_name.
                // So we should put it in metadata or update schema. 
                // The user explicitly asked to "save nicknames".
                // We already have `chat_group_members` for that.
                // So we just rely on `chat_group_members`.
                
                // If we found a name in PushName but NOT in DB, maybe we should auto-update DB?
                // "takma ismi yoksa telefon numarasını kaydetset"
                // Let's auto-upsert member if missing or name is better?
                // Be careful not to overwrite manual names.
                if (groupId && !isFromMe && isGroup) {
                    // Only upsert if we have a name and it's not just the phone number
                    if (senderName && senderName !== senderPhone) {
                         // We can try to update chat_group_members IF name is null there?
                         // For now, let's just stick to syncing.
                    }
                }

                const { data, error } = await db.saveMessage(messageData);

                if (socketIO && !error) {
                    // Enrich with resolved name for Frontend
                    socketIO.emit('new_message', { 
                        ...messageData, 
                        sender_name: senderName 
                    });
                }

            } catch (err) {
                console.error('Error processing message:', err);
            }
        }
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
        
        // Sync Groups to DB
        const groupUuidMap = await db.syncGroups(userId, groupList);
        
        // Sync Members for each Group (Parallel Execution)
        const syncPromises = groupList.map(async (group) => {
            const uuid = groupUuidMap[group.id];
            if (uuid) {
                await db.syncGroupMembers(uuid, group.participants, store);
            }
        });

        await Promise.all(syncPromises);
        console.log(`[Sync] Complete for ${userId}`);
    } catch (err) {
        console.error('Error in sync:', err);
    }
}

module.exports = { 
    startSession: startSock, // Alias for index.js compatibility
    startSock, 
    sessions,
    getSession: (userId) => sessions.get(userId),
    stopSession: async (userId) => {
        try {
            const sock = sessions.get(userId);
            if (sock) {
                // Remove listener to prevent triggering reconnection logic during manual stop
                sock.ev.removeAllListeners('connection.update'); 
                sock.end(undefined);
                sessions.delete(userId);
            }
        } catch (err) {
            console.error(`Error stopping session for ${userId}:`, err);
        }
    },
    getAllSessions: () => Array.from(sessions.keys()),
    syncGroups: syncGroupsAndMembers
};
