-- TRUNCATE policeler table to remove all data
-- CASCADE to remove dependent rows in other tables if any (like dashboard stats might need refresh)
truncate table public.policeler cascade;

-- Also clear the dashboard stats to start fresh
truncate table public.dashboard_stats;

-- Reset the refresh trigger logic just in case (already done but safe to re-run)
select public.refresh_admin_stats();
