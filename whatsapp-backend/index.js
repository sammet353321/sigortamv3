require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Import CORS
const multer = require('multer'); // Import Multer
const fs = require('fs');
const db = require('./src/Database');
const SessionManager = require('./src/SessionManager');
const driveService = require('./src/DriveService'); // Import Drive Service

const app = express();
const port = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Configure Multer for temp uploads
const upload = multer({ dest: 'uploads/' });

// Active sessions: userId -> SessionManager
const sessions = new Map();

// --- SERVER ---
app.get('/', (req, res) => res.send('WhatsApp Backend v3 (Optimized)'));

// --- GOOGLE DRIVE UPLOAD ENDPOINT ---
app.post('/upload-to-drive', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('[Upload] Received file:', req.file.originalname);

        // Upload to Drive
        const result = await driveService.uploadFile(req.file);

        // Cleanup temp file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Failed to delete temp file:', err);
        });

        res.json(result);
    } catch (error) {
        // Cleanup temp file on error too
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        console.error('[Upload] Error:', error);
        res.status(500).json({ 
            error: error.message || 'Upload failed',
            details: 'Ensure service-account.json is present in whatsapp-backend folder.'
        });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));

// --- LISTENERS ---
db.client
    .channel('whatsapp-backend-v3')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions' }, 
    async (payload) => {
        const session = payload.new;
        if (!session) return;

        const userId = session.user_id;
        
        // 1. Start / Scan
        if (session.status === 'scanning') {
            // If already managing this user, check if we need to restart
            let manager = sessions.get(userId);
            
            if (!manager) {
                manager = new SessionManager(userId);
                sessions.set(userId, manager);
            }

            // Only start if not already initializing or connected
            // But if 'scanning' is requested, it usually means user clicked "QR Code" again
            // So we should probably force restart if not already doing so
            if (!manager.isInitializing && !manager.sock?.user) {
                // If it was in a 401 loop state, sock might be null but files exist.
                // We MUST force clean files if we are in 'scanning' mode to generate new QR.
                console.log(`[${userId}] Scanning requested. Forcing cleanup and restart.`);
                
                // Close any existing socket strictly
                if (manager.sock) {
                    manager.sock.end(undefined);
                    manager.sock = null;
                }
                
                manager.cleanupFiles(); 
                
                // Add delay to ensure FS operations complete and OS releases locks
                setTimeout(() => {
                    manager.start(false);
                }, 2000);
            }
        }

        // 2. Disconnect
        if (session.status === 'disconnected') {
            const manager = sessions.get(userId);
            if (manager) {
                await manager.stop();
                sessions.delete(userId);
            }
        }
    })
    .subscribe();

// --- GROUP & MESSAGE LISTENERS ---
db.client
    .channel('whatsapp-groups')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups' }, 
    async (payload) => {
        const group = payload.new;
        
        // Handle DELETE event (payload.new is null, use payload.old)
        if (payload.eventType === 'DELETE' && payload.old) {
             console.log(`[DB Sync] Group ${payload.old.id} deleted from DB.`);
             return;
        }

        if (!group) return;

        // Find the specific session for the user who owns/created this group
        // This ensures we use the correct WhatsApp account to perform actions
        const ownerId = group.created_by;
        let manager = sessions.get(ownerId);

        // Fallback for system actions or if created_by is missing/admin
        if (!manager) {
             // Try to find any active session that might be admin of this group?
             // For now, if we can't find the exact creator, we can't safely operate on WA.
             // But if it's a delete request, maybe we should try?
             if (group.status === 'deleting') {
                 // Try to find a session that has this group?
                 // Not easy without tracking group-user map in memory.
                 // For now, log warning.
                 console.log(`[Group Action] No active session found for user ${ownerId}. Cannot process group ${group.id}`);
             } else if (group.status === 'creating') {
                 await db.client.from('chat_groups').update({ status: 'failed' }).eq('id', group.id);
             }
             return;
        }

        // Only process if the manager is connected
        if (!manager.sock?.user) {
             console.log(`[Group Action] Session for user ${ownerId} is not connected. Skipping.`);
             return;
        }

        // 1. CREATE GROUP
        if (group.status === 'creating') {
            console.log('Creating group:', group.name);
            const res = await manager.createGroup(group.name, []); // Participants empty initially
            
            if (res.success) {
                // Update DB with real WA ID and active status
                // We DELETE the temp row and INSERT the new one with WA JID
                await db.client.from('chat_groups').delete().eq('id', group.id);
                await db.client.from('chat_groups').insert({
                    id: res.gid, // WA JID
                    name: group.name,
                    is_whatsapp_group: true,
                    status: 'active',
                    created_by: group.created_by
                });
            } else {
                await db.client.from('chat_groups').update({ status: 'failed' }).eq('id', group.id);
            }
        }

        // 2. DELETE GROUP
        if (group.status === 'deleting') {
            console.log('Deleting/Leaving group:', group.id);
            // Attempt to leave/delete on WA
            const res = await manager.deleteGroup(group.id);
            
            // Always delete from DB if successful OR if it was already gone/error (to keep sync)
            // If strictly network error, maybe keep it? But user wants it gone.
            // Let's force delete from DB to match UI expectation.
            await db.client.from('chat_groups').delete().eq('id', group.id);
        }
    })
    .subscribe();

