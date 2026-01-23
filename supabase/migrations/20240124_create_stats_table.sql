-- Create Stats Table
CREATE TABLE IF NOT EXISTS public.employee_stats_daily (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES auth.users(id),
    date DATE NOT NULL,
    quotes_count INT DEFAULT 0,
    policies_count INT DEFAULT 0,
    total_premium DECIMAL(12, 2) DEFAULT 0,
    total_commission DECIMAL(12, 2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one record per employee per day
    UNIQUE(employee_id, date)
);

-- Enable RLS
ALTER TABLE public.employee_stats_daily ENABLE ROW LEVEL SECURITY;

-- RLS: Employees see only their own stats
CREATE POLICY "Employees can see own stats" ON public.employee_stats_daily
    FOR SELECT
    USING (auth.uid() = employee_id);

-- RLS: Admins/Managers can see all stats
-- Assuming 'admin' role check via a public.users table or claim
-- For simplicity in this script, we assume a function `is_admin()` exists or we use a direct check if possible.
-- Adjusting to common pattern:
CREATE POLICY "Admins can see all stats" ON public.employee_stats_daily
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Indexes for fast date range queries
CREATE INDEX IF NOT EXISTS idx_stats_employee_date ON public.employee_stats_daily (employee_id, date);
CREATE INDEX IF NOT EXISTS idx_stats_date ON public.employee_stats_daily (date);
