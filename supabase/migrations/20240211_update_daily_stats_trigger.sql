
-- Add missing columns to daily_employee_stats for detailed breakdown
ALTER TABLE daily_employee_stats 
ADD COLUMN IF NOT EXISTS product_breakdown JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS company_breakdown JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_quotes_count INTEGER DEFAULT 0; -- Explicit total quotes if needed

-- Update existing trigger function or create new one to populate these
CREATE OR REPLACE FUNCTION update_daily_employee_stats()
RETURNS TRIGGER AS $$
DECLARE
    emp_id UUID;
    record_date DATE;
    is_policy BOOLEAN;
    prod_name TEXT;
    comp_name TEXT;
BEGIN
    -- Determine operation type and IDs
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'policeler' THEN
            emp_id := NEW.employee_id;
            record_date := COALESCE(NEW.tanzim_tarihi::DATE, NEW.tarih::DATE, CURRENT_DATE);
            is_policy := TRUE;
            prod_name := COALESCE(NEW.urun_adi, NEW.tur, 'Diğer');
            comp_name := COALESCE(NEW.sirket_adi, NEW.sirket, 'Diğer');
        ELSIF TG_TABLE_NAME = 'teklifler' THEN
            emp_id := NEW.employee_id;
            record_date := COALESCE(NEW.tanzim_tarihi::DATE, NEW.created_at::DATE);
            is_policy := FALSE;
            prod_name := COALESCE(NEW.urun_adi, NEW.tur, 'Diğer');
            comp_name := COALESCE(NEW.sirket_adi, NEW.sirket, 'Diğer');
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'policeler' THEN
            emp_id := OLD.employee_id;
            record_date := COALESCE(OLD.tanzim_tarihi::DATE, OLD.tarih::DATE, CURRENT_DATE);
            is_policy := TRUE;
            prod_name := COALESCE(OLD.urun_adi, OLD.tur, 'Diğer');
            comp_name := COALESCE(OLD.sirket_adi, OLD.sirket, 'Diğer');
        ELSIF TG_TABLE_NAME = 'teklifler' THEN
            emp_id := OLD.employee_id;
            record_date := COALESCE(OLD.tanzim_tarihi::DATE, OLD.created_at::DATE);
            is_policy := FALSE;
            prod_name := COALESCE(OLD.urun_adi, OLD.tur, 'Diğer');
            comp_name := COALESCE(OLD.sirket_adi, OLD.sirket, 'Diğer');
        END IF;
    END IF;

    -- Ensure Stats Row Exists
    INSERT INTO daily_employee_stats (employee_id, date)
    VALUES (emp_id, record_date)
    ON CONFLICT (employee_id, date) DO NOTHING;

    -- Update Counts and Breakdowns
    IF TG_OP = 'INSERT' THEN
        IF is_policy THEN
            UPDATE daily_employee_stats
            SET policy_count = policy_count + 1,
                total_premium = total_premium + COALESCE(NEW.net_prim, 0),
                total_commission = total_commission + COALESCE(NEW.komisyon, 0),
                -- Update Product Breakdown (JSONB)
                product_breakdown = jsonb_set(
                    COALESCE(product_breakdown, '{}'::jsonb),
                    ARRAY[prod_name],
                    (COALESCE((product_breakdown->>prod_name)::int, 0) + 1)::text::jsonb
                ),
                -- Update Company Breakdown (JSONB)
                company_breakdown = jsonb_set(
                    COALESCE(company_breakdown, '{}'::jsonb),
                    ARRAY[comp_name],
                    (COALESCE((company_breakdown->>comp_name)::int, 0) + 1)::text::jsonb
                )
            WHERE employee_id = emp_id AND date = record_date;
        ELSE
            UPDATE daily_employee_stats
            SET quote_count = quote_count + 1
            WHERE employee_id = emp_id AND date = record_date;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF is_policy THEN
            UPDATE daily_employee_stats
            SET policy_count = GREATEST(policy_count - 1, 0),
                total_premium = GREATEST(total_premium - COALESCE(OLD.net_prim, 0), 0),
                total_commission = GREATEST(total_commission - COALESCE(OLD.komisyon, 0), 0)
            WHERE employee_id = emp_id AND date = record_date;
        ELSE
            UPDATE daily_employee_stats
            SET quote_count = GREATEST(quote_count - 1, 0)
            WHERE employee_id = emp_id AND date = record_date;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old triggers if exist
DROP TRIGGER IF EXISTS on_policy_change_stats ON policeler;
DROP TRIGGER IF EXISTS on_quote_change_stats ON teklifler;

-- Create Triggers
CREATE TRIGGER on_policy_change_stats
AFTER INSERT OR DELETE ON policeler
FOR EACH ROW EXECUTE FUNCTION update_daily_employee_stats();

CREATE TRIGGER on_quote_change_stats
AFTER INSERT OR DELETE ON teklifler
FOR EACH ROW EXECUTE FUNCTION update_daily_employee_stats();
