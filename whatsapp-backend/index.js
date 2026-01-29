const express = require('express');
const cors = require('cors');
const http = require('http');
const config = require('./src/config');
const db = require('./src/db');
const socket = require('./src/socket');
const bot = require('./src/bot');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socket.init(server);

// --- REST API ---
app.get('/', (req, res) => res.send('Modern WhatsApp Bot Service is Running 🚀'));

app.post('/session/start', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('userId required');
    await bot.startSession(userId);
    res.send({ status: 'started' });
});

app.post('/session/stop', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('userId required');
    await bot.stopSession(userId);
    res.send({ status: 'stopped' });
});

app.post('/groups/leave', async (req, res) => {
    const { userId, groupJid } = req.body;
    if (!userId || !groupJid) return res.status(400).send('userId and groupJid required');

    const session = bot.getSession(userId);
    if (!session || !session.sock) {
        return res.status(404).send({ error: 'Session not found or not connected' });
    }

    try {
        console.log(`[API] User ${userId} leaving group ${groupJid}`);
        await session.deleteGroup(groupJid);
        
        // Also delete from DB to ensure sync
        const { error } = await db.client
            .from('chat_groups')
            .delete()
            .eq('group_jid', groupJid); // Use group_jid to match
            
        if (error) {
             console.error('[API] Failed to delete group from DB:', error);
             // Don't fail the request if WA leave succeeded
        }

        res.send({ success: true });
    } catch (err) {
        console.error('[API] Failed to leave group:', err);
        res.status(500).send({ error: err.message });
    }
});

// --- SUPABASE LISTENERS ---

// 1. Listen for Session Commands (Start/Stop via DB)
db.client
    .channel('bot-session-commands')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions' }, async (payload) => {
        const { new: newRec, old: oldRec, eventType } = payload;
        
        if (!newRec) return; // Delete event

        const userId = newRec.user_id;

        // Start/Restart if status is 'scanning'
        if (newRec.status === 'scanning') {
            const currentSession = bot.getSession(userId);
            // If we are 'scanning', it implies we WANT a new QR.
            // Even if a session exists in memory, we should probably kill it and start fresh 
            // IF it's not already scanning.
            
            // Logic:
            // 1. If session exists and is connected -> Stop it, Clear it, Start New.
            // 2. If session exists and is scanning -> Do nothing (already doing it).
            // 3. If no session -> Start New.
            
            if (currentSession) {
                if (currentSession.sock && currentSession.sock.user) {
                     // It's connected but DB says 'scanning'. User wants to switch/re-scan?
                     console.log(`[DB Listener] Force restarting session for ${userId} (Requested New QR)`);
                     await bot.stopSession(userId);
                     await bot.startSession(userId, true); // true = force clear
                } else if (!currentSession.sock && !currentSession.qrCode) {
                     // Not running?
                     await bot.startSession(userId, true);
                }
            } else {
                console.log(`[DB Listener] Starting new session for ${userId}`);
                await bot.startSession(userId, true); // Force clear to ensure fresh QR
            }
        }

        // Stop if disconnected
        if (newRec.status === 'disconnected') {
            console.log(`[DB Listener] Stopping session for ${userId}`);
            await bot.stopSession(userId);
        }
    })
    .subscribe();

// --- GROUP & MESSAGE LISTENERS ---
db.client
    .channel('whatsapp-groups-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups' }, 
    async (payload) => {
        const group = payload.new;
        
        // Handle DELETE event (payload.new is null, use payload.old)
        if (payload.eventType === 'DELETE' && payload.old) {
             const deletedGroupId = payload.old.id;
             console.log(`[DB Sync] Group ${deletedGroupId} deleted from DB.`);
             
             // We need to know who created this group to find the right bot session.
             // Since we only have the ID now, we might need to search active sessions or store this mapping.
             // OR: We can rely on the fact that if a user deletes it, they are likely the owner.
             // But wait, payload.old ONLY has the ID if replica identity is default.
             // We can't easily find the owner.
             
             // WORKAROUND: Iterate all active sessions and try to leave/delete the group.
             // This is not efficient but works for now.
             
             const allSessions = bot.getAllSessions();
             for (const userId of allSessions) {
                 const session = bot.getSession(userId);
                 if (session && session.sock) {
                     try {
                         // Check if this session is part of the group
                         // But we don't know if this group belongs to this session easily without querying WA.
                         // Just try to leave. If not in group, it might throw or ignore.
                         
                         // CAUTION: The 'id' in DB is the WA JID.
                         if (deletedGroupId.includes('@g.us')) {
                             console.log(`[Group Action] User ${userId} leaving group ${deletedGroupId}`);
                             await session.deleteGroup(deletedGroupId);
                         }
                     } catch (e) {
                         // Ignore errors (e.g. not in group)
                     }
                 }
             }
             return;
        }

        if (!group) return;

        // Only process if it is a NEW request to create a WA group
        // We use a specific status or flag? 
        // Or we check if 'group_jid' is missing but 'is_whatsapp_group' is true?
        
        // Let's assume frontend sets status='creating' for new groups to be created on WA
        if (group.status === 'creating' && group.is_whatsapp_group) {
            const ownerId = group.created_by;
            const manager = bot.getSession(ownerId);

            if (manager && manager.sock?.user) {
                console.log(`[Group Action] Creating group '${group.name}' for user ${ownerId}`);
                try {
                    // Create group on WA (empty participants initially)
                    const res = await manager.createGroup(group.name, []); 
                    
                    if (res.success) {
                        // Update DB with real WA ID and active status
                        // We DELETE the temp row and INSERT the new one with WA JID as ID
                        // OR update if we used a temp UUID?
                        // Our schema uses TEXT id. If we used UUID, we swap it.
                        
                        console.log(`[Group Action] Group created! JID: ${res.gid}`);
                        
                        // Update the existing record with the real JID
                        // If ID is PK and we change it, it's tricky.
                        // Best way: Update 'group_jid' column and 'status'='active'
                        
                        await db.client.from('chat_groups')
                            .update({ 
                                group_jid: res.gid, 
                                status: 'active',
                            })
                            .eq('id', group.id);

                        // --- AUTO SYNC OWNER TO MEMBERS LIST ---
                        if (manager.sock?.user?.id) {
                            const ownerPhone = manager.sock.user.id.split(':')[0];
                            console.log(`[Group Action] Adding owner ${ownerPhone} to members list for ${res.gid}`);
                            await db.client.from('chat_group_members').insert({
                                group_id: group.id,
                                phone: ownerPhone,
                                name: 'Yönetici (Kurucu)'
                            });
                        }
                            
                    }
                } catch (err) {
                    console.error(`[Group Action] Failed to create group:`, err);
                    await db.client.from('chat_groups').update({ status: 'failed' }).eq('id', group.id);
                }
            } else {
                console.log(`[Group Action] No active session for user ${ownerId}`);
            }
        }
    })
    .subscribe();

