-- Enable RLS on the table (if not already enabled)
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own session
CREATE POLICY "Users can view own session" 
ON whatsapp_sessions FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to insert/update their own session
CREATE POLICY "Users can update own session" 
ON whatsapp_sessions FOR ALL 
USING (auth.uid() = user_id);

-- IMPORTANT: Allow Service Role (Backend) to bypass RLS
-- (Service role automatically bypasses RLS, but explicit policies sometimes help clarity or if logic is complex)
-- No specific policy needed for service_role as it overrides RLS, 
-- but we must ensure Realtime is enabled for this table.

-- Enable Realtime for whatsapp_sessions
alter publication supabase_realtime add table whatsapp_sessions;