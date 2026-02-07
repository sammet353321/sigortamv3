-- 1. Eksik Kolonları Ekle (Güvenli şekilde)
DO $$
BEGIN
    -- tanzim_tarihi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'tanzim_tarihi') THEN
        ALTER TABLE teklifler ADD COLUMN tanzim_tarihi TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- ilgili_kisi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'ilgili_kisi') THEN
        ALTER TABLE teklifler ADD COLUMN ilgili_kisi TEXT;
    END IF;

    -- kesen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'kesen') THEN
        ALTER TABLE teklifler ADD COLUMN kesen TEXT;
    END IF;

    -- ek_bilgiler_iletisim
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'ek_bilgiler_iletisim') THEN
        ALTER TABLE teklifler ADD COLUMN ek_bilgiler_iletisim TEXT;
    END IF;
    
    -- kart (kart_bilgisi yerine)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'kart') THEN
        ALTER TABLE teklifler ADD COLUMN kart TEXT;
    END IF;
END $$;

-- 2. RLS Politikalarını Düzelt (Row Level Security)
-- Bu bölüm "new row violates row-level security policy" hatasını çözer.

ALTER TABLE teklifler ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları temizle (Çakışmayı önlemek için)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON teklifler;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON teklifler;
DROP POLICY IF EXISTS "Enable update for users based on email" ON teklifler;
DROP POLICY IF EXISTS "Authenticated users can insert teklifler" ON teklifler;
DROP POLICY IF EXISTS "Users can view their own teklifler" ON teklifler;
DROP POLICY IF EXISTS "service_role_manage_teklifler" ON teklifler;

-- Yeni Politikalar: Giriş yapmış herkes (authenticated) işlem yapabilir.
CREATE POLICY "Authenticated users can insert teklifler" 
ON teklifler 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can select teklifler" 
ON teklifler 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can update teklifler" 
ON teklifler 
FOR UPDATE 
TO authenticated 
USING (true);

-- Service Role (Backend/Bot) için tam yetki
CREATE POLICY "service_role_manage_teklifler" 
ON teklifler 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