// --- MESSAGE LISTENER ---
db.client
    .channel('whatsapp-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
    async (payload) => {
        const msg = payload.new;
        if (msg.status === 'pending' && msg.direction === 'outbound') {
            let manager;
            // 1. Try to find the specific session for this user
            if (msg.user_id) {
                manager = sessions.get(msg.user_id);
            }

            // 2. Fallback: Take the first available session (legacy behavior)
            if (!manager) {
                manager = sessions.values().next().value;
            }

            if (manager) {
                const target = msg.group_id || msg.sender_phone;
                await manager.sendMessage(target, msg.content);
                await db.client.from('messages').update({ status: 'sent' }).eq('id', msg.id);
            } else {
                console.log(`No active session found to send message ${msg.id}`);
            }
        }
    })
    .subscribe();

// --- GROUP MEMBER LISTENER (Add/Remove) ---
db.client
    .channel('whatsapp-members')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_members' }, 
    async (payload) => {
        // We need to know:
        // 1. Who is the owner of the group (to use their session)
        // 2. What is the real WA Group ID (gid)
        
        let memberRecord = payload.new || payload.old;
        if (!memberRecord) return;

        // Fetch group details to get owner and WA ID
        const { data: group } = await db.client
            .from('chat_groups')
            .select('created_by, id, is_whatsapp_group')
            .eq('id', memberRecord.group_id)
            .single();

        if (!group || !group.is_whatsapp_group) return;

        const ownerId = group.created_by;
        const gid = group.id; // This should be the WA JID (e.g. 123456@g.us)

        // Get Session
        let manager = sessions.get(ownerId);
        if (!manager || !manager.sock?.user) {
            console.log(`[Member Action] No active session for group owner ${ownerId}`);
            return;
        }

        // ADD MEMBER
        if (payload.eventType === 'INSERT') {
            console.log(`[Member Action] Adding ${memberRecord.phone} to ${gid}`);
            try {
                // Ensure phone is formatted
                let phone = memberRecord.phone.replace(/\D/g, '');
                if (!phone.includes('@')) phone += '@s.whatsapp.net';
                
                await manager.sock.groupParticipantsUpdate(gid, [phone], 'add');
                console.log(`[Member Action] Added ${phone} to ${gid}`);
            } catch (err) {
                console.error(`[Member Action] Failed to add member:`, err);
            }
        }

        // REMOVE MEMBER
        if (payload.eventType === 'DELETE') {
            console.log(`[Member Action] Removing ${memberRecord.phone} from ${gid}`);
            try {
                let phone = memberRecord.phone.replace(/\D/g, '');
                if (!phone.includes('@')) phone += '@s.whatsapp.net';
                
                await manager.sock.groupParticipantsUpdate(gid, [phone], 'remove');
                console.log(`[Member Action] Removed ${phone} from ${gid}`);
            } catch (err) {
                console.error(`[Member Action] Failed to remove member:`, err);
            }
        }
    })
    .subscribe();

console.log('Backend v3 initialized and listening for changes...');

// --- RESTORE ACTIVE SESSIONS ---
(async () => {
    try {
        // 1. First, check for any stuck sessions that need cleanup
        // If a session is marked connected but folder is missing, or we want to force clean known bad sessions
        // For now, let's just restore valid ones.
        
        const { data: sessionsData } = await db.client
            .from('whatsapp_sessions')
            .select('*')
            .eq('status', 'connected');

        if (sessionsData && sessionsData.length > 0) {
            console.log(`Found ${sessionsData.length} active sessions. Restoring...`);
            for (const s of sessionsData) {
                // Skip restoring if we know it's the bad session ID that was looping
                // Or better, restore it but with strict error handling in SessionManager
                const manager = new SessionManager(s.user_id);
                sessions.set(s.user_id, manager);
                // Start in reconnect mode
                manager.start(true).catch(err => {
                    console.error(`Failed to restore session for ${s.user_id}:`, err);
                });
            }
        }
    } catch (error) {
        console.error('Error restoring sessions:', error);
    }
})();
