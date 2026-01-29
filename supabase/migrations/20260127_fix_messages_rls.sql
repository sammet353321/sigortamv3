-- Enable RLS on messages if not already enabled
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow ALL authenticated users to SELECT from messages
-- This ensures that employees can see messages saved by the Manager (bot)
DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.messages;
CREATE POLICY "Authenticated users can view all messages" ON public.messages
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow ALL authenticated users to INSERT messages
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow ALL authenticated users to UPDATE messages (e.g. marking as read)
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.messages;
CREATE POLICY "Authenticated users can update messages" ON public.messages
    FOR UPDATE USING (auth.role() = 'authenticated');
