-- Backfill tanzim_tarihi for records where it is NULL
-- We set it to the value of 'tarih' (Policy Date)
update public.policeler
set tanzim_tarihi = tarih
where tanzim_tarihi is null;

-- This update should fire the trigger 'on_policy_change_stats' automatically,
-- causing the dashboard stats to refresh.

-- Just in case, force a refresh after update
select public.refresh_admin_stats();
