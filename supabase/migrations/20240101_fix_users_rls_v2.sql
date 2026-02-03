-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON users;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" 
ON users FOR SELECT 
USING (auth.uid() = id);

-- Allow authenticated users (e.g. admins) to view all profiles
CREATE POLICY "Authenticated users can view all profiles" 
ON users FOR SELECT 
TO authenticated 
USING (true);
