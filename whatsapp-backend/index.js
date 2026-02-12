const express = require('express');
const cors = require('cors');
const http = require('http');
const config = require('./src/config');
const db = require('./src/db');
const socket = require('./src/socket');
const bot = require('./src/bot');
const multer = require('multer');
const ai = require('./src/ai');

const app = express();
app.use(cors());
app.use(express.json());

// Init AI
ai.initAI(config.geminiApiKey);

// Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

const server = http.createServer(app);
const io = socket.init(server);

// --- SECURITY MIDDLEWARE ---
// Verify API_SECRET for all non-root routes
const authMiddleware = (req, res, next) => {
    // Skip auth for root health check
    if (req.path === '/') return next();

    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== config.apiSecret) {
        console.warn(`[Security] Unauthorized access attempt from ${req.ip} to ${req.path}`);
        return res.status(403).json({ error: 'Unauthorized: Invalid or missing API Secret' });
    }
    next();
};

app.use(authMiddleware);

// --- REST API ---
app.get('/', (req, res) => res.send('Modern WhatsApp Bot Service is Running 🚀'));

app.post('/session/start', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('userId required');
    await bot.startSession(userId, io);
    res.send({ status: 'started' });
});

app.post('/session/stop', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('userId required');
    await bot.stopSession(userId);
    res.send({ status: 'stopped' });
});

/*
app.post('/groups/leave', async (req, res) => {
    // DISABLED BY USER REQUEST to prevent accidental group leaving/deletion
    res.status(403).send({ error: 'Group leaving/deletion is disabled.' });
});
*/
app.post('/groups/leave', async (req, res) => {
    res.status(403).send({ error: 'Group leaving/deletion is disabled by administrator.' });
});

app.post('/groups/sync', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('userId required');

    const session = bot.getSession(userId);
    if (!session) {
        return res.status(404).send({ error: 'Session not found or not connected' });
    }

    try {
        // Run sync in background to prevent timeout
        bot.syncGroups(session, userId)
            .then(async () => {
                console.log(`[API] Sync background task finished for ${userId}`);
                io.emit('sync_complete', { userId });
                // Trigger Supabase Realtime for Frontend
                await db.updateSession(userId, { updated_at: new Date().toISOString() });
            })
            .catch(err => {
                console.error('[API] Sync background task failed:', err);
            });

        res.send({ success: true, message: 'Senkronizasyon başlatıldı. Tamamlandığında liste güncellenecektir.' });
    } catch (err) {
        console.error('[API] Sync failed:', err);
        res.status(500).send({ error: err.message });
    }
});

