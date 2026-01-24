-- Fix RLS for public.users table if it exists
DO $$ 
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        
        -- Enable RLS
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

        -- Drop existing policy if any
        DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;
        
        -- Create policy to allow authenticated users to read all users (needed for displaying user names)
        CREATE POLICY "Enable read access for authenticated users"
        ON public.users FOR SELECT
        TO authenticated
        USING (true);

    END IF;
END $$;
