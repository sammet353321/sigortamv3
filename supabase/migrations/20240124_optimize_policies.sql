-- Enable pg_trgm extension for partial text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Standard B-Tree Indexes for Sorting and Exact Match
CREATE INDEX IF NOT EXISTS idx_policies_branch ON public.policies (branch);
CREATE INDEX IF NOT EXISTS idx_policies_start_date ON public.policies (start_date);
CREATE INDEX IF NOT EXISTS idx_policies_created_at ON public.policies (created_at DESC);

-- GIN Trigram Indexes for "ilike" (Contains) Search
CREATE INDEX IF NOT EXISTS idx_policies_customer_name_trgm ON public.policies USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policies_policy_no_trgm ON public.policies USING gin (policy_no gin_trgm_ops);

-- Composite Index for Common Sort/Filter Combinations (Optional but recommended)
-- Example: Filtering by branch and sorting by date
CREATE INDEX IF NOT EXISTS idx_policies_branch_created_at ON public.policies (branch, created_at DESC);
