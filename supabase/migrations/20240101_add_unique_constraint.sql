-- Add unique constraint to chat_group_members to allow UPSERT
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_group_members_group_id_phone_key'
    ) THEN
        ALTER TABLE chat_group_members ADD CONSTRAINT chat_group_members_group_id_phone_key UNIQUE (group_id, phone);
    END IF;
END $$;
