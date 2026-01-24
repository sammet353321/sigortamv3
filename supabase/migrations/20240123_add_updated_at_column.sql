
-- Policeler tablosuna 'updated_at' sütunu ekle
ALTER TABLE public.policeler 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Teklifler tablosuna da 'updated_at' sütunu ekle (tutarlılık için)
ALTER TABLE public.teklifler
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