// --- DASHBOARD PROXY ENDPOINT (Optimized) ---
app.post('/dashboard/stats', async (req, res) => {
    const { employeeId, startDate, endDate, year } = req.body;
    
    if (!employeeId || !startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const client = db.client;
        
        // 1. KPI & Totals (From Optimized Table)
        // We sum up the daily stats for the selected range.
        const { data: statsData, error: statsError } = await client
            .from('daily_employee_stats')
            .select('quote_count, policy_count, total_premium, total_commission')
            .eq('employee_id', employeeId)
            .gte('date', startDate)
            .lte('date', endDate);
            
        if (statsError) throw statsError;
        
        // Calculate Totals in Backend
        let totalQuotes = 0;
        let totalPolicies = 0;
        let totalPremium = 0;
        let totalCommission = 0;
        
        if (statsData) {
            statsData.forEach(row => {
                totalQuotes += row.quote_count || 0;
                totalPolicies += row.policy_count || 0;
                totalPremium += row.total_premium || 0;
                totalCommission += row.total_commission || 0;
            });
        }

        // 2. Yearly Data (From Optimized Table) - 365 rows max
        let yearStats = [];
        if (year) {
            const yearStart = `${year}-01-01`;
            const yearEnd = `${year}-12-31`;
            
            const { data: ys, error: ysError } = await client
                .from('daily_employee_stats')
                .select('date, quote_count, policy_count')
                .eq('employee_id', employeeId)
                .gte('date', yearStart)
                .lte('date', yearEnd);
                
            if (ysError) throw ysError;
            yearStats = ys || [];
        }

        // 3. Breakdowns (From Raw Tables - Only for selected range)
        // Since we don't have JSON columns, we must query raw data for breakdowns.
        // This is acceptable as the range is usually small (days/weeks).
        
        // Quotes Breakdown
        const { data: quoteBreakdownRaw, error: qbError } = await client
            .from('teklifler')
            .select('tur')
            .eq('employee_id', employeeId)
            .gte('tanzim_tarihi', startDate)
            .lte('tanzim_tarihi', endDate);
            
        if (qbError) throw qbError;

        // Policies Breakdown
        const { data: policyBreakdownRaw, error: pbError } = await client
            .from('policeler')
            .select('tur, sirket')
            .eq('employee_id', employeeId)
            .gte('tanzim_tarihi', startDate)
            .lte('tanzim_tarihi', endDate);
            
        if (pbError) throw pbError;

        // 4. Upcoming Renewals
        const today = new Date().toISOString();
        const next30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: renewals } = await client
            .from('policeler')
            .select('id, musteri_adi, plaka, bitis_tarihi, tur')
            .eq('employee_id', employeeId)
            .gte('bitis_tarihi', today)
            .lte('bitis_tarihi', next30)
            .order('bitis_tarihi', { ascending: true })
            .limit(5);

        res.json({ 
            kpi: {
                totalQuotes,
                totalPolicies,
                totalPremium,
                totalCommission
            },
            yearStats,
            quoteBreakdownRaw,
            policyBreakdownRaw,
            renewals: renewals || [] 
        });
    } catch (err) {
        console.error('[Dashboard API] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- AI CHAT ENDPOINT ---
app.post('/chat/analyze', upload.single('file'), async (req, res) => {
    try {
        const { message } = req.body;
        const file = req.file;
        
        console.log(`[AI] Analyzing request. Message: ${message?.substring(0, 50)}..., File: ${file ? file.originalname : 'None'}`);

        const result = await ai.analyzeQuote(message, file ? file.buffer : null);
        res.json(result);
    } catch (err) {
        console.error('[AI] Error:', err);
        res.status(500).json({ error: err.message });
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
            // PREVENTION OF INFINITE LOOP (ROBUST):
            // If the record has a QR code, it means the bot successfully generated it and updated the DB.
            // In this case, the session is ALREADY running and doing its job.
            // The listener should ONLY intervene if the user requested a NEW session (which sets qr_code to NULL).
            if (newRec.qr_code) {
                // console.log(`[DB Listener] Ignoring QR update for ${userId} - Session is active.`);
                return;
            }

            const currentSession = bot.getSession(userId);
            // If we are 'scanning', it implies we WANT a new QR.
            // Even if a session exists in memory, we should probably kill it and start fresh 
            // IF it's not already scanning.
            
            // Logic:
            // 1. If session exists and is connected -> Stop it, Clear it, Start New.
            // 2. If session exists and is scanning -> Do nothing (already doing it).
            // 3. If no session -> Start New.
            
            if (currentSession) {
                if (currentSession.user) {
                     // It's connected but DB says 'scanning'. User wants to switch/re-scan?
                     console.log(`[DB Listener] Force restarting session for ${userId} (Requested New QR)`);
                     await bot.stopSession(userId);
                     await bot.startSession(userId, io); // true = force clear
                } else {
                     // Not running or strictly scanning?
                     // If we are already running (currentSession exists), we might just let it be.
                     // But if the user explicitly clicked "Start" (which sets status=scanning), 
                     // and we are stuck, maybe restart.
                     // For now, let's restart to be safe if requested.
                     console.log(`[DB Listener] Restarting session for ${userId}`);
                     await bot.stopSession(userId);
                     await bot.startSession(userId, io);
                }
            } else {
                console.log(`[DB Listener] Starting new session for ${userId}`);
                await bot.startSession(userId, io); // Force clear to ensure fresh QR
            }
        } else if (newRec.status === 'connected') {
             // If DB says connected, but we don't have it in memory (e.g. after server restart + race condition), load it.
             const currentSession = bot.getSession(userId);
             if (!currentSession) {
                  console.log(`[DB Listener] DB says connected but session missing. Loading ${userId}...`);
                  await bot.startSession(userId, io);
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
                 if (session) {
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

            if (manager && manager.user) {
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
                        if (manager.user?.id) {
                            const ownerPhone = manager.user.id.split(':')[0];
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
                } else {
                     // NEW: Direct Message Fallback Logic
                     // If msg.group_id is null (unlikely for groups, but possible for direct chats if implemented later),
                     // we stick to msg.user_id.
                }

                let session = bot.getSession(sessionUserId);
                
                // --- FALLBACK: If group owner session not found, try the person who sent it ---
                if (!session && msg.user_id && sessionUserId !== msg.user_id) {
                    console.log(`[DB Listener] Owner session ${sessionUserId} not active. Falling back to sender session ${msg.user_id}`);
                    session = bot.getSession(msg.user_id);
                    if (session) sessionUserId = msg.user_id;
                }

                if (session) {
                    // Check if connection is open, if not try to wait briefly
                    if (!session.user) {
                        console.warn(`[DB Listener] Session ${sessionUserId} not ready. Waiting 3s...`);
                        await new Promise(r => setTimeout(r, 3000));
                    }

                    if (session.user) {
                        // Determine JID:
                        // If group_id is present, we need to fetch the JID from chat_groups table again or cache it?
                        // Wait, we only fetched 'created_by' above. We need 'group_jid' too!
                        
                        let jid = msg.sender_phone; // Fallback? No, this is wrong.
                        
                        if (msg.group_id) {
                            const { data: groupJidData } = await db.client
                                .from('chat_groups')
                                .select('group_jid')
                                .eq('id', msg.group_id)
                                .single();
                                
                            if (groupJidData && groupJidData.group_jid) {
                                jid = groupJidData.group_jid;
                            } else {
                                throw new Error(`Could not find Group JID for group_id: ${msg.group_id}`);
                            }
                        }
                        
                        console.log(`[DB Listener] Sending to JID: ${jid}`);
                        
                        // Handle Message Type
                        let msgOptions = {};
                        
                        if (msg.type === 'text') {
                            msgOptions = { text: msg.content };
                        } else if (msg.type === 'image') {
                             if (!msg.media_url) throw new Error('Image message missing media_url');
                             msgOptions = { 
                                 image: { url: msg.media_url },
                                 caption: msg.content || ''
                             };
                        } else if (msg.type === 'video') {
                             if (!msg.media_url) throw new Error('Video message missing media_url');
                             msgOptions = { 
                                 video: { url: msg.media_url },
                                 caption: msg.content || ''
                             };
                        } else if (msg.type === 'document') {
                             if (!msg.media_url) throw new Error('Document message missing media_url');
                             // Try to guess mimetype from content (filename) or default
                             const fileName = msg.content || 'belge';
                             let mimetype = 'application/octet-stream';
                             if (fileName.endsWith('.pdf')) mimetype = 'application/pdf';
                             else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) mimetype = 'application/vnd.ms-excel';
                             else if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) mimetype = 'application/msword';

                             msgOptions = { 
                                 document: { url: msg.media_url },
                                 fileName: fileName,
                                 mimetype: mimetype
                             };
                        } else {
                             // Fallback for unknown types
                             msgOptions = { text: msg.content || '[Desteklenmeyen Mesaj]' };
                        }

                        // Handle Reply/Quote
                        
                        if (msg.quoted_message_id) {
                            try {
                                const store = bot.getStore();
                                let quotedMsg = null;

                                if (store) {
                                    quotedMsg = await store.loadMessage(jid, msg.quoted_message_id);
                                }

                                if (quotedMsg) {
                                    msgOptions.quoted = quotedMsg;
                                } else {
                                    console.warn(`[DB Listener] Quoted message ${msg.quoted_message_id} not found in store. Fetching from DB...`);
                                    
                                    const { data: dbMsg } = await db.client
                                        .from('messages')
                                        .select('sender_phone, content, user_id, whatsapp_message_id')
                                        .eq('whatsapp_message_id', msg.quoted_message_id)
                                        .single();
                                    
                                    if (dbMsg) {
                                        let participant = dbMsg.sender_phone;
                                        // Ensure JID format
                                        if (!participant.includes('@')) {
                                            participant = participant + '@s.whatsapp.net';
                                        }

                                        // Ensure fromMe is correctly calculated
                                        // We need to check if the SENDER of the quoted message is the current bot user
                                        const botId = session.user?.id ? session.user.id.split(':')[0].split('@')[0] : '';
                                        const isQuotedFromMe = dbMsg.sender_phone === botId;

                                        msgOptions.quoted = {
                                            key: {
                                                remoteJid: jid,
                                                fromMe: isQuotedFromMe,
                                                id: dbMsg.whatsapp_message_id,
                                                participant: participant
                                            },
                                            message: { conversation: dbMsg.content || '...' }
                                        };
                                        console.log(`[DB Listener] Fake Quote Key: ${JSON.stringify(msgOptions.quoted.key)}`);
                                    }
                                }
                            } catch (qErr) {
                                console.error('Error loading quoted message:', qErr);
                            }
                        }

                        const sentMsg = await session.sendMessage(jid, msgOptions); 
                        console.log(`[DB Listener] Sent! WA ID: ${sentMsg.key.id}`);

                        // CRITICAL FIX: Update the existing row with the generated WA ID
                        // This prevents duplicates when the 'upsert' event comes back from WA
                        await db.client
                            .from('messages')
                            .update({ 
                                status: 'sent', 
                                whatsapp_message_id: sentMsg.key.id 
                            })
                            .eq('id', msg.id);
                        
                        socket.emit('message_status', { id: msg.id, status: 'sent', whatsapp_message_id: sentMsg.key.id });
                    } else {
                         throw new Error(`Session ${sessionUserId} not connected after wait.`);
                    }
                } else {
                    console.log(`[DB Listener] No active session for ${sessionUserId}`);
                    // Optional: mark as failed if session not found
                     await db.updateMessageStatus(msg.id, 'failed');
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
        if (!session) return;

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
                bot.startSession(s.user_id, io).catch(err => {
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
    
    // Initial Cleanup
    db.cleanupOldMessages();
    // Schedule Cleanup every hour
    setInterval(() => {
        db.cleanupOldMessages();
    }, 60 * 60 * 1000);
});
