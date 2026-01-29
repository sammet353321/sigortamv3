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
        return await supabase.from('messages').insert(msg);
    },
    async updateMessageStatus(id, status) {
        return await supabase.from('messages').update({ status }).eq('id', id);
    },
    async syncGroups(userId, groups) {
        if (!groups || groups.length === 0) return;

        // Fetch current user's role to see if they are admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();
        
        const isAdmin = profile?.role === 'admin';

        // IF NOT ADMIN, DO NOT SYNC GROUPS
        // Employees should only see groups assigned to them or created by Admin.
        // They should NOT pollute the DB with their personal WA groups.
        if (!isAdmin) {
            console.log(`[Sync] Skipping group sync for user ${userId} (Role: ${profile?.role}). Only Admins sync groups.`);
            return false; // Return false to indicate no sync happened (not admin)
        }

        for (const g of groups) {
            // FILTER: Ignore status broadcast and groups with no subject or subject same as ID
            if (g.id === 'status@broadcast') continue;
            
            // If subject is missing or equals the ID, and it's not a known valid group, skip it
            // (Unless we want to allow unnamed groups, but user specifically complained about JID-named groups)
            if (!g.subject || g.subject === g.id) {
                console.warn(`[Sync] Skipping invalid group: ${g.id} (Subject: ${g.subject})`);
                continue;
            }

            try {
                // Check if group already exists to preserve created_by
                const { data: existing } = await supabase
                    .from('chat_groups')
                    .select('created_by')
                    .eq('group_jid', g.id)
                    .single();

                const groupData = {
                    id: g.id, 
                    name: g.subject || 'Bilinmeyen Grup',
                    group_jid: g.id,
                    is_whatsapp_group: true,
                    status: 'active',
                    updated_at: new Date().toISOString()
                };

                // Logic: 
                // 1. If group doesn't exist, set current user as owner
                // 2. If current user is ADMIN, always take ownership (Priority)
                if (!existing || isAdmin) {
                    groupData.created_by = userId;
                }

                await supabase
                    .from('chat_groups')
                    .upsert(groupData, { onConflict: 'group_jid' });
            } catch (err) {
                console.error(`Error syncing group ${g.id}:`, err.message);
            }
        }
        return true; // Return true to indicate sync happened (is admin)
    },
    async syncGroupMembers(groupId, participants, store = null) {
        if (!participants || participants.length === 0) return;

        // Filter ONLY phone number JIDs (ignore LIDs like 123...45@lid)
        // Strictly allow only @s.whatsapp.net and ensure no ':' (which usually means LID or secondary device)
        const validParticipants = participants.filter(p => 
            p.id && 
            p.id.endsWith('@s.whatsapp.net') && 
            !p.id.includes(':')
        );

        const rows = validParticipants.map(p => {
            const id = p.id;
            let phone = id.split('@')[0];
            let name = null;

            // Try to find name in store contacts
            if (store) {
                const contact = store.contacts[id];
                if (contact) {
                     name = contact.name || contact.notify || contact.verifiedName || null;
                }
            }
            
            return {
                group_id: groupId,
                phone: phone, 
                name: name, 
                created_at: new Date().toISOString()
            };
        });
        
        // Filter out any remaining weird ones (redundant but safe)
        // Must be purely numeric and at least 8 digits (to avoid short internal codes)
        const cleanRows = rows.filter(r => /^\d{8,}$/.test(r.phone));

        // Delete old and insert new
        if (cleanRows.length > 0) {
            await supabase.from('chat_group_members').delete().eq('group_id', groupId);
            const { error } = await supabase.from('chat_group_members').insert(cleanRows);
            if (error) console.error('Error syncing members:', error);
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
    async ensureDMGroup(jid, name = null, createdBy = null) {
        if (jid === 'status@broadcast') return null; // Never create group for status

        // Check if exists
        const { data: existing } = await supabase
            .from('chat_groups')
            .select('id')
            .eq('group_jid', jid)
            .single();

        if (existing) return existing.id;

        // Create new DM "Group"
        // Use phone number as name if name not provided
        const phone = jid.split('@')[0];
        const groupName = name || phone;

        const { data: newGroup, error } = await supabase
            .from('chat_groups')
            .insert({
                id: jid, // Use JID as ID for consistency
                name: groupName,
                group_jid: jid,
                is_whatsapp_group: false, // Mark as DM/Individual
                status: 'active',
                created_by: createdBy, // Can be null if unknown
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating DM group:', error);
            return null;
        }
        return newGroup.id;
    },
    async cleanupBadGroups() {
        // Delete groups where group_jid is 'status@broadcast' or name looks like a JID (numeric > 15 chars)
        // BE CAREFUL: This deletes the group and cascades to messages usually
        console.log('[Cleanup] Removing invalid groups (status, JID-named)...');
        
        // 1. Delete status@broadcast
        await supabase.from('chat_groups').delete().eq('group_jid', 'status@broadcast');
        
        // 2. Delete groups where name is numeric (JID)
        // We can't do regex in PostgREST easily without RPC, but we can try to fetch and delete
        const { data: groups } = await supabase.from('chat_groups').select('id, name, group_jid');
        
        if (groups) {
            const badGroups = groups.filter(g => 
                g.group_jid === 'status@broadcast' || 
                (g.name && /^\d{10,}@/.test(g.name)) || // Name is a JID
                (g.name && /^\d{15,}$/.test(g.name)) || // Name is just numbers
                g.name === 'status'
            );
            
            for (const bg of badGroups) {
                console.log(`[Cleanup] Deleting bad group: ${bg.name} (${bg.id})`);
                await supabase.from('chat_groups').delete().eq('id', bg.id);
            }
        }
    }
};
