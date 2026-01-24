
-- 1. Create a secure function to check roles preventing recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
    RETURN user_role;
END;
$$;

-- 2. Clean up existing policies on users table
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
    END LOOP;
END $$;

-- 3. Create new optimized policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
USING (auth.uid() = id);

-- Allow admins and employees to view all profiles
-- Using the security definer function to break recursion
CREATE POLICY "Staff can view all profiles"
ON public.users FOR SELECT
USING (
    get_my_role() IN ('admin', 'employee')
);

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
ON public.users FOR UPDATE
USING (
    get_my_role() = 'admin'
);
