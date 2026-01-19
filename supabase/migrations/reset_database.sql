-- 1. WhatsApp Oturumlarını Sıfırla
TRUNCATE TABLE whatsapp_sessions CASCADE;

-- 2. WhatsApp Verilerini Temizle
TRUNCATE TABLE chat_groups CASCADE;
TRUNCATE TABLE chat_group_members CASCADE;
TRUNCATE TABLE messages CASCADE;

-- 3. Teklifleri ve Poliçeleri Temizle (İsteğe bağlı, "hepsini sıfırla" dediğiniz için)
-- TRUNCATE TABLE quotes CASCADE; -- Eğer teklifler de silinsin isterseniz bunu açın. Şimdilik kapalı tutuyorum.

-- 4. Kullanıcıları Temizle (Admin Hariç)
DELETE FROM users 
WHERE email != 'admin@gmail.com';

-- Not: auth.users tablosundan silmek için Supabase Dashboard'u kullanmanız daha sağlıklı olur.
-- Ancak uygulama tarafında 'users' tablosundan sildiğimiz için giriş yapamazlar.

-- 5. Admin Hesabını Garantiye Al (Eğer yoksa oluşturamayız ama varsa rolünü admin yapalım)
UPDATE users 
SET role = 'admin' 
WHERE email = 'admin@gmail.com';