-- 1. CLEANUP LEGACY/UNUSED TABLES
DROP TABLE IF EXISTS public.mesajlar CASCADE;
DROP TABLE IF EXISTS public.whatsapp_sessions_v2 CASCADE;
DROP TABLE IF EXISTS public.whatsapp_group_assignments CASCADE;
DROP TABLE IF EXISTS public.whatsapp_groups CASCADE;

-- 2. RECREATE MESSAGES TABLE (Optimized & Matching Frontend)
DROP TABLE IF EXISTS public.messages CASCADE;

CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- The employee who sent/manages this
    group_id TEXT REFERENCES public.chat_groups(id) ON DELETE SET NULL, -- Linked Chat Group (TEXT type to match chat_groups.id)
    sender_phone TEXT, -- The phone number of the sender (Customer or Bot)
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, received, read, failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb -- For extra data like wa_message_id, reply_to, etc.
);

-- 3. INDEXES FOR PERFORMANCE
CREATE INDEX idx_messages_group_id ON public.messages(group_id);
CREATE INDEX idx_messages_sender_phone ON public.messages(sender_phone);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_messages_status ON public.messages(status);

-- 4. OPTIMIZE WHATSAPP SESSIONS
-- Ensure the table exists and is clean
TRUNCATE TABLE public.whatsapp_sessions;

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for Messages
-- Allow authenticated users to view all messages (for now, can be scoped to groups later)
DROP POLICY IF EXISTS "Users can view all messages" ON public.messages;
CREATE POLICY "Users can view all messages" ON public.messages
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert messages (sending)
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages" ON public.messages
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update messages (marking as read)
DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
CREATE POLICY "Users can update messages" ON public.messages
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Policies for Sessions
DROP POLICY IF EXISTS "Users can view their own session" ON public.whatsapp_sessions;
CREATE POLICY "Users can view their own session" ON public.whatsapp_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own session" ON public.whatsapp_sessions;
CREATE POLICY "Users can update their own session" ON public.whatsapp_sessions
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own session" ON public.whatsapp_sessions;
CREATE POLICY "Users can insert their own session" ON public.whatsapp_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. REALTIME SETUP
-- Safely add tables to publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;
  END IF;
END $$;
