-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" 
ON users FOR SELECT 
USING (auth.uid() = id);

-- Allow authenticated users (e.g. admins) to view all profiles (needed for dashboard/admin panels)
-- This might be what is blocking the admin panel from fetching user details
CREATE POLICY "Authenticated users can view all profiles" 
ON users FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role full access (default, but good to be explicit if needed, though service role bypasses RLS)
