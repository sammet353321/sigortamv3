-- 1. DROP EXISTING TRIGGERS TO ENSURE CLEAN SLATE
drop trigger if exists on_policy_change_stats on public.policeler;
drop trigger if exists on_quote_change_stats on public.teklifler;

-- 2. CREATE/UPDATE TRIGGER FUNCTION
create or replace function public.trigger_refresh_stats()
returns trigger as $$
begin
    -- Refresh admin stats (global)
    perform public.refresh_admin_stats();
    return null;
end;
$$ language plpgsql security definer;

-- 3. RE-CREATE TRIGGERS (FOR EACH STATEMENT is efficient for bulk imports)
create trigger on_policy_change_stats
after insert or update or delete on public.policeler
for each statement
execute function public.trigger_refresh_stats();

create trigger on_quote_change_stats
after insert or update or delete on public.teklifler
for each statement
execute function public.trigger_refresh_stats();

-- 4. FIX RLS POLICIES (Make sure authenticated users can READ the stats)
alter table public.dashboard_stats enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Admins can view all stats" on public.dashboard_stats;
drop policy if exists "Employees can view their own stats" on public.dashboard_stats;
drop policy if exists "Authenticated users can view admin stats" on public.dashboard_stats;

-- Create a permissive policy for now (Authenticated users can read admin stats)
create policy "Authenticated users can view admin stats"
on public.dashboard_stats for select
to authenticated
using (true);

-- 5. FORCE DATA REFRESH NOW
select public.refresh_admin_stats();
