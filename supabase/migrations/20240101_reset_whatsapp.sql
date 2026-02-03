-- 1. Delete all messages (Chat history)
DELETE FROM messages;

-- 2. Delete WhatsApp Sessions
DELETE FROM whatsapp_sessions;

-- 3. Delete WhatsApp Groups and their dependencies
-- First, identify WA groups
CREATE TEMP TABLE wa_groups AS SELECT id FROM chat_groups WHERE is_whatsapp_group = true;

-- Delete members of WA groups
DELETE FROM chat_group_members WHERE group_id IN (SELECT id FROM wa_groups);

-- Delete permissions of WA groups
DELETE FROM chat_group_permissions WHERE group_id IN (SELECT id FROM wa_groups);

-- Delete workgroup links of WA groups
DELETE FROM chat_group_workgroups WHERE chat_group_id IN (SELECT id FROM wa_groups);

-- Finally delete the groups themselves
DELETE FROM chat_groups WHERE id IN (SELECT id FROM wa_groups);

-- Drop temp table
DROP TABLE wa_groups;
