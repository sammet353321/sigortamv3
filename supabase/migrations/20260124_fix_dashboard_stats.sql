CREATE OR REPLACE FUNCTION refresh_admin_stats(target_year int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    start_date date := make_date(target_year, 1, 1);
    end_date date := make_date(target_year, 12, 31);
    
    -- Variables for aggregation
    v_quote_count int;
    v_policy_count int;
    v_active_count int;
    v_cancelled_count int;
    v_net_premium numeric;
    v_commission numeric;
    
    -- JSONB containers
    v_daily jsonb;
    v_monthly jsonb;
    v_yearly jsonb;
    v_company_dist jsonb;
    v_product_dist jsonb;
    v_recent_activity jsonb;
    v_staff_performance jsonb;
BEGIN
    -- 1. BASIC COUNTS (Whole Year)
    SELECT count(*) INTO v_quote_count FROM teklifler 
    WHERE EXTRACT(YEAR FROM tarih) = target_year;

    SELECT count(*) INTO v_policy_count FROM policeler 
    WHERE EXTRACT(YEAR FROM tarih) = target_year;

    SELECT count(*) INTO v_active_count FROM policeler 
    WHERE EXTRACT(YEAR FROM tarih) = target_year AND durum != 'İPTAL';

    SELECT count(*) INTO v_cancelled_count FROM policeler 
    WHERE EXTRACT(YEAR FROM tarih) = target_year AND durum = 'İPTAL';

    SELECT COALESCE(SUM(net_prim), 0), COALESCE(SUM(komisyon), 0) 
    INTO v_net_premium, v_commission
    FROM policeler 
    WHERE EXTRACT(YEAR FROM tarih) = target_year AND durum != 'İPTAL';

    -- 2. DAILY STATS (Today)
    SELECT json_build_object(
        'quote_count', (SELECT count(*) FROM teklifler WHERE tarih = CURRENT_DATE),
        'policy_count', (SELECT count(*) FROM policeler WHERE tarih = CURRENT_DATE),
        'active_count', (SELECT count(*) FROM policeler WHERE tarih = CURRENT_DATE AND durum != 'İPTAL'),
        'cancelled_count', (SELECT count(*) FROM policeler WHERE tarih = CURRENT_DATE AND durum = 'İPTAL'),
        'net_premium', (SELECT COALESCE(SUM(net_prim), 0) FROM policeler WHERE tarih = CURRENT_DATE AND durum != 'İPTAL'),
        'commission', (SELECT COALESCE(SUM(komisyon), 0) FROM policeler WHERE tarih = CURRENT_DATE AND durum != 'İPTAL')
    ) INTO v_daily;

    -- 3. MONTHLY STATS (Current Month)
    -- Fixed: Uses date_trunc to cover full month from day 1 to end
    SELECT json_build_object(
        'quote_count', (SELECT count(*) FROM teklifler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE)),
        'policy_count', (SELECT count(*) FROM policeler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE)),
        'active_count', (SELECT count(*) FROM policeler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE) AND durum != 'İPTAL'),
        'cancelled_count', (SELECT count(*) FROM policeler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE) AND durum = 'İPTAL'),
        'net_premium', (SELECT COALESCE(SUM(net_prim), 0) FROM policeler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE) AND durum != 'İPTAL'),
        'commission', (SELECT COALESCE(SUM(komisyon), 0) FROM policeler WHERE date_trunc('month', tarih) = date_trunc('month', CURRENT_DATE) AND durum != 'İPTAL')
    ) INTO v_monthly;

    -- 4. YEARLY STATS OBJECT
    v_yearly := json_build_object(
        'quote_count', v_quote_count,
        'policy_count', v_policy_count,
        'active_count', v_active_count,
        'cancelled_count', v_cancelled_count,
        'net_premium', v_net_premium,
        'commission', v_commission
    );

    -- 5. COMPANY DISTRIBUTION (Top 10 by Premium)
    SELECT json_agg(t) INTO v_company_dist FROM (
        SELECT sirket as name, count(*) as count, SUM(brut_prim) as value
        FROM policeler
        WHERE EXTRACT(YEAR FROM tarih) = target_year AND durum != 'İPTAL'
        GROUP BY sirket
        ORDER BY value DESC
        LIMIT 10
    ) t;

    -- 6. PRODUCT DISTRIBUTION (By Tur)
    SELECT json_agg(t) INTO v_product_dist FROM (
        SELECT tur as name, count(*) as count, SUM(brut_prim) as value
        FROM policeler
        WHERE EXTRACT(YEAR FROM tarih) = target_year AND durum != 'İPTAL'
        GROUP BY tur
        ORDER BY value DESC
    ) t;

    -- 7. RECENT ACTIVITY (Last 20)
    SELECT json_agg(t) INTO v_recent_activity FROM (
        SELECT 
            p.id, p.plaka, p.ad_soyad, p.sirket, p.tarih, p.tur, 'policy' as type,
            u.name as user_name
        FROM policeler p
        LEFT JOIN auth.users u ON p.employee_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 20
    ) t;

    -- 8. STAFF PERFORMANCE (This Month)
    SELECT json_agg(t) INTO v_staff_performance FROM (
        SELECT 
            u.name,
            u.email,
            count(p.id) as policy_count,
            SUM(p.brut_prim) as premium,
            SUM(p.komisyon) as commission
        FROM auth.users u
        LEFT JOIN policeler p ON p.employee_id = u.id
        WHERE 
            date_trunc('month', p.tarih) = date_trunc('month', CURRENT_DATE)
            AND p.durum != 'İPTAL'
        GROUP BY u.id, u.name, u.email
        ORDER BY premium DESC
    ) t;

    -- UPSERT into dashboard_stats
    INSERT INTO dashboard_stats (type, period, period_date, data)
    VALUES (
        'admin', 
        'year_snapshot', 
        start_date,
        json_build_object(
            'daily', v_daily,
            'monthly', v_monthly,
            'yearly', v_yearly,
            'company_distribution', COALESCE(v_company_dist, '[]'::jsonb),
            'product_distribution', COALESCE(v_product_dist, '[]'::jsonb),
            'recent_activity', COALESCE(v_recent_activity, '[]'::jsonb),
            'staff_performance', COALESCE(v_staff_performance, '[]'::jsonb),
            'last_updated', NOW()
        )
    )
    ON CONFLICT (type, period, period_date) 
    DO UPDATE SET 
        data = EXCLUDED.data,
        updated_at = NOW();

END;
$$;
