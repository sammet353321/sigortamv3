require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('WhatsApp Bot Backend Running');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// Supabase Setup
const SUPABASE_URL = 'https://aqubbkxsfwmhfbolkfah.supabase.co';
// WARNING: Using service_role key is necessary for backend operations that bypass RLS
// Ensure this key is kept secret and not exposed to frontend
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
    console.error("FATAL ERROR: SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.");
    // We don't exit process so web server keeps running to show logs
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY || 'placeholder');

// Listen for Group Creation Requests (status = 'creating')
const groupCreateChannel = supabase
    .channel('whatsapp-group-creation')
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_groups', filter: 'status=eq.creating' },
        async (payload) => {
            console.log('Group creation request:', payload.new);
            const group = payload.new;
            
            // Try to create group using the first available admin client
            let created = false;
            
            if (clients.size === 0) {
                console.error('No active WhatsApp clients connected. Cannot create group.');
                // Don't mark as failed immediately, maybe wait?
                // For now, let's mark failed so user knows.
            }

            for (const [userId, client] of clients.entries()) {
                if (!client.info) {
                     console.log(`Client for user ${userId} is not ready yet.`);
                     continue;
                }

                try {
                    // Note: WhatsApp requires at least 1 participant to create a group.
                    // Since we don't have a picker yet, we try to create with an empty list.
                    // If this fails, we might need to add a dummy number or warn user.
                    // Some libraries/versions allow empty list (just creator).
                    
                    console.log(`Creating group "${group.name}" via user ${userId}...`);
                    
                    // Attempt create with empty participants
                    const result = await client.createGroup(group.name, []);
                    
                    if (result && result.gid) {
                        console.log('Group created on WhatsApp:', result);
                        
                        // Update DB with real JID and status
                        await supabase
                            .from('chat_groups')
                            .update({ 
                                group_jid: result.gid._serialized,
                                status: 'active',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', group.id);
                        
                        created = true;
                        break; // Stop after successful creation
                    }
                } catch (err) {
                    console.error(`Error creating group via ${userId}:`, err);
                }
            }

            if (!created) {
                console.error('Failed to create group on WhatsApp (no valid client or API error).');
                // Mark as failed in DB
                await supabase
                    .from('chat_groups')
                    .update({ status: 'failed_creation' })
                    .eq('id', group.id);
            }
        }
    )
    .subscribe();

// Listen for Group Deletion Requests (status = 'deleting')
const groupUpdateChannel = supabase
    .channel('whatsapp-group-updates')
    .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_groups', filter: 'status=eq.deleting' },
        async (payload) => {
            console.log('Group marked for deletion:', payload.new);
            const group = payload.new;
            
            if (!group || !group.group_jid) {
                console.log('Skipping deletion on WA: No JID');
                // Just delete from DB
                 await supabase.from('chat_groups').delete().eq('id', group.id);
                 return;
            }

            console.log(`Attempting to leave group ${group.group_jid} across ${clients.size} clients.`);

            // Iterate through all active clients and try to leave the group
            for (const [userId, client] of clients.entries()) {
                try {
                    // Check if client is ready
                    if (!client.info) {
                        console.log(`Client for ${userId} not ready.`);
                        continue;
                    }

                    console.log(`Checking chat for user ${userId}...`);
                    const chat = await client.getChatById(group.group_jid);
                    
                    if (chat) {
                        console.log(`Leaving group ${group.name} (${group.group_jid}) for user ${userId}`);
                        
                        // Wait for leave to complete
                        try {
                            await chat.leave();
                            console.log('Left group successfully.');
                            
                            // Delete chat from list to verify it's gone from phone UI
                            await chat.delete();
                            console.log('Chat deleted from list successfully.');
                        } catch (leaveErr) {
                            console.error('Error during chat.leave() or chat.delete():', leaveErr);
                            // Even if error, we might still want to proceed or retry?
                        }

                    } else {
                        console.log(`Chat ${group.group_jid} not found for user ${userId}`);
                        // Try to get chat by ID again just in case it wasn't cached?
                        // const chat = await client.getChatById(group.group_jid);
                    }
                } catch (err) {
                    console.error(`Error leaving group for ${userId}:`, err);
                }
            }

            // Finally, delete the group from DB
            // We do this AFTER trying to leave.
            // If leave fails, we still delete from DB because user wants it gone from panel?
            // User said: "grubu filen ekleme ve çıkma yapmıyor sorun bu"
            // If we fail to leave, maybe we should NOT delete from DB and mark as 'error'?
            // But for now, let's proceed with deletion so it doesn't get stuck in 'deleting'.
            
            console.log(`Deleting group ${group.id} from DB...`);
            const { error } = await supabase.from('chat_groups').delete().eq('id', group.id);
            if (error) console.error('Error deleting group from DB:', error);
        }
    )
    .subscribe();


