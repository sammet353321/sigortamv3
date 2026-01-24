# Supabase "Infinite Recursion" ve "Login Credentials" Hatalarını Çözüm Planı

Yaşadığınız sorunlar iki ana başlıkta toplanıyor:
1.  **Infinite Recursion (Sonsuz Döngü):** Veritabanı güvenlik kuralları (RLS), "Kullanıcı Admin mi?" kontrolü yaparken tekrar kendini çağırarak kilitleniyor.
2.  **Invalid Login Credentials:** Veritabanındaki RLS hatası nedeniyle kullanıcı verisi okunamıyor veya şifre/kullanıcı eşleşmesi bu kilitlenme yüzünden doğrulanamıyor.

Önceki denemede "cannot drop function" hatası aldığınız için RLS kuralları tam temizlenemedi. Bu plan, **CASCADE** komutuyla her şeyi zorla temizleyip sistemi sıfırdan ve güvenli şekilde kuracaktır.

## Adım 1: SQL ile Veritabanını Onar (CASCADE Kullanarak)

Bu SQL kodu, hataya neden olan fonksiyonu ve ona bağlı tüm kuralları **zorla (CASCADE)** siler ve güvenli versiyonlarını yeniden oluşturur.

Lütfen Supabase SQL Editor'de aşağıdaki kodu çalıştırın:

```sql
-- 1. Acil Durum: RLS'yi geçici olarak devre dışı bırak
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Hatalı fonksiyonu ve ona bağlı TÜM politikaları ZORLA sil (CASCADE)
-- Bu komut 'cannot drop function' hatasını çözer.
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 3. Diğer olası çakışan politikaları temizle
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.users;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.users;

-- 4. Güvenli Admin Kontrol Fonksiyonunu Yeniden Oluştur
-- SECURITY DEFINER: Bu fonksiyon RLS kurallarını atlar, böylece sonsuz döngü oluşmaz.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- 5. RLS'yi Tekrar Aktif Et
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 6. Yeni ve Temiz Politikaları Tanımla

-- GÖRÜNTÜLEME (SELECT)
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON public.users FOR SELECT 
USING (is_admin());

-- GÜNCELLEME (UPDATE)
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" 
ON public.users FOR UPDATE 
USING (is_admin());

-- EKLEME (INSERT)
CREATE POLICY "Admins can insert profiles" 
ON public.users FOR INSERT 
WITH CHECK (is_admin());

-- SİLME (DELETE)
CREATE POLICY "Admins can delete profiles" 
ON public.users FOR DELETE 
USING (is_admin());
```

## Adım 2: Admin Kullanıcısını Yeniden Eşle (Sync)

Veritabanı kuralları düzeldikten sonra, admin kullanıcısının `public.users` tablosunda doğru role sahip olduğundan emin olmalıyız.

Bunun için mevcut `scripts/create_admin.ts` dosyasını çalıştırarak admin kullanıcısını tekrar senkronize edeceğiz.

## Adım 3: Tarayıcı Önbelleğini Temizle

Veritabanı düzelse bile tarayıcı eski hatalı oturum bilgisini tutuyor olabilir.
1.  `F12` -> **Application** -> **Local Storage** -> Tüm verileri silin.
2.  Sayfayı yenileyin.
3.  `admin@gmail.com` ve `1234samet` ile giriş yapın.
