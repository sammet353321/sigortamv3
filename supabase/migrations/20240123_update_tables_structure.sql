
-- 1. Policeler tablosunu guncelle (eksik sutunlar ve tipler)
ALTER TABLE public.policeler 
ADD COLUMN IF NOT EXISTS dogum_tarihi date,
ADD COLUMN IF NOT EXISTS sirket text,
ADD COLUMN IF NOT EXISTS tarih date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS sasi text,
ADD COLUMN IF NOT EXISTS plaka text,
ADD COLUMN IF NOT EXISTS tc_vkn text,
ADD COLUMN IF NOT EXISTS belge_no text,
ADD COLUMN IF NOT EXISTS arac_cinsi text,
ADD COLUMN IF NOT EXISTS brut_prim numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tur text,
ADD COLUMN IF NOT EXISTS kesen text, -- Kesen kisi adi (text olarak saklanacak, user iliskisi zorunlu degil)
ADD COLUMN IF NOT EXISTS ilgili_kisi text, -- Ilgili kisi adi (text olarak saklanacak)
ADD COLUMN IF NOT EXISTS police_no text,
ADD COLUMN IF NOT EXISTS acente text,
ADD COLUMN IF NOT EXISTS kart text,
ADD COLUMN IF NOT EXISTS ek_bilgiler_iletisim text,
ADD COLUMN IF NOT EXISTS net_prim numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS komisyon numeric DEFAULT 0;

-- Unique constraint for police_no to prevent duplicates
ALTER TABLE public.policeler DROP CONSTRAINT IF EXISTS policeler_police_no_key;
ALTER TABLE public.policeler ADD CONSTRAINT policeler_police_no_key UNIQUE (police_no);


-- 2. Teklifler tablosunu guncelle (eksik sutunlar ve tipler)
ALTER TABLE public.teklifler
ADD COLUMN IF NOT EXISTS dogum_tarihi date,
ADD COLUMN IF NOT EXISTS sirket text,
ADD COLUMN IF NOT EXISTS tarih date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS sasi text,
ADD COLUMN IF NOT EXISTS plaka text,
ADD COLUMN IF NOT EXISTS tc_vkn text,
ADD COLUMN IF NOT EXISTS belge_no text,
ADD COLUMN IF NOT EXISTS arac_cinsi text,
ADD COLUMN IF NOT EXISTS brut_prim numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tur text,
ADD COLUMN IF NOT EXISTS kesen text,
ADD COLUMN IF NOT EXISTS ilgili_kisi text,
ADD COLUMN IF NOT EXISTS police_no text,
ADD COLUMN IF NOT EXISTS acente text,
ADD COLUMN IF NOT EXISTS kart text,
ADD COLUMN IF NOT EXISTS ek_bilgiler_iletisim text,
ADD COLUMN IF NOT EXISTS net_prim numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS komisyon numeric DEFAULT 0;
