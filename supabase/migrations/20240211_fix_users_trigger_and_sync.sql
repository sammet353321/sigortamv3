
-- Fix handle_new_user trigger to use correct column names (name instead of full_name)
-- And restore missing users from auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, name)
  VALUES (
    new.id, 
    new.email, 
    'employee', 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, public.users.name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync missing users from auth.users to public.users
INSERT INTO public.users (id, email, role, name, created_at)
SELECT 
  id, 
  email, 
  'employee', -- Default role
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;
