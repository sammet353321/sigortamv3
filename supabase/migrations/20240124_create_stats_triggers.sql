-- Trigger Function for Policies
CREATE OR REPLACE FUNCTION public.handle_policy_stats()
RETURNS TRIGGER AS $$
DECLARE
    target_date DATE;
    emp_id UUID;
BEGIN
    -- Handle INSERT
    IF (TG_OP = 'INSERT') THEN
        target_date := (NEW.created_at AT TIME ZONE 'UTC')::DATE;
        emp_id := NEW.employee_id; -- Ensure policies table has employee_id populated
        
        -- If employee_id is null (e.g. legacy data), try to fallback or skip
        IF emp_id IS NULL THEN
            -- Attempt to use auth.uid() if available, but triggers might run outside request context
            -- For this system, we assume employee_id is mandatory on INSERT
            RETURN NEW; 
        END IF;

        INSERT INTO public.employee_stats_daily (employee_id, date, policies_count, total_premium, total_commission)
        VALUES (
            emp_id, 
            target_date, 
            1, 
            COALESCE(NEW.premium_amount, 0), 
            COALESCE(NEW.commission_amount, 0)
        )
        ON CONFLICT (employee_id, date) DO UPDATE SET
            policies_count = employee_stats_daily.policies_count + 1,
            total_premium = employee_stats_daily.total_premium + EXCLUDED.total_premium,
            total_commission = employee_stats_daily.total_commission + EXCLUDED.total_commission,
            updated_at = NOW();
            
        RETURN NEW;

    -- Handle DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        target_date := (OLD.created_at AT TIME ZONE 'UTC')::DATE;
        emp_id := OLD.employee_id;

        IF emp_id IS NOT NULL THEN
            UPDATE public.employee_stats_daily
            SET 
                policies_count = GREATEST(0, policies_count - 1),
                total_premium = GREATEST(0, total_premium - COALESCE(OLD.premium_amount, 0)),
                total_commission = GREATEST(0, total_commission - COALESCE(OLD.commission_amount, 0)),
                updated_at = NOW()
            WHERE employee_id = emp_id AND date = target_date;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger Function for Quotes (Teklifler)
CREATE OR REPLACE FUNCTION public.handle_quote_stats()
RETURNS TRIGGER AS $$
DECLARE
    target_date DATE;
    emp_id UUID;
BEGIN
    -- Note: Quotes table uses 'kesen_id' as employee_id based on schema
    -- and 'tarih' or 'created_at' for date.
    
    IF (TG_OP = 'INSERT') THEN
        target_date := (NEW.created_at AT TIME ZONE 'UTC')::DATE;
        emp_id := NEW.kesen_id; 
        
        IF emp_id IS NULL THEN RETURN NEW; END IF;

        INSERT INTO public.employee_stats_daily (employee_id, date, quotes_count)
        VALUES (emp_id, target_date, 1)
        ON CONFLICT (employee_id, date) DO UPDATE SET
            quotes_count = employee_stats_daily.quotes_count + 1,
            updated_at = NOW();
            
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        target_date := (OLD.created_at AT TIME ZONE 'UTC')::DATE;
        emp_id := OLD.kesen_id;

        IF emp_id IS NOT NULL THEN
            UPDATE public.employee_stats_daily
            SET 
                quotes_count = GREATEST(0, quotes_count - 1),
                updated_at = NOW()
            WHERE employee_id = emp_id AND date = target_date;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Triggers
DROP TRIGGER IF EXISTS on_policy_change_stats ON public.policies;
CREATE TRIGGER on_policy_change_stats
    AFTER INSERT OR DELETE ON public.policies
    FOR EACH ROW EXECUTE FUNCTION public.handle_policy_stats();

DROP TRIGGER IF EXISTS on_quote_change_stats ON public.teklifler;
CREATE TRIGGER on_quote_change_stats
    AFTER INSERT OR DELETE ON public.teklifler
    FOR EACH ROW EXECUTE FUNCTION public.handle_quote_stats();