// Listen for Outbound Messages (status = 'pending', direction = 'outbound')
const messageOutboundChannel = supabase
    .channel('whatsapp-outbound-messages')
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: "direction=eq.outbound" },
        async (payload) => {
            console.log('Outbound message request:', payload.new);
            const message = payload.new;
            
            // 1. Find the right client (bot) to send this message
            // We need to know which group this message belongs to, and which bot is a member of that group.
            
            if (!message.group_id) {
                console.error('Message has no group_id, cannot send.');
                return;
            }

            // Get group details to find JID
            const { data: groupData } = await supabase
                .from('chat_groups')
                .select('group_jid')
                .eq('id', message.group_id)
                .single();

            if (!groupData || !groupData.group_jid) {
                 console.error('Group not found or has no JID:', message.group_id);
                 return;
            }

            // Find a client that is a member of this group (or just use Admin client for now)
            // Ideally, we should check 'chat_group_members' table to see which user (bot) is in this group.
            // For simplicity, we'll try to find ANY connected client that can see this chat.
            
            let sent = false;
            for (const [userId, client] of clients.entries()) {
                if (!client.info) continue;

                try {
                    const chat = await client.getChatById(groupData.group_jid);
                    if (chat) {
                        console.log(`Sending message via user ${userId} to ${groupData.group_jid}`);
                        await chat.sendMessage(message.content);
                        
                        // Update message status to 'sent'
                        await supabase
                            .from('messages')
                            .update({ status: 'sent', updated_at: new Date().toISOString() })
                            .eq('id', message.id);
                            
                        sent = true;
                        break;
                    }
                } catch (err) {
                    // This client might not be in the group, try next
                }
            }

            if (!sent) {
                console.error('Failed to send message: No connected client has access to this group.');
                await supabase
                    .from('messages')
                    .update({ status: 'failed' })
                    .eq('id', message.id);
            }
        }
    )
    .subscribe();


// Active Clients Map: userId -> Client
const clients = new Map();

console.log('WhatsApp Backend Service Started...');

// Listen for Session Changes
const channel = supabase
    .channel('whatsapp-backend-listener')
    .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        async (payload) => {
            console.log('Change detected:', payload.eventType, payload.new?.id);
            const session = payload.new;
            
            if (!session) return;

            // If status is 'scanning' and we don't have a client for this user, start one
            if (session.status === 'scanning' && !clients.has(session.user_id)) {
                console.log(`Initializing client for user: ${session.user_id}`);
                await initializeClient(session.user_id);
            }
            
            // If status is 'disconnected', destroy client
            if (session.status === 'disconnected' && clients.has(session.user_id)) {
                console.log(`Destroying client for user: ${session.user_id}`);
                const client = clients.get(session.user_id);
                try {
                    await client.destroy();
                } catch (e) { console.error('Error destroying client:', e); }
                clients.delete(session.user_id);
            }
        }
    )
    .subscribe();

// Also check for existing 'scanning' or 'connected' sessions on startup (simplified)
async function checkExistingSessions() {
    const { data } = await supabase.from('whatsapp_sessions').select('*').in('status', ['scanning', 'connected']);
    if (data) {
        for (const session of data) {
            if (session.status === 'scanning' && !clients.has(session.user_id)) {
                initializeClient(session.user_id);
            }
            // For 'connected', we would need to restore session (LocalAuth)
            // Implementation of session restoration is complex for multi-tenant in one script.
            // For this demo, we focus on NEW connections.
        }
    }
}
checkExistingSessions();