// 2. Listen for Outbound Messages
db.client
    .channel('bot-outbound-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new;
        if (msg.direction === 'outbound' && msg.status === 'pending') {
            console.log(`[DB Listener] Sending message ID: ${msg.id}`);
            
            try {
                let sessionUserId = msg.user_id;
                
                // --- CENTRALIZED SENDING LOGIC ---
                // If message is for a group, we should use the session of the person who created/owns that group
                // This allows employees to send messages through the Manager's WhatsApp.
                if (msg.group_id) {
                    const { data: group } = await db.client
                        .from('chat_groups')
                        .select('created_by')
                        .eq('id', msg.group_id)
                        .single();
                    
                    if (group && group.created_by) {
                        sessionUserId = group.created_by;
                        console.log(`[DB Listener] Routing message through group owner session: ${sessionUserId}`);
                    }
                }

                let session = bot.getSession(sessionUserId);
                
                // --- ON-DEMAND SESSION START ---
                if (!session) {
                    console.log(`[DB Listener] Session not found in memory for ${sessionUserId}. Checking DB status...`);
                    const dbSession = await db.getSession(sessionUserId);
                    if (dbSession && dbSession.status === 'connected') {
                        console.log(`[DB Listener] DB says connected. Waking up session for ${sessionUserId}...`);
                        session = await bot.startSession(sessionUserId);
                        // Wait for actual connection
                        await session.waitForConnection();
                    }
                }

                if (session && session.sock && session.connectionState === 'open') {
                    const jid = msg.group_id || msg.sender_phone;
                    await session.sendMessage(jid, msg.content);
                    
                    await db.updateMessageStatus(msg.id, 'sent');
                    socket.emit('message_status', { id: msg.id, status: 'sent' });
                } else {
                    console.log(`[DB Listener] No active session for ${sessionUserId}`);
                    // Optional: mark as failed if session not found
                    // await db.updateMessageStatus(msg.id, 'failed');
                }
            } catch (err) {
                console.error('Failed to send message:', err);
                await db.updateMessageStatus(msg.id, 'failed');
                socket.emit('message_status', { id: msg.id, status: 'failed' });
            }
        }
    })
    .subscribe();

// 3. Listen for Chat Group Member Changes (Add/Remove from WhatsApp)
db.client
    .channel('chat-group-members-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_members' }, async (payload) => {
        const { eventType, new: newMember, old: oldMember } = payload;
        
        // We need the group JID to perform the action on WA
        const groupId = newMember?.group_id || oldMember?.group_id;
        if (!groupId) return;

        // Fetch group details to get group_jid and owner
        const { data: group } = await db.client
            .from('chat_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (!group || !group.group_jid || !group.is_whatsapp_group) return;

        const session = bot.getSession(group.created_by);
        if (!session || !session.sock) return;

        try {
            if (eventType === 'INSERT') {
                console.log(`[Member Sync] Adding ${newMember.phone} to WA group ${group.group_jid}`);
                await session.addParticipant(group.group_jid, [newMember.phone]);
            } else if (eventType === 'DELETE') {
                console.log(`[Member Sync] Removing ${oldMember.phone} from WA group ${group.group_jid}`);
                await session.removeParticipant(group.group_jid, [oldMember.phone]);
            }
        } catch (err) {
            console.error('[Member Sync] Failed to sync participant:', err.message);
            
            // IF INSERT failed, delete the record from DB so UI reflects that it failed
            if (eventType === 'INSERT') {
                console.log(`[Member Sync] Deleting DB record for ${newMember.phone} due to failure...`);
                await db.client.from('chat_group_members').delete().eq('id', newMember.id);
            }
        }
    })
    .subscribe();

// --- AUTO LOAD SESSIONS ---
async function autoLoadSessions() {
    console.log('[Bot] Checking for connected sessions to auto-load...');
    try {
        const { data: sessions, error } = await db.client
            .from('whatsapp_sessions')
            .select('user_id')
            .eq('status', 'connected');
        
        if (error) throw error;

        if (sessions && sessions.length > 0) {
            console.log(`[Bot] Auto-loading ${sessions.length} sessions...`);
            for (const s of sessions) {
                // We don't await so they load in parallel
                bot.startSession(s.user_id).catch(err => {
                    console.error(`[Bot] Failed to auto-load session for ${s.user_id}:`, err.message);
                });
            }
        } else {
            console.log('[Bot] No active sessions to load.');
        }
    } catch (err) {
        console.error('[Bot] Error in autoLoadSessions:', err.message);
    }
}

// --- START SERVER ---
server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
    autoLoadSessions(); // Run on startup
});
