
-- 1. Add sender_name and whatsapp_message_id columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;

-- 2. Create a unique index for whatsapp_message_id to prevent duplicates across multiple sessions
-- We use a unique index which is the foundation for UPSERT (ON CONFLICT) logic
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages (whatsapp_message_id);

-- 3. Add status column if not exists for read/unread tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'delivered';

-- 4. Enable RLS for messages if not already enabled
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 5. Open policy for authenticated users (internal tool)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON messages;
CREATE POLICY "Enable all access for authenticated users"
ON messages
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
