-- Create a dashboard_stats table to store pre-calculated statistics
create table if not exists public.dashboard_stats (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id), -- Null for admin/global stats, specific UUID for employee
    type text not null, -- 'admin' or 'employee'
    period text not null, -- 'daily', 'monthly', 'yearly', 'total'
    period_date date, -- The start date of the period (e.g., 2024-02-01)
    data jsonb not null default '{}'::jsonb, -- Flexible JSON storage for various metrics
    updated_at timestamptz default now(),
    created_at timestamptz default now()
);

-- Index for faster lookups (Unique Index for ON CONFLICT)
create unique index if not exists idx_dashboard_stats_unique_admin 
on public.dashboard_stats(type, period, period_date) 
where user_id is null;

create unique index if not exists idx_dashboard_stats_unique_user 
on public.dashboard_stats(type, user_id, period, period_date) 
where user_id is not null;

-- Enable RLS
alter table public.dashboard_stats enable row level security;

-- Policies
create policy "Admins can view all stats"
    on public.dashboard_stats for select
    to authenticated
    using (
        (select role from public.users where id = auth.uid()) = 'admin'
    );

create policy "Employees can view their own stats"
    on public.dashboard_stats for select
    to authenticated
    using (
        user_id = auth.uid()
    );

-- Allow service role or functions to manage this table (RLS bypassed for triggers usually, but explicit grant is good)
grant all on public.dashboard_stats to service_role;
grant select on public.dashboard_stats to authenticated;

-- Create a function to refresh admin stats
create or replace function public.refresh_admin_stats()
returns void as $$
declare
    v_total_policies int;
    v_total_quotes int;
    v_monthly_premium numeric;
    v_monthly_commission numeric;
    v_daily_production numeric;
    v_top_branches jsonb;
    v_top_employees jsonb;
    v_monthly_trend jsonb;
    v_current_month_start date := date_trunc('month', current_date)::date;
    v_today date := current_date;
begin
    -- 1. Total Counts (All time)
    select count(*) into v_total_policies from public.policeler;
    select count(*) into v_total_quotes from public.teklifler;

    -- 2. Monthly Financials (Current Month)
    select 
        coalesce(sum(brut_prim), 0),
        coalesce(sum(komisyon), 0)
    into v_monthly_premium, v_monthly_commission
    from public.policeler
    where tanzim_tarihi >= v_current_month_start 
      and tanzim_tarihi < (v_current_month_start + interval '1 month');

    -- 3. Daily Production (Today)
    select coalesce(sum(brut_prim), 0)
    into v_daily_production
    from public.policeler
    where tanzim_tarihi = v_today;

    -- 4. Branch Distribution (Top 6) - All time or Monthly? Usually Monthly for trend, but let's do All Time for distribution chart
    with branch_counts as (
        select tur, count(*) as c
        from public.policeler
        group by tur
        order by c desc
        limit 6
    )
    select jsonb_agg(jsonb_build_object('name', tur, 'value', c))
    into v_top_branches
    from branch_counts;

    -- 5. Top Employees (Monthly)
    with emp_stats as (
        select 
            u.name,
            count(p.id) as policy_count,
            sum(p.brut_prim) as total_premium
        from public.policeler p
        join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_current_month_start
        group by u.id, u.name
        order by total_premium desc
        limit 5
    )
    select jsonb_agg(jsonb_build_object('name', name, 'policies', policy_count, 'premium', total_premium))
    into v_top_employees
    from emp_stats;

    -- 6. Monthly Trend (Last 6 months)
    with months as (
        select generate_series(
            date_trunc('month', current_date) - interval '5 months',
            date_trunc('month', current_date),
            '1 month'::interval
        ) as m
    ),
    monthly_data as (
        select 
            date_trunc('month', tanzim_tarihi) as m,
            sum(brut_prim) as total
        from public.policeler
        where tanzim_tarihi >= (date_trunc('month', current_date) - interval '5 months')
        group by 1
    )
    select jsonb_agg(
        jsonb_build_object(
            'month', to_char(m.m, 'Mon'), 
            'amount', coalesce(md.total, 0)
        ) order by m.m
    )
    into v_monthly_trend
    from months m
    left join monthly_data md on md.m = m.m;

    -- UPSERT Admin Stats
    -- We'll store everything in a single 'summary' record for simplicity, or split by period.
    -- Let's store a 'current_snapshot' type.
    
    insert into public.dashboard_stats (type, period, period_date, data)
    values (
        'admin', 
        'snapshot', 
        current_date, 
        jsonb_build_object(
            'total_policies', v_total_policies,
            'total_quotes', v_total_quotes,
            'monthly_premium', v_monthly_premium,
            'monthly_commission', v_monthly_commission,
            'daily_production', v_daily_production,
            'branch_distribution', coalesce(v_top_branches, '[]'::jsonb),
            'top_employees', coalesce(v_top_employees, '[]'::jsonb),
            'monthly_trend', coalesce(v_monthly_trend, '[]'::jsonb),
            'last_updated', now()
        )
    )
    on conflict (type, period, period_date) where user_id is null
    do update set 
        data = EXCLUDED.data,
        updated_at = now();

end;
$$ language plpgsql security definer;

-- Trigger Function to call refresh
create or replace function public.trigger_refresh_stats()
returns trigger as $$
begin
    -- Refresh admin stats (global)
    perform public.refresh_admin_stats();
    
    -- TODO: Add employee specific refresh if needed
    
    return null;
end;
$$ language plpgsql;

-- Triggers
drop trigger if exists on_policy_change_stats on public.policeler;
create trigger on_policy_change_stats
after insert or update or delete on public.policeler
for each statement
execute function public.trigger_refresh_stats();

drop trigger if exists on_quote_change_stats on public.teklifler;
create trigger on_quote_change_stats
after insert or update or delete on public.teklifler
for each statement
execute function public.trigger_refresh_stats();

-- Initial Run
select public.refresh_admin_stats();
