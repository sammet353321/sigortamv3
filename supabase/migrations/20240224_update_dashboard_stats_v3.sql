create or replace function public.refresh_admin_stats()
returns void as $$
declare
    -- Dates
    v_today date := current_date;
    v_current_month_start date := date_trunc('month', current_date)::date;
    v_current_year_start date := date_trunc('year', current_date)::date;
    
    -- Variables for complex json construction
    v_daily_stats jsonb;
    v_monthly_stats jsonb;
    v_yearly_stats jsonb;
    
    v_top_branches jsonb;
    v_top_companies jsonb;
    v_top_employees jsonb;
    v_monthly_trend jsonb;
    v_daily_trend_30d jsonb;
    v_recent_activity jsonb;
    
begin
    ---------------------------------------------------------------------------
    -- 1. DAILY STATS (Tanzim Tarihi = Today)
    ---------------------------------------------------------------------------
    select jsonb_build_object(
        'quote_count', (select count(*) from public.teklifler where tarih = v_today),
        'policy_count', (select count(*) from public.policeler where tanzim_tarihi = v_today),
        'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi = v_today),
        'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi = v_today),
        'active_count', (select count(*) from public.policeler where tanzim_tarihi = v_today and durum != 'İPTAL'),
        'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi = v_today and durum = 'İPTAL')
    ) into v_daily_stats;

    ---------------------------------------------------------------------------
    -- 2. MONTHLY STATS (Tanzim Tarihi >= Month Start)
    ---------------------------------------------------------------------------
    select jsonb_build_object(
        'quote_count', (select count(*) from public.teklifler where tarih >= v_current_month_start and tarih < (v_current_month_start + interval '1 month')),
        'policy_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_month_start and tanzim_tarihi < (v_current_month_start + interval '1 month')),
        'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi >= v_current_month_start and tanzim_tarihi < (v_current_month_start + interval '1 month')),
        'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi >= v_current_month_start and tanzim_tarihi < (v_current_month_start + interval '1 month')),
        'active_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_month_start and tanzim_tarihi < (v_current_month_start + interval '1 month') and durum != 'İPTAL'),
        'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_month_start and tanzim_tarihi < (v_current_month_start + interval '1 month') and durum = 'İPTAL')
    ) into v_monthly_stats;

    ---------------------------------------------------------------------------
    -- 3. YEARLY STATS (Tanzim Tarihi >= Year Start)
    ---------------------------------------------------------------------------
    select jsonb_build_object(
        'quote_count', (select count(*) from public.teklifler where tarih >= v_current_year_start),
        'policy_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_year_start),
        'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi >= v_current_year_start),
        'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi >= v_current_year_start),
        'active_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_year_start and durum != 'İPTAL'),
        'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi >= v_current_year_start and durum = 'İPTAL')
    ) into v_yearly_stats;

    ---------------------------------------------------------------------------
    -- 4. CHARTS & LISTS
    ---------------------------------------------------------------------------

    -- Branch Distribution (Top 8 by Premium Volume)
    with branch_stats as (
        select tur, sum(brut_prim) as total_vol
        from public.policeler
        where tanzim_tarihi >= v_current_year_start
        group by tur
        order by total_vol desc
        limit 8
    )
    select jsonb_agg(jsonb_build_object('name', tur, 'value', total_vol))
    into v_top_branches
    from branch_stats;

    -- Top Insurance Companies (Top 5 by Premium)
    with company_stats as (
        select sirket, sum(brut_prim) as total_vol
        from public.policeler
        where tanzim_tarihi >= v_current_year_start
        group by sirket
        order by total_vol desc
        limit 5
    )
    select jsonb_agg(jsonb_build_object('name', sirket, 'value', total_vol))
    into v_top_companies
    from company_stats;

    -- Employee Performance (Monthly)
    with emp_stats as (
        select 
            u.name,
            count(p.id) as policy_count,
            coalesce(sum(p.brut_prim), 0) as total_premium,
            coalesce(sum(p.komisyon), 0) as total_commission
        from public.policeler p
        join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_current_month_start
        group by u.id, u.name
        order by total_premium desc
        limit 10
    )
    select jsonb_agg(jsonb_build_object(
        'name', name, 
        'policies', policy_count, 
        'premium', total_premium,
        'commission', total_commission
    ))
    into v_top_employees
    from emp_stats;

    -- Monthly Trend (Last 12 months)
    with months as (
        select generate_series(
            date_trunc('month', current_date) - interval '11 months',
            date_trunc('month', current_date),
            '1 month'::interval
        ) as m
    ),
    monthly_data as (
        select 
            date_trunc('month', tanzim_tarihi) as m,
            sum(brut_prim) as total,
            count(*) as count
        from public.policeler
        where tanzim_tarihi >= (date_trunc('month', current_date) - interval '11 months')
        group by 1
    )
    select jsonb_agg(
        jsonb_build_object(
            'month', to_char(m.m, 'Mon'), 
            'amount', coalesce(md.total, 0),
            'count', coalesce(md.count, 0)
        ) order by m.m
    )
    into v_monthly_trend
    from months m
    left join monthly_data md on md.m = m.m;

    -- Daily Trend (Last 30 Days Sparkline)
    with days as (
        select generate_series(
            current_date - interval '29 days',
            current_date,
            '1 day'::interval
        )::date as d
    ),
    daily_data as (
        select 
            tanzim_tarihi as d,
            sum(brut_prim) as total
        from public.policeler
        where tanzim_tarihi >= (current_date - interval '29 days')
        group by 1
    )
    select jsonb_agg(
        jsonb_build_object(
            'date', to_char(d.d, 'DD Mon'),
            'value', coalesce(dd.total, 0)
        ) order by d.d
    )
    into v_daily_trend_30d
    from days d
    left join daily_data dd on dd.d = d.d;

    -- Recent Activity (Last 5 Policies)
    with recent as (
        select 
            p.police_no, p.ad_soyad, p.brut_prim, p.sirket, p.created_at, u.name as emp_name
        from public.policeler p
        left join public.users u on p.employee_id = u.id
        order by p.created_at desc
        limit 5
    )
    select jsonb_agg(jsonb_build_object(
        'police_no', police_no,
        'customer', ad_soyad,
        'amount', brut_prim,
        'company', sirket,
        'employee', emp_name,
        'time', created_at
    ))
    into v_recent_activity
    from recent;

    ---------------------------------------------------------------------------
    -- 5. SAVE SNAPSHOT
    ---------------------------------------------------------------------------
    
    insert into public.dashboard_stats (type, period, period_date, data)
    values (
        'admin', 
        'snapshot', 
        current_date, 
        jsonb_build_object(
            -- New Structured Periods
            'daily', v_daily_stats,
            'monthly', v_monthly_stats,
            'yearly', v_yearly_stats,
            
            -- Charts & Lists
            'branch_distribution', coalesce(v_top_branches, '[]'::jsonb),
            'company_distribution', coalesce(v_top_companies, '[]'::jsonb),
            'top_employees', coalesce(v_top_employees, '[]'::jsonb),
            'monthly_trend', coalesce(v_monthly_trend, '[]'::jsonb),
            'daily_trend', coalesce(v_daily_trend_30d, '[]'::jsonb),
            'recent_activity', coalesce(v_recent_activity, '[]'::jsonb),
            
            'last_updated', now()
        )
    )
    on conflict (type, period, period_date) where user_id is null
    do update set 
        data = EXCLUDED.data,
        updated_at = now();

end;
$$ language plpgsql security definer;

-- Trigger immediate refresh
select public.refresh_admin_stats();