-- GLOBAL OPTIMIZATION & SECURITY MIGRATION
-- 1. PERFORMANCE: ADD INDEXES TO ALL FOREIGN KEYS
-- Tables: policeler, teklifler, employee_stats, chat_groups, etc.

-- Policeler (Policies)
CREATE INDEX IF NOT EXISTS idx_policeler_employee_id ON public.policeler(employee_id);
CREATE INDEX IF NOT EXISTS idx_policeler_plaka ON public.policeler(plaka);
CREATE INDEX IF NOT EXISTS idx_policeler_tc_vkn ON public.policeler(tc_vkn);
CREATE INDEX IF NOT EXISTS idx_policeler_tarih ON public.policeler(tarih DESC);

-- Teklifler (Proposals)
CREATE INDEX IF NOT EXISTS idx_teklifler_employee_id ON public.teklifler(employee_id);
CREATE INDEX IF NOT EXISTS idx_teklifler_plaka ON public.teklifler(plaka);
CREATE INDEX IF NOT EXISTS idx_teklifler_tarih ON public.teklifler(tarih DESC);

-- Chat Groups & Members
CREATE INDEX IF NOT EXISTS idx_chat_groups_assigned_group_id ON public.chat_groups(assigned_employee_group_id);
CREATE INDEX IF NOT EXISTS idx_chat_groups_created_by ON public.chat_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_group_id ON public.chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_phone ON public.chat_group_members(phone);

-- Employee Stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_employee_id ON public.daily_employee_stats(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON public.daily_employee_stats(date DESC);

-- 2. SECURITY: ENABLE RLS ON ALL TABLES
-- Check and enable RLS for critical tables if not already enabled

ALTER TABLE public.policeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teklifler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- 3. BASIC SECURITY POLICIES (If missing)
-- Policy: Allow authenticated users to view common data (Adjust logic as needed for stricter access)

-- Companies (Usually public/read-only for employees)
DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
CREATE POLICY "Authenticated users can view companies" ON public.companies
    FOR SELECT USING (auth.role() = 'authenticated');

-- Employee Groups
DROP POLICY IF EXISTS "Authenticated users can view employee groups" ON public.employee_groups;
CREATE POLICY "Authenticated users can view employee groups" ON public.employee_groups
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. CLEANUP POTENTIAL ORPHANED DATA
-- Example: Delete chat group members if group no longer exists (Optional, but good for hygiene)
DELETE FROM public.chat_group_members 
WHERE group_id NOT IN (SELECT id FROM public.chat_groups);

-- 5. VACUUM ANALYZE (Hint to Postgres to update stats)
-- Note: Cannot run VACUUM inside a transaction block in migrations usually, 
-- so we skip explicit VACUUM here, but the indexes will help auto-vacuum.

