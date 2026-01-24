-- Create Admin Dashboard Cache Table
CREATE TABLE IF NOT EXISTS admin_dashboard_cache (
    year INTEGER PRIMARY KEY,
    stats JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_dashboard_cache ENABLE ROW LEVEL SECURITY;

-- Grant access
GRANT SELECT ON admin_dashboard_cache TO authenticated;
GRANT ALL ON admin_dashboard_cache TO service_role;

-- Policy
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON admin_dashboard_cache;
CREATE POLICY "Allow read access for authenticated users" ON admin_dashboard_cache FOR SELECT USING (true);

-- Function to Refresh Cache
CREATE OR REPLACE FUNCTION refresh_admin_dashboard_cache(target_year INTEGER)
RETURNS VOID AS $$
DECLARE
    year_start DATE := make_date(target_year, 1, 1);
    year_end DATE := make_date(target_year, 12, 31);
    today DATE := CURRENT_DATE;
    month_start DATE := date_trunc('month', today)::DATE;
    
    -- Stats Variables
    v_today_stats JSONB;
    v_month_stats JSONB;
    v_year_stats JSONB;
    v_monthly_trend JSONB;
    v_branch_dist JSONB;
    v_employee_perf JSONB;
    
BEGIN
    -- 1. Calculate Year Stats (Policies)
    SELECT jsonb_build_object(
        'policies', COUNT(*),
        'premium', COALESCE(SUM(brut_prim), 0),
        'commission', COALESCE(SUM(komisyon), 0)
    ) INTO v_year_stats
    FROM policeler
    WHERE tarih >= year_start AND tarih <= year_end;

    -- Add Quotes to Year Stats
    SELECT v_year_stats || jsonb_build_object(
        'quotes', COUNT(*)
    ) INTO v_year_stats
    FROM teklifler
    WHERE tarih >= year_start AND tarih <= year_end;

    -- 2. Calculate Month Stats
    SELECT jsonb_build_object(
        'policies', COUNT(*),
        'premium', COALESCE(SUM(brut_prim), 0),
        'commission', COALESCE(SUM(komisyon), 0)
    ) INTO v_month_stats
    FROM policeler
    WHERE tarih >= month_start AND tarih <= (month_start + interval '1 month' - interval '1 day')::DATE;

    SELECT v_month_stats || jsonb_build_object(
        'quotes', COUNT(*)
    ) INTO v_month_stats
    FROM teklifler
    WHERE tarih >= month_start AND tarih <= (month_start + interval '1 month' - interval '1 day')::DATE;

    -- 3. Calculate Today Stats
    SELECT jsonb_build_object(
        'policies', COUNT(*),
        'premium', COALESCE(SUM(brut_prim), 0),
        'commission', COALESCE(SUM(komisyon), 0)
    ) INTO v_today_stats
    FROM policeler
    WHERE tarih = today;

    SELECT v_today_stats || jsonb_build_object(
        'quotes', COUNT(*)
    ) INTO v_today_stats
    FROM teklifler
    WHERE tarih = today;

    -- 4. Monthly Trend
    SELECT jsonb_agg(t) FROM (
        SELECT 
            EXTRACT(MONTH FROM tarih) as month,
            COUNT(*) as police,
            COALESCE(SUM(brut_prim), 0) as prim,
            COALESCE(SUM(komisyon), 0) as komisyon
        FROM policeler
        WHERE tarih >= year_start AND tarih <= year_end
        GROUP BY EXTRACT(MONTH FROM tarih)
        ORDER BY month
    ) t INTO v_monthly_trend;

    -- 5. Branch Distribution
    SELECT jsonb_agg(t) FROM (
        SELECT brans as name, COALESCE(SUM(brut_prim), 0) as value
        FROM policeler
        WHERE tarih >= year_start AND tarih <= year_end
        GROUP BY brans
        ORDER BY value DESC
        LIMIT 6
    ) t INTO v_branch_dist;

    -- 6. Employee Performance (Complex Aggregation)
    -- We join with auth.users to get names. 
    -- WARNING: This requires the function to run with appropriate permissions.
    SELECT jsonb_agg(t) FROM (
        WITH emp_stats AS (
            SELECT 
                employee_id,
                COUNT(*) as policies,
                SUM(brut_prim) as premium,
                SUM(CASE WHEN tarih = CURRENT_DATE THEN brut_prim ELSE 0 END) as today_premium,
                SUM(CASE WHEN tarih >= date_trunc('month', CURRENT_DATE)::DATE THEN brut_prim ELSE 0 END) as month_premium,
                SUM(CASE WHEN tarih >= date_trunc('month', CURRENT_DATE)::DATE THEN 1 ELSE 0 END) as month_policies
            FROM policeler
            WHERE tarih >= year_start AND tarih <= year_end
            GROUP BY employee_id
        )
        SELECT 
            es.employee_id as id,
            COALESCE(u.raw_user_meta_data->>'name', 'Bilinmeyen') as name,
            es.policies as yearPolicies,
            es.premium as yearPremium,
            es.today_premium as todayPremium,
            es.month_premium as monthPremium,
            es.month_policies as monthPolicies
        FROM emp_stats es
        LEFT JOIN auth.users u ON es.employee_id = u.id
        ORDER BY es.premium DESC
    ) t INTO v_employee_perf;

    -- Construct Final JSON
    INSERT INTO admin_dashboard_cache (year, stats, updated_at)
    VALUES (
        target_year,
        jsonb_build_object(
            'year', v_year_stats,
            'month', v_month_stats,
            'today', v_today_stats,
            'monthlyTrend', COALESCE(v_monthly_trend, '[]'::jsonb),
            'branchDistribution', COALESCE(v_branch_dist, '[]'::jsonb),
            'employees', COALESCE(v_employee_perf, '[]'::jsonb)
        ),
        NOW()
    )
    ON CONFLICT (year) DO UPDATE SET
        stats = EXCLUDED.stats,
        updated_at = NOW();

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger Function
CREATE OR REPLACE FUNCTION trigger_refresh_admin_dashboard()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM refresh_admin_dashboard_cache(EXTRACT(YEAR FROM COALESCE(NEW.tarih, OLD.tarih))::INTEGER);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create Triggers
DROP TRIGGER IF EXISTS on_policy_change_dashboard ON policeler;
CREATE TRIGGER on_policy_change_dashboard
AFTER INSERT OR UPDATE OR DELETE ON policeler
FOR EACH ROW EXECUTE FUNCTION trigger_refresh_admin_dashboard();

DROP TRIGGER IF EXISTS on_quote_change_dashboard ON teklifler;
CREATE TRIGGER on_quote_change_dashboard
AFTER INSERT OR UPDATE OR DELETE ON teklifler
FOR EACH ROW EXECUTE FUNCTION trigger_refresh_admin_dashboard();

-- Initial Refresh for current year
SELECT refresh_admin_dashboard_cache(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
