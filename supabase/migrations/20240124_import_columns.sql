-- Add missing columns for import requirement
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES auth.users(id);

-- Ensure unique constraint exists for ON CONFLICT upserts
-- Note: We already made policy_no UNIQUE in creation, but adding explicit constraint name helps
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policies_policy_no_key') THEN
        ALTER TABLE public.policies ADD CONSTRAINT policies_policy_no_key UNIQUE (policy_no);
    END IF;
END $$;
