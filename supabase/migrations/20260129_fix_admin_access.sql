
-- 1. Ensure admin@gmail.com has the correct role in public.users
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Attempt to find the user in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@gmail.com';

  IF v_user_id IS NOT NULL THEN
    -- User exists in Auth, ensure they exist in Public with correct role
    INSERT INTO public.users (id, email, role, name)
    VALUES (v_user_id, 'admin@gmail.com', 'admin', 'System Admin')
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        updated_at = now();
        
    RAISE NOTICE 'Admin user synced and role set to admin.';
  ELSE
    RAISE NOTICE 'User admin@gmail.com not found in auth.users. Please sign up first.';
  END IF;
END $$;
