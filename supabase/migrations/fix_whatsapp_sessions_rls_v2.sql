-- Enable RLS on the table
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own session" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can update own session" ON whatsapp_sessions;

-- Allow users to read their own session
CREATE POLICY "Users can view own session" 
ON whatsapp_sessions FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to insert/update their own session
CREATE POLICY "Users can update own session" 
ON whatsapp_sessions FOR ALL 
USING (auth.uid() = user_id);