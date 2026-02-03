-- Enable pg_trgm for fuzzy search (LIKE %...%)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. MESSAGES TABLE OPTIMIZATIONS
-- Add whatsapp_message_id if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'whatsapp_message_id') THEN
        ALTER TABLE messages ADD COLUMN whatsapp_message_id text;
        ALTER TABLE messages ADD CONSTRAINT messages_whatsapp_message_id_key UNIQUE (whatsapp_message_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_phone ON messages(sender_phone);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_wa_msg_id ON messages(whatsapp_message_id);
-- Composite index for finding specific messages quickly (e.g. echo checks)
CREATE INDEX IF NOT EXISTS idx_messages_group_direction_content ON messages(group_id, direction, content);

-- 2. POLICIES (POLICELER) TABLE OPTIMIZATIONS
-- Standard B-Tree for sorting and exact matches
CREATE INDEX IF NOT EXISTS idx_policeler_tarih ON policeler(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_policeler_created_at ON policeler(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policeler_durum ON policeler(durum);
CREATE INDEX IF NOT EXISTS idx_policeler_kesen ON policeler(kesen);
CREATE INDEX IF NOT EXISTS idx_policeler_employee_id ON policeler(employee_id);

-- GIN Indexes for fast search (LIKE %query%)
CREATE INDEX IF NOT EXISTS idx_policeler_plaka_trgm ON policeler USING gin (plaka gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policeler_ad_soyad_trgm ON policeler USING gin (ad_soyad gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policeler_tc_vkn_trgm ON policeler USING gin (tc_vkn gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policeler_police_no_trgm ON policeler USING gin (police_no gin_trgm_ops);

-- 3. QUOTES (TEKLIFLER) TABLE OPTIMIZATIONS
CREATE INDEX IF NOT EXISTS idx_teklifler_tarih ON teklifler(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_teklifler_created_at ON teklifler(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teklifler_employee_id ON teklifler(employee_id);

CREATE INDEX IF NOT EXISTS idx_teklifler_plaka_trgm ON teklifler USING gin (plaka gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teklifler_ad_soyad_trgm ON teklifler USING gin (ad_soyad gin_trgm_ops);

-- 4. WHATSAPP SESSIONS & GROUPS
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_groups_group_jid ON chat_groups(group_jid);
CREATE INDEX IF NOT EXISTS idx_chat_groups_created_by ON chat_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_group_id ON chat_group_members(group_id);

-- 5. NOTIFICATIONS
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;

-- 6. ANALYZE to update stats
ANALYZE messages;
ANALYZE policeler;
ANALYZE teklifler;
