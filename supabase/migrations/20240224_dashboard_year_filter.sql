-- DROP existing function to update signature
drop function if exists public.refresh_admin_stats();

-- Create updated function with year parameter
create or replace function public.refresh_admin_stats(target_year int default null)
returns void as $$
declare
    -- Dates
    v_target_year int;
    v_is_current_year boolean;
    v_today date := current_date;
    v_year_start date;
    v_year_end date;
    v_month_start date;
    
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
    -- Determine target year (default to current year if null)
    v_target_year := coalesce(target_year, extract(year from current_date)::int);
    v_is_current_year := (v_target_year = extract(year from current_date)::int);
    
    v_year_start := make_date(v_target_year, 1, 1);
    v_year_end := make_date(v_target_year + 1, 1, 1); -- Exclusive
    
    -- For current year, use current month start. For past years, use December (or handled in UI logic)
    -- Actually, daily/monthly stats are mostly relevant for "NOW".
    -- If viewing past year, "Monthly" usually implies "Average Monthly" or "Total for Year"?
    -- Requirement: "güncel yıladaki yılın bir gerisine giderse günlük ve aylık veriler gizlensin"
    -- So we just return null or empty for daily/monthly if not current year.
    
    v_month_start := date_trunc('month', current_date)::date;

    ---------------------------------------------------------------------------
    -- 1. DAILY STATS (Only if Current Year)
    ---------------------------------------------------------------------------
    if v_is_current_year then
        select jsonb_build_object(
            'quote_count', (select count(*) from public.teklifler where tarih = v_today),
            'policy_count', (select count(*) from public.policeler where tanzim_tarihi = v_today),
            'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi = v_today),
            'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi = v_today),
            'active_count', (select count(*) from public.policeler where tanzim_tarihi = v_today and durum != 'İPTAL'),
            'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi = v_today and durum = 'İPTAL')
        ) into v_daily_stats;
    else
        v_daily_stats := null; -- Hidden in UI
    end if;

    ---------------------------------------------------------------------------
    -- 2. MONTHLY STATS (Only if Current Year)
    ---------------------------------------------------------------------------
    if v_is_current_year then
        select jsonb_build_object(
            'quote_count', (select count(*) from public.teklifler where tarih >= v_month_start and tarih < (v_month_start + interval '1 month')),
            'policy_count', (select count(*) from public.policeler where tanzim_tarihi >= v_month_start and tanzim_tarihi < (v_month_start + interval '1 month')),
            'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi >= v_month_start and tanzim_tarihi < (v_month_start + interval '1 month')),
            'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi >= v_month_start and tanzim_tarihi < (v_month_start + interval '1 month')),
            'active_count', (select count(*) from public.policeler where tanzim_tarihi >= v_month_start and tanzim_tarihi < (v_month_start + interval '1 month') and durum != 'İPTAL'),
            'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi >= v_month_start and tanzim_tarihi < (v_month_start + interval '1 month') and durum = 'İPTAL')
        ) into v_monthly_stats;
    else
        v_monthly_stats := null; -- Hidden in UI
    end if;

    ---------------------------------------------------------------------------
    -- 3. YEARLY STATS (Target Year)
    ---------------------------------------------------------------------------
    select jsonb_build_object(
        'quote_count', (select count(*) from public.teklifler where extract(year from tarih) = v_target_year),
        'policy_count', (select count(*) from public.policeler where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end),
        'net_premium', (select coalesce(sum(net_prim), 0) from public.policeler where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end),
        'commission', (select coalesce(sum(komisyon), 0) from public.policeler where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end),
        'active_count', (select count(*) from public.policeler where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end and durum != 'İPTAL'),
        'cancelled_count', (select count(*) from public.policeler where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end and durum = 'İPTAL')
    ) into v_yearly_stats;

    ---------------------------------------------------------------------------
    -- 4. CHARTS & LISTS (Filtered by Year)
    ---------------------------------------------------------------------------

    -- Branch Distribution (Top 8 by Premium Volume)
    with branch_stats as (
        select tur, sum(brut_prim) as total_vol
        from public.policeler
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
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
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
        group by sirket
        order by total_vol desc
        limit 5
    )
    select jsonb_agg(jsonb_build_object('name', sirket, 'value', total_vol))
    into v_top_companies
    from company_stats;

    -- Employee Performance (For the whole selected year)
    with emp_stats as (
        select 
            u.name,
            count(p.id) as policy_count,
            coalesce(sum(p.brut_prim), 0) as total_premium,
            coalesce(sum(p.komisyon), 0) as total_commission
        from public.policeler p
        join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_year_start and p.tanzim_tarihi < v_year_end
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

    -- Monthly Trend (For selected year)
    with months as (
        select generate_series(
            v_year_start,
            v_year_end - interval '1 day',
            '1 month'::interval
        ) as m
    ),
    monthly_data as (
        select 
            date_trunc('month', tanzim_tarihi) as m,
            sum(brut_prim) as total,
            count(*) as count
        from public.policeler
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
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

    -- Recent Activity (Last 5 Policies of that year)
    with recent as (
        select 
            p.police_no, p.ad_soyad, p.brut_prim, p.sirket, p.created_at, u.name as emp_name
        from public.policeler p
        left join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_year_start and p.tanzim_tarihi < v_year_end
        order by p.tanzim_tarihi desc, p.created_at desc
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
    -- 5. SAVE SNAPSHOT (Keyed by Year)
    ---------------------------------------------------------------------------
    
    insert into public.dashboard_stats (type, period, period_date, data)
    values (
        'admin', 
        'year_snapshot', 
        v_year_start, -- Use Jan 1st of target year as key
        jsonb_build_object(
            'year', v_target_year,
            'is_current_year', v_is_current_year,
            'daily', v_daily_stats,
            'monthly', v_monthly_stats,
            'yearly', v_yearly_stats,
            'branch_distribution', coalesce(v_top_branches, '[]'::jsonb),
            'company_distribution', coalesce(v_top_companies, '[]'::jsonb),
            'top_employees', coalesce(v_top_employees, '[]'::jsonb),
            'monthly_trend', coalesce(v_monthly_trend, '[]'::jsonb),
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

-- Trigger Function Update (to refresh current year automatically)
create or replace function public.trigger_refresh_stats()
returns trigger as $$
begin
    -- Refresh admin stats for the CURRENT YEAR (default)
    perform public.refresh_admin_stats();
    -- If update changed date to another year, maybe refresh that year too? 
    -- For now, keep it simple. Only current year auto-refreshes. 
    return null;
end;
$$ language plpgsql;

-- Refresh current year immediately
select public.refresh_admin_stats();