async function initializeClient(userId) {
    // 0. Clean up any existing session if starting fresh scanning
    // If status is scanning, it means we want a NEW QR, so delete old session.
    // However, if we are restarting server and status is 'connected', we keep it.
    
    const { data: sessionData } = await supabase
        .from('whatsapp_sessions')
        .select('status')
        .eq('user_id', userId)
        .single();

    if (sessionData && sessionData.status === 'scanning') {
        const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${userId}`);
        if (fs.existsSync(sessionPath)) {
            console.log(`Force clearing old session for new connection: ${userId}`);
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            } catch (err) {
                console.error(`Error clearing old session:`, err);
            }
        }
    }

    // Note: Using LocalAuth with a clientId allows saving session data locally
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: userId }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            timeout: 0 // Sonsuz timeout, Render yavas olabilir
        }
    });

    clients.set(userId, client);

    client.on('qr', async (qr) => {
        console.log(`QR Generated for ${userId}`);
        try {
            // Convert QR to Data URL
            const dataUrl = await qrcode.toDataURL(qr);
            
            // Update Supabase
            const { error } = await supabase
                .from('whatsapp_sessions')
                .update({ qr_code: dataUrl, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
            
            if (error) {
                console.error(`Error saving QR to DB for ${userId}:`, error);
            } else {
                console.log(`QR saved to DB for ${userId}`);
            }
        } catch (err) {
            console.error('Error handling QR:', err);
        }
    });

    client.on('ready', async () => {
        console.log(`Client is ready for ${userId}!`);
        const info = client.info;
        const phone = info.wid.user; // e.g. 905551234567
        
        await supabase
            .from('whatsapp_sessions')
            .update({ 
                status: 'connected', 
                qr_code: null, 
                phone_number: phone,
                updated_at: new Date().toISOString() 
            })
            .eq('user_id', userId);

        // Fetch and Sync Groups
        try {
            console.log('Fetching chats for', userId);
            const chats = await client.getChats();
            const groups = chats.filter(chat => chat.isGroup);
            
            console.log(`Found ${groups.length} groups.`);

            // Get User Role to decide sync logic
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();

            if (userError) {
                console.error('Error fetching user role:', userError);
                return;
            }

            const isAdmin = userData.role === 'admin';

            for (const group of groups) {
                // FILTER: Skip unnamed groups or temporary groups
                if (!group.name) continue;
                
                // FILTER: Skip groups that look like raw JIDs (e.g. "120363...") unless they have been renamed
                // Usually legitimate groups have a proper name.
                // Regex to check if name is just numbers or JID-like
                if (/^\d+$/.test(group.name) || group.name.startsWith('Grup 1203')) {
                     // console.log('Skipping likely unnamed group:', group.name);
                     continue;
                }

                let groupId = null;

                if (isAdmin) {
                    // Admin: Master Sync (Create/Update Groups)
                    const groupName = group.name;
                    
                    const { data: groupData, error: groupError } = await supabase
                        .from('chat_groups')
                        .upsert({
                            group_jid: group.id._serialized,
                            name: groupName,
                            is_whatsapp_group: true,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'group_jid' })
                        .select()
                        .single();

                    if (groupError) {
                        console.error('Error syncing group (Admin):', groupError);
                        continue;
                    }
                    groupId = groupData.id;

                } else {
                    // Employee: Match Existing Groups (Name or JID)
                    
                    // 1. Try JID Match first (Strongest match)
                    let { data: existingGroup } = await supabase
                        .from('chat_groups')
                        .select('id')
                        .eq('group_jid', group.id._serialized)
                        .single();
                    
                    // 2. If no JID match, try Name Match (Weak match, as requested by user)
                    if (!existingGroup) {
                         const { data: nameMatchGroup } = await supabase
                            .from('chat_groups')
                            .select('id')
                            .eq('name', group.name)
                            .single();
                         existingGroup = nameMatchGroup;
                    }

                    if (existingGroup) {
                        groupId = existingGroup.id;
                    } else {
                        // Group does not exist in Admin's list, skip.
                        // console.log(`Skipping personal group: ${group.name}`);
                        continue;
                    }
                }

                if (groupId) {
                    // Sync Participants / Add Current User to Group Members
                    // For the current user (who is connecting):
                    const info = client.info;
                    const myPhone = info.wid.user;

                    // Add myself to the group members in DB
                    await supabase
                        .from('chat_group_members')
                        .upsert({
                            group_id: groupId,
                            phone: myPhone,
                            name: userData.role === 'admin' ? 'Yönetici' : 'Personel' // Or fetch real name
                        }, { onConflict: 'group_id, phone' });

                    // Optionally sync other participants if Admin?
                    // For now, let's keep it simple. The most important thing is linking the connected user.
                }
            }
        } catch (err) {
            console.error('Error syncing groups:', err);
        }
    });

    client.on('message', async (msg) => {
        // Handle incoming messages
        // Here we would insert into 'messages' table
        try {
            // Only handle inbound
            if (msg.fromMe) return;

            const senderPhone = msg.from.replace('@c.us', '');
            
            // Check if this message belongs to a known group or individual chat logic
            // For now, just insert raw message
            
            const { error } = await supabase.from('messages').insert({
                sender_phone: senderPhone,
                direction: 'inbound',
                type: msg.hasMedia ? 'image' : 'text', // Simplification
                content: msg.body,
                created_at: new Date(msg.timestamp * 1000).toISOString(),
                // group_id: ... logic to find group
            });
            
            if (error) console.error('Error saving message:', error);
            
        } catch (err) {
            console.error('Error handling incoming message:', err);
        }
    });

    client.on('disconnected', async (reason) => {
        console.log(`Client was logged out: ${userId}`, reason);
        await supabase
            .from('whatsapp_sessions')
            .update({ status: 'disconnected', qr_code: null })
            .eq('user_id', userId);
        
        try {
            await client.destroy();
        } catch (e) {
            console.error('Error destroying client:', e);
        }
        clients.delete(userId);

        // Clean up session directory
        const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${userId}`);
        if (fs.existsSync(sessionPath)) {
            console.log(`Deleting session files for ${userId}...`);
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`Session files deleted for ${userId}`);
            } catch (err) {
                console.error(`Error deleting session files for ${userId}:`, err);
            }
        }
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error(`Initialization failed for ${userId}:`, err);
    }
}
