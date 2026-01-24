
-- Policeler tablosuna 'durum' sütunu ekle
ALTER TABLE public.policeler 
ADD COLUMN IF NOT EXISTS durum text DEFAULT 'POLİÇE';

-- Teklifler tablosuna da 'durum' sütunu ekle (tutarlılık için)
ALTER TABLE public.teklifler
ADD COLUMN IF NOT EXISTS durum text DEFAULT 'POLİÇE';
