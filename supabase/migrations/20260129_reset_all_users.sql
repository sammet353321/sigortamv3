
-- 1. Tüm kullanıcıları Auth ve Public tablolarından sil (Admin hariç)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Public tablosunu temizle (Cascade ile ilişkili veriler de silinir)
  -- Sadece admin@gmail.com'u koru
  DELETE FROM public.users 
  WHERE email <> 'admin@gmail.com';
  
  -- 2. Auth tablosunu temizle
  -- Not: Auth tablosundan silmek için Supabase Admin API veya bu şekilde bir SQL kullanmak gerekir.
  -- Ancak Auth tablosu "auth.users" korumalıdır. Buradan silmek için yetki gerekebilir.
  -- Genellikle CASCADE delete auth.users -> public.users tetiklemesi terstir. 
  -- Auth'dan silinince Public'ten silinir.
  
  -- Admin olmayan herkesi sil
  DELETE FROM auth.users 
  WHERE email <> 'admin@gmail.com';

  RAISE NOTICE 'Admin haricindeki tüm kullanıcılar temizlendi.';
END $$;
