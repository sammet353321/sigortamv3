-- 1. Essential Indexes for Filtering & Sorting
-- Composite index for Employee Dashboard (most common query)
CREATE INDEX IF NOT EXISTS idx_policeler_emp_date 
ON policeler (employee_id, tanzim_tarihi DESC);

-- Index for Global Date Filtering (Admin Dashboard)
CREATE INDEX IF NOT EXISTS idx_policeler_tanzim_date 
ON policeler (tanzim_tarihi DESC);

-- Index for Text Search (Trigram index for fuzzy search on text fields)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_policeler_search 
ON policeler USING GIN (
  (plaka || ' ' || tc_vkn || ' ' || ad_soyad || ' ' || police_no) gin_trgm_ops
);

-- 2. Materialized Summary Tables (For Dashboards)
-- We avoid querying the main table for dashboards.
CREATE TABLE IF NOT EXISTS daily_employee_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES auth.users(id),
    date DATE DEFAULT CURRENT_DATE,
    quote_count INT DEFAULT 0,
    policy_count INT DEFAULT 0,
    total_premium NUMERIC(15,2) DEFAULT 0,
    total_commission NUMERIC(15,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- 3. Trigger to Auto-Update Stats
CREATE OR REPLACE FUNCTION update_daily_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_employee_stats (employee_id, date, quote_count, policy_count, total_premium, total_commission)
    VALUES (
        NEW.employee_id, 
        CURRENT_DATE, 
        CASE WHEN TG_TABLE_NAME = 'teklifler' THEN 1 ELSE 0 END,
        CASE WHEN TG_TABLE_NAME = 'policeler' THEN 1 ELSE 0 END,
        CASE WHEN TG_TABLE_NAME = 'policeler' THEN COALESCE(NEW.net_prim, 0) ELSE 0 END,
        CASE WHEN TG_TABLE_NAME = 'policeler' THEN COALESCE(NEW.komisyon, 0) ELSE 0 END
    )
    ON CONFLICT (employee_id, date)
    DO UPDATE SET
        quote_count = daily_employee_stats.quote_count + EXCLUDED.quote_count,
        policy_count = daily_employee_stats.policy_count + EXCLUDED.policy_count,
        total_premium = daily_employee_stats.total_premium + EXCLUDED.total_premium,
        total_commission = daily_employee_stats.total_commission + EXCLUDED.total_commission,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trigger_update_stats_policies ON policeler;
CREATE TRIGGER trigger_update_stats_policies
AFTER INSERT ON policeler
FOR EACH ROW EXECUTE FUNCTION update_daily_stats();

-- Enable RLS
ALTER TABLE policeler ENABLE ROW LEVEL SECURITY;

-- 1. Employees see ONLY their own data
DROP POLICY IF EXISTS "Employees view own policies" ON policeler;
CREATE POLICY "Employees view own policies" 
ON policeler FOR SELECT 
USING (
  auth.uid() = employee_id 
  OR 
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- 2. Insert Policy (Auto-assign employee_id)
DROP POLICY IF EXISTS "Employees insert own policies" ON policeler;
CREATE POLICY "Employees insert own policies"
ON policeler FOR INSERT
WITH CHECK (
  auth.uid() = employee_id
);

-- 3. Update Policy
DROP POLICY IF EXISTS "Employees update own policies" ON policeler;
CREATE POLICY "Employees update own policies"
ON policeler FOR UPDATE
USING (auth.uid() = employee_id);
