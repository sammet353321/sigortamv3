# Supabase Sonsuz Döngü (Infinite Recursion) Sorunu Çözüm Planı

Yaşadığınız `infinite recursion` (sonsuz döngü) hatası, veritabanındaki güvenlik kuralının (RLS Policy), "Kullanıcı Admin mi?" diye kontrol ederken tekrar aynı kuralı tetiklemesinden kaynaklanıyor. Bu, iç içe geçmiş aynalar gibi sonsuz bir döngü yaratır.

Çözüm, **`is_admin`** fonksiyonunu `SECURITY DEFINER` (Güvenli Tanımlayıcı) özelliğiyle oluşturmaktır. Bu özellik, fonksiyonun kuralları "bypass" etmesini sağlar ve döngüyü kırar.

Daha önce aldığınız `"cannot drop function... because other objects depend on it"` hatası, eski hatalı kuralların silinmesini engellediği için çözüm uygulanamamış.

## Adım 1: SQL Kodunu (CASCADE ile) Çalıştırın

Aşağıdaki SQL kodu, **CASCADE** komutu sayesinde hata veren tüm eski bağlantıları zorla temizler ve sistemi sıfırdan güvenli bir şekilde kurar.

Lütfen Supabase SQL Editor'de bu kodu çalıştırın:

```sql
-- 1. RLS'yi geçici olarak durdur (Sistemi rahatlatır)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Hatalı fonksiyonu ve ona bağlı TÜM politikaları ZORLA sil (CASCADE)
-- Bu komut 'cannot drop function' hatasını çözer.
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 3. Diğer olası çakışan politikaları temizle
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.users;

-- 4. Güvenli Admin Fonksiyonunu (SECURITY DEFINER ile) Oluştur
-- Bu fonksiyon RLS'yi bypass ettiği için sonsuz döngüye girmez.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- RLS'yi atlar
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

-- 5. RLS'yi Tekrar Başlat
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 6. Temiz Politikaları Tanımla

-- Herkes kendi profilini görür
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- Adminler herkesi görür
CREATE POLICY "Admins can view all profiles" ON public.users FOR SELECT USING (is_admin());

-- Herkes kendi profilini günceller
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Adminler herkesi günceller
CREATE POLICY "Admins can update all profiles" ON public.users FOR UPDATE USING (is_admin());

-- Adminler ekleme yapabilir
CREATE POLICY "Admins can insert profiles" ON public.users FOR INSERT WITH CHECK (is_admin());

-- Adminler silme yapabilir
CREATE POLICY "Admins can delete profiles" ON public.users FOR DELETE USING (is_admin());
```

## Adım 2: Tarayıcı Önbelleğini Temizleyin

Veritabanı düzeldikten sonra, tarayıcınızın eski oturum bilgisini kullanmaya çalışması hatanın devam etmesine (veya "Kullanıcı rolü bulunamadı" hatasına) neden olabilir.

1.  Uygulamanın açık olduğu sekmede `F12`'ye basarak Geliştirici Araçlarını açın.
2.  **Application** (Uygulama) sekmesine gidin.
3.  Soldaki menüden **Local Storage** (Yerel Depolama) seçeneğini açın.
4.  `http://localhost:5173` altındaki tüm kayıtları (özellikle `sb-...-auth-token`) sağ tıklayıp silin (Clear).
5.  Sayfayı yenileyin ve `admin@gmail.com` ile tekrar giriş yapın.

## Adım 3: Kontrol (Opsiyonel)

Eğer hala hata alırsanız, `is_admin` fonksiyonunun doğru oluşturulup oluşturulmadığını kontrol etmek için şu sorguyu çalıştırın:

```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'is_admin';
```
*   Sonuçta `prosecdef` değeri `t` (true) olmalıdır. Eğer `f` ise `SECURITY DEFINER` özelliği eksik demektir.
