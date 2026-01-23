-- Add tanzim_tarihi to teklifler and policeler if not exists
ALTER TABLE teklifler ADD COLUMN IF NOT EXISTS tanzim_tarihi DATE;
CREATE INDEX IF NOT EXISTS idx_teklifler_tanzim_tarihi ON teklifler(tanzim_tarihi);

ALTER TABLE policeler ADD COLUMN IF NOT EXISTS tanzim_tarihi DATE;
CREATE INDEX IF NOT EXISTS idx_policeler_tanzim_tarihi ON policeler(tanzim_tarihi);
