
-- Enable RLS
ALTER TABLE daily_employee_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Employees can view own stats" ON daily_employee_stats;
DROP POLICY IF EXISTS "Employees can insert own stats" ON daily_employee_stats;
DROP POLICY IF EXISTS "Employees can update own stats" ON daily_employee_stats;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON daily_employee_stats;

-- Create comprehensive policies
CREATE POLICY "Employees can view own stats"
ON daily_employee_stats FOR SELECT
TO authenticated
USING (auth.uid() = employee_id);

CREATE POLICY "Employees can insert own stats"
ON daily_employee_stats FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees can update own stats"
ON daily_employee_stats FOR UPDATE
TO authenticated
USING (auth.uid() = employee_id);

-- If the trigger runs as the user, they might need to be able to create rows where employee_id matches.
-- If the trigger uses a function that is SECURITY DEFINER, this wouldn't be an issue, but standard triggers use the caller's permissions.
