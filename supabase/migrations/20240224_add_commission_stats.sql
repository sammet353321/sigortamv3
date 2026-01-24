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
    
    v_company_distribution jsonb;
    v_product_distribution jsonb;
    v_top_employees jsonb;
    v_monthly_trend jsonb;
    v_recent_activity jsonb;
    
begin
    -- Determine target year (default to current year if null)
    v_target_year := coalesce(target_year, extract(year from current_date)::int);
    v_is_current_year := (v_target_year = extract(year from current_date)::int);
    
    v_year_start := make_date(v_target_year, 1, 1);
    v_year_end := make_date(v_target_year + 1, 1, 1); -- Exclusive
    
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
        v_daily_stats := null;
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
        v_monthly_stats := null;
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
    -- 4. CHARTS & LISTS
    ---------------------------------------------------------------------------

    -- Company Distribution (ALL companies)
    with company_stats as (
        select sirket, sum(net_prim) as total_vol, count(*) as c
        from public.policeler
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
        group by sirket
        order by total_vol desc
    )
    select jsonb_agg(jsonb_build_object('name', sirket, 'value', total_vol, 'count', c))
    into v_company_distribution
    from company_stats;

    -- Product Distribution (By Tur/Brans)
    with product_stats as (
        select tur, sum(net_prim) as total_vol, count(*) as c
        from public.policeler
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
        group by tur
        order by total_vol desc
    )
    select jsonb_agg(jsonb_build_object('name', tur, 'value', total_vol, 'count', c))
    into v_product_distribution
    from product_stats;

    -- Employee Performance
    with emp_stats as (
        select 
            u.name,
            count(p.id) as policy_count,
            coalesce(sum(p.net_prim), 0) as total_premium, 
            coalesce(sum(p.komisyon), 0) as total_commission
        from public.policeler p
        join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_year_start and p.tanzim_tarihi < v_year_end
        group by u.id, u.name
        order by total_premium desc
        limit 20
    )
    select jsonb_agg(jsonb_build_object(
        'name', name, 
        'policies', policy_count, 
        'premium', total_premium,
        'commission', total_commission
    ))
    into v_top_employees
    from emp_stats;

    -- Monthly Trend (Includes Commission now)
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
            sum(net_prim) as total_premium,
            sum(komisyon) as total_commission,
            count(*) as count
        from public.policeler
        where tanzim_tarihi >= v_year_start and tanzim_tarihi < v_year_end
        group by 1
    )
    select jsonb_agg(
        jsonb_build_object(
            'month', to_char(m.m, 'Mon'), 
            'month_num', extract(month from m.m),
            'amount', coalesce(md.total_premium, 0),
            'commission', coalesce(md.total_commission, 0), -- Added Commission
            'count', coalesce(md.count, 0)
        ) order by m.m
    )
    into v_monthly_trend
    from months m
    left join monthly_data md on md.m = m.m;

    -- Recent Activity
    with recent as (
        select 
            p.police_no, p.ad_soyad, p.net_prim, p.sirket, p.created_at, u.name as emp_name
        from public.policeler p
        left join public.users u on p.employee_id = u.id
        where p.tanzim_tarihi >= v_year_start and p.tanzim_tarihi < v_year_end
        order by p.tanzim_tarihi desc, p.created_at desc
        limit 5
    )
    select jsonb_agg(jsonb_build_object(
        'police_no', police_no,
        'customer', ad_soyad,
        'amount', net_prim,
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
        'year_snapshot', 
        v_year_start,
        jsonb_build_object(
            'year', v_target_year,
            'is_current_year', v_is_current_year,
            'daily', v_daily_stats,
            'monthly', v_monthly_stats,
            'yearly', v_yearly_stats,
            'company_distribution', coalesce(v_company_distribution, '[]'::jsonb),
            'product_distribution', coalesce(v_product_distribution, '[]'::jsonb),
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

-- Trigger refresh
select public.refresh_admin_stats();