-- Add new columns to teklifler table if they don't exist
-- We use 'if not exists' logic by using DO block or just adding them safely

DO $$
BEGIN
    -- tanzim_tarihi (Creation Date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'tanzim_tarihi') THEN
        ALTER TABLE teklifler ADD COLUMN tanzim_tarihi TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- ilgili_kisi (For Group/Tali Name - Text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'ilgili_kisi') THEN
        ALTER TABLE teklifler ADD COLUMN ilgili_kisi TEXT;
    END IF;

    -- kesen (For Employee Name - Text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'kesen') THEN
        ALTER TABLE teklifler ADD COLUMN kesen TEXT;
    END IF;

    -- Make sure police_no is text to hold price info
    -- We can't easily change type if data exists, but it's likely text or varchar.
    -- If it's not, we might need to alter it. Assuming it is text.

    -- Make sure sirket exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'sirket') THEN
        ALTER TABLE teklifler ADD COLUMN sirket TEXT;
    END IF;
    
    -- Make sure ek_bilgiler exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teklifler' AND column_name = 'ek_bilgiler') THEN
        ALTER TABLE teklifler ADD COLUMN ek_bilgiler TEXT;
    END IF;

END $$;
