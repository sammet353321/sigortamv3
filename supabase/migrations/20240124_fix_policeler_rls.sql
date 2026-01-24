
-- Enable RLS
ALTER TABLE public.policeler ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can view policies" ON public.policeler;
DROP POLICY IF EXISTS "Authenticated users can insert policies" ON public.policeler;
DROP POLICY IF EXISTS "Authenticated users can update policies" ON public.policeler;
DROP POLICY IF EXISTS "Authenticated users can delete policies" ON public.policeler;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.policeler;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.policeler;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.policeler;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.policeler;
DROP POLICY IF EXISTS "Users can insert their own policies" ON public.policeler;
DROP POLICY IF EXISTS "Users can view their own policies" ON public.policeler;
DROP POLICY IF EXISTS "Users can update their own policies" ON public.policeler;


-- Create comprehensive policies for authenticated users
CREATE POLICY "Enable read access for authenticated users"
ON public.policeler FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON public.policeler FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON public.policeler FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Enable delete access for authenticated users"
ON public.policeler FOR DELETE
TO authenticated
USING (true);
