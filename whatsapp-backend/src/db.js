const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false }
});

module.exports = {
    client: supabase,
    async updateSession(userId, data) {
        // Upsert to ensure we create if not exists
        // Must specify onConflict to handle unique constraint on user_id
        const { data: res, error } = await supabase
            .from('whatsapp_sessions')
            .upsert({ user_id: userId, ...data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
            .select();
        
        if (error) {
            console.error(`[DB Error] updateSession failed for ${userId}:`, error);
        }
        return { data: res, error };
    },
    async getSession(userId) {
        const { data } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('user_id', userId)
            .single();
        return data;
    },
    async saveMessage(msg) {
        try {
            // Use UPSERT with onConflict: 'whatsapp_message_id'
            // We allow updates to ensure timestamps and content are correct if re-synced
            
            const { error, data } = await supabase
                .from('messages')
                .upsert(msg, { 
                    onConflict: 'whatsapp_message_id'
                })
                .select();

            if (error) {
                // If it's a schema error (missing column), log it but don't crash
                if (error.code === 'PGRST204' || error.message.includes('column')) {
                    console.warn('[DB Warning] Schema mismatch in messages table. Attempting safe insert...', error.message);
                    // Fallback to simple insert without new columns if needed (Legacy support)
                    const { sender_name, whatsapp_message_id, ...safeMsg } = msg;
                    return await supabase.from('messages').insert(safeMsg);
                }
                return { error, data: null };
            }
            return { data, error: null };
        } catch (err) {
            // Check for HTML error response (Cloudflare/Supabase outage)
            if (err.message && err.message.includes('<!DOCTYPE html>')) {
                console.error('[DB Error] Received HTML instead of JSON. Supabase/Cloudflare might be down or rate limited.');
                return { error: { message: 'Supabase connection failed (HTML response)', code: '503' }, data: null };
            }
            return { error: err, data: null };
        }
    },
    async updateMessageStatus(id, status) {
        return await supabase.from('messages').update({ status }).eq('id', id);
    },
    async ensureGroup(jid, name) {
        // 1. Check if group exists
        const { data: existing } = await supabase
            .from('chat_groups')
            .select('id')
            .eq('group_jid', jid)
            .single();

        if (existing) return existing.id;

        // 2. Create if not exists (System / Auto creation)
        const { data: newGroup, error } = await supabase
            .from('chat_groups')
            .insert({
                group_jid: jid,
                name: name || 'Bilinmeyen Grup',
                is_whatsapp_group: true,
                status: 'active',
                created_by: null, // System created (or we could pass a user ID if needed)
                updated_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) {
            console.error('[DB] ensureGroup failed:', error.message);
            return null;
        }
        return newGroup.id;
    },
    async syncGroups(userId, groups) {
        if (!groups || groups.length === 0) return {};

        // Fetch current user's role to see if they are admin
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();
        
        if (profileError) {
            console.warn(`[Sync] Profile fetch error for ${userId}:`, profileError.message);
        }
        
        // FAIL-SAFE: If role is unknown/missing, treat as ADMIN to prevent data loss.
        // The "Employee" restriction should only apply if we are SURE they are an employee.
        const role = profile?.role || 'unknown';
        const isAdmin = role === 'admin' || role === 'unknown'; 

        console.log(`[Sync] Syncing groups for user ${userId} (Role: ${role}). Treated as Admin: ${isAdmin}`);

        // IF NOT ADMIN, DO NOT CREATE/UPDATE GROUPS (Just Map Existing)
        // Employees should not clutter DB with their personal groups.
        if (!isAdmin) {
             console.log(`[Sync] User ${userId} is not admin. Skipping group creation/update.`);
             const groupJids = groups.map(g => g.id);
             
             // Fetch existing groups to build map
             const { data: existingGroups } = await supabase
                .from('chat_groups')
                .select('id, group_jid')
                .in('group_jid', groupJids);

             const map = {};
             existingGroups?.forEach(g => {
                 map[g.group_jid] = g.id;
             });
             return map;
        }

        const groupUuidMap = {}; // Map JID -> UUID

        for (const g of groups) {
            // FILTER: Ignore status broadcast and groups with no subject or subject same as ID
            if (g.id === 'status@broadcast') continue;

            // STRICT FILTER: Only sync actual Groups (@g.us)
            if (!g.id.endsWith('@g.us')) {
                console.log(`[Sync] Skipping non-group chat: ${g.id} (Subject: ${g.subject})`);
                continue;
            }
            
            if (!g.subject) {
                console.warn(`[Sync] Skipping group with empty subject: ${g.id}`);
                continue;
            }

            try {
                // Check if group already exists to preserve created_by
                const { data: existing } = await supabase
                    .from('chat_groups')
                    .select('id, created_by')
                    .eq('group_jid', g.id)
                    .single();

                const groupData = {
                    // id: g.id,  <-- REMOVED: Let DB generate UUID or use existing
                    name: g.subject || 'Bilinmeyen Grup',
                    group_jid: g.id,
                    is_whatsapp_group: true,
                    status: 'active',
                    updated_at: new Date().toISOString()
                };

                // Logic: 
                // 1. If group doesn't exist, set current user as owner
                // 2. If current user is ADMIN, always take ownership (Priority)
                // 3. NEW: If the existing owner is NOT the current user, but the current user IS the one syncing,
                //    we should check if we should take ownership. 
                //    This fixes cases where the old session ID is stale.
                if (!existing || isAdmin || (existing && existing.created_by !== userId)) {
                    // console.log(`[Sync] Assigning ownership of ${g.id} to ${userId}`);
                    groupData.created_by = userId;
                }
                
                // If group exists, use its ID for update to avoid UUID conflict if schema is strict
                let targetId = existing ? existing.id : undefined;

                const { data: upsertedGroup, error } = await supabase
                    .from('chat_groups')
                    .upsert(targetId ? { ...groupData, id: targetId } : groupData, { onConflict: 'group_jid' })
                    .select('id') // IMPORTANT: Get the UUID
                    .single();
                
                if (upsertedGroup) {
                    groupUuidMap[g.id] = upsertedGroup.id;

                    // Add Admin (User) to members list automatically if not present - DISABLED
                    /*
                    if (isAdmin) {
                        await supabase.from('chat_group_members').upsert({
                            group_id: upsertedGroup.id, // Use UUID
                            phone: userId.split('@')[0], 
                            name: 'Yönetici',
                            created_at: new Date().toISOString()
                        }, { onConflict: 'group_id,phone' });
                    }
                    */
                } else if (error) {
                    console.error(`[Sync] Upsert error for ${g.id}:`, error.message);
                }
            } catch (err) {
                console.error(`Error syncing group ${g.id}:`, err.message);
            }
        }
        return groupUuidMap;
    },
    async syncGroupMembers(groupId, participants, store = null) {
        if (!participants || participants.length === 0) {
            console.log(`[Members] Skipping sync for ${groupId} - No participants provided.`);
            return;
        }

        const validParticipants = participants.filter(p => 
            p.id && 
            p.id.endsWith('@s.whatsapp.net') && 
            !p.id.includes(':')
        );

        const rows = validParticipants.map(p => {
            const id = p.id;
            let phone = id.split('@')[0];
            let name = null;

            if (store) {
                const contact = store.contacts[id];
                if (contact) {
                    name = contact.name || contact.notify || contact.verifiedName || null;
                }
            }
            
            if (!name) name = phone;
            
            return {
                group_id: groupId,
                phone: phone, 
                name: name, 
                created_at: new Date().toISOString()
            };
        });

        if (rows.length > 0) {
            // OPTIMIZATION: Use UPSERT instead of DELETE + INSERT to avoid blocking/locking
            const { error } = await supabase
                .from('chat_group_members')
                .upsert(rows, { onConflict: 'group_id,phone' });
            
            if (error) console.error('[Members] Upsert error:', error.message);
            else console.log(`[Members] Successfully synced ${rows.length} members for Group: ${groupId}`);
        }
    },
    async clearUserGroups(userId) {
        // Delete groups managed by this user (where created_by = userId AND is_whatsapp_group = true)
        const { error } = await supabase
            .from('chat_groups')
            .delete()
            .eq('created_by', userId)
            .eq('is_whatsapp_group', true);
            
        if (error) console.error('Error clearing groups:', error);
    },
    async getGroupByJid(jid) {
        const { data } = await supabase
            .from('chat_groups')
            .select('id')
            .eq('group_jid', jid)
            .single();
        return data?.id || null;
    },
    async getMemberName(groupId, phone) {
        if (!groupId || !phone) return null;
        const { data } = await supabase
            .from('chat_group_members')
            .select('name')
            .eq('group_id', groupId)
            .eq('phone', phone)
            .single();
        return data?.name || null;
    },
    // Function to ensure DM Group exists for 1-on-1 chats
    async ensureDMGroup(remoteJid, contactName, userId) {
        const phone = remoteJid.split('@')[0];
        
        // 1. Check if DM group already exists
        const { data: existingGroup } = await supabase
            .from('chat_groups')
            .select('id')
            .eq('group_jid', remoteJid)
            .single();
            
        if (existingGroup) return existingGroup.id;

        // 2. Create new DM Group
        // Use contact name or phone number as group name
        const groupName = contactName || phone;
        
        const { data: newGroup, error } = await supabase
            .from('chat_groups')
            .insert({
                group_jid: remoteJid,
                name: groupName,
                is_whatsapp_group: false, // Mark as NOT a real WA group, but a DM
                created_by: userId,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (error) {
            console.error('Error creating DM group:', error);
            return null;
        }
        
        return newGroup.id;
    },

    // --- NEW: Cleanup Function ---
    async cleanupBadGroups() {
        // Delete groups with no name or weird numeric names that are NOT real WA groups
        // This is a safety cleanup
        /*
        const { error } = await supabase
            .from('chat_groups')
            .delete()
            .or('name.is.null,name.eq.""');
            
        if (error) console.error('Cleanup Error:', error);
        */
    },
    async cleanupOldMessages() {
        try {
            // Delete messages older than 2 days
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            const { error, count } = await supabase
                .from('messages')
                .delete({ count: 'exact' })
                .lt('created_at', twoDaysAgo);
            
            if (error) console.error('[DB] Cleanup failed:', error.message);
            else console.log(`[DB] Cleanup: Deleted ${count || 0} messages older than 2 days.`);
        } catch (err) {
            console.error('[DB] Cleanup error:', err);
        }
    }
};
