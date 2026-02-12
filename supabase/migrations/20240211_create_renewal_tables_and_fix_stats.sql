
-- 1. Create New Tables for Renewals (Optimization)
CREATE TABLE IF NOT EXISTS yenilemeler (
    LIKE policeler INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS gecen_policeler (
    LIKE policeler INCLUDING ALL
);

-- 2. Function to Refresh Renewals and Expired Policies
-- This should be called daily (or on dashboard load)
CREATE OR REPLACE FUNCTION refresh_daily_renewals()
RETURNS void AS $$
DECLARE
    today DATE := CURRENT_DATE;
    fourteen_days_later DATE := CURRENT_DATE + 14;
BEGIN
    -- A. Manage 'yenilemeler' (Upcoming 14 days)
    -- Strategy: Truncate and Reload is safest for a "Snapshot" table to avoid sync issues
    DELETE FROM yenilemeler;
    
    INSERT INTO yenilemeler
    SELECT * FROM policeler
    WHERE bitis_tarihi::DATE >= today 
    AND bitis_tarihi::DATE <= fourteen_days_later;

    -- B. Manage 'gecen_policeler' (Expired / Non-renewed)
    -- Move expired policies that are NOT already in gecen_policeler
    INSERT INTO gecen_policeler
    SELECT * FROM policeler
    WHERE bitis_tarihi::DATE < today
    AND id NOT IN (SELECT id FROM gecen_policeler);
    
    -- Optional: If you want to move them strictly from 'yenilemeler' logic, 
    -- usually we just check the main table for anything expired.
END;
$$ LANGUAGE plpgsql;

-- 3. Function to Backfill/Recalculate Daily Stats (Fixes Dashboard Charts)
CREATE OR REPLACE FUNCTION recalculate_all_daily_stats()
RETURNS void AS $$
BEGIN
    -- Clear existing stats to rebuild
    DELETE FROM daily_employee_stats;

    -- A. Insert Quotes Stats
    INSERT INTO daily_employee_stats (employee_id, date, quote_count, product_breakdown)
    SELECT 
        employee_id,
        COALESCE(tanzim_tarihi::DATE, created_at::DATE) as rec_date,
        COUNT(*) as cnt,
        jsonb_object_agg(COALESCE(urun_adi, tur, 'Diğer'), 1) -- Simple agg, improves below
    FROM teklifler
    GROUP BY employee_id, rec_date;
    
    -- Fix JSON aggregation for Quotes (summing counts properly)
    WITH q_stats AS (
        SELECT 
            employee_id,
            COALESCE(tanzim_tarihi::DATE, created_at::DATE) as rec_date,
            urun_adi as prod_name
        FROM teklifler
    )
    UPDATE daily_employee_stats s
    SET product_breakdown = (
        SELECT jsonb_object_agg(prod_name, count)
        FROM (
            SELECT prod_name, COUNT(*) as count
            FROM q_stats q
            WHERE q.employee_id = s.employee_id AND q.rec_date = s.date
            GROUP BY prod_name
        ) t
    )
    WHERE quote_count > 0;

    -- B. Insert/Update Policies Stats
    -- We use a loop or a complex UPSERT for policies to merge with quotes
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN 
            SELECT 
                employee_id,
                COALESCE(tanzim_tarihi::DATE, tarih::DATE, created_at::DATE) as rec_date,
                COUNT(*) as p_cnt,
                SUM(net_prim) as total_prem,
                SUM(komisyon) as total_comm
            FROM policeler
            GROUP BY employee_id, rec_date
        LOOP
            INSERT INTO daily_employee_stats (employee_id, date, policy_count, total_premium, total_commission)
            VALUES (r.employee_id, r.rec_date, r.p_cnt, r.total_prem, r.total_comm)
            ON CONFLICT (employee_id, date) 
            DO UPDATE SET 
                policy_count = EXCLUDED.policy_count,
                total_premium = EXCLUDED.total_premium,
                total_commission = EXCLUDED.total_commission;
        END LOOP;
    END;

    -- Fix JSON aggregation for Policies (Product & Company)
    -- This merges with existing quote breakdown if any
    WITH p_stats AS (
        SELECT 
            employee_id,
            COALESCE(tanzim_tarihi::DATE, tarih::DATE, created_at::DATE) as rec_date,
            COALESCE(urun_adi, tur, 'Diğer') as prod_name,
            COALESCE(sirket_adi, sirket, 'Diğer') as comp_name
        FROM policeler
    )
    UPDATE daily_employee_stats s
    SET 
        -- Update Product Breakdown (Merge with Quotes)
        product_breakdown = (
            SELECT jsonb_object_agg(key, val)
            FROM (
                SELECT key, SUM(value::int) as val
                FROM (
                    -- Existing (Quotes)
                    SELECT key, value FROM jsonb_each_text(COALESCE(s.product_breakdown, '{}'::jsonb))
                    UNION ALL
                    -- New (Policies)
                    SELECT prod_name as key, COUNT(*)::text as value
                    FROM p_stats p
                    WHERE p.employee_id = s.employee_id AND p.rec_date = s.date
                    GROUP BY prod_name
                ) combined
                GROUP BY key
            ) final
        ),
        -- Update Company Breakdown
        company_breakdown = (
            SELECT jsonb_object_agg(comp_name, count)
            FROM (
                SELECT comp_name, COUNT(*) as count
                FROM p_stats p
                WHERE p.employee_id = s.employee_id AND p.rec_date = s.date
                GROUP BY comp_name
            ) t
        )
    WHERE EXISTS (SELECT 1 FROM policeler WHERE employee_id = s.employee_id AND COALESCE(tanzim_tarihi::DATE, tarih::DATE, created_at::DATE) = s.date);

END;
$$ LANGUAGE plpgsql;
