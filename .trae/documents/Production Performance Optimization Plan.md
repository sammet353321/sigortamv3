I have analyzed the root causes and designed a comprehensive solution for your production Supabase system.

### 1. Root Cause Analysis: Why "Unindexed Foreign Keys" Persist?
The Supabase Linter (and Postgres query planner) considers an FK "unindexed" if:
*   **Composite Index Order Mismatch:** You have an index on `(status, user_id)` but the FK is just `user_id`. This index cannot be used efficiently for joins on `user_id` alone (Left-Most Prefix Rule).
*   **Partial Indexes:** An index with `WHERE status = 'active'` does not cover the FK constraint check which must scan *all* rows (even inactive ones) to ensure referential integrity.
*   **Missing Single-Column Index:** While composite indexes are great for queries, FK constraints often perform simple lookups. It's best practice to have a simple index on the FK column itself OR ensure the FK is the *first* column in a composite index.

### 2. Table-by-Table Fix Plan (Migration: `20260123_performance_indexes_v2.sql`)
I will create a new, definitive migration that drops imperfect indexes and creates the correct ones:
*   **policeler:** `(employee_id, tanzim_tarihi DESC)` -> Covers FK + Dashboard Sorting.
*   **teklifler:** `(employee_id, tanzim_tarihi DESC)` -> Covers FK + Dashboard Sorting.
*   **messages/whatsapp:** `(group_id, created_at DESC)` -> Covers FK + Chat History.
*   **notifications:** `(user_id, is_read, created_at DESC)` -> Covers FK + Unread Filter.
*   **Groups & Members:** Simple covering indexes for pure join performance.

### 3. Dashboard Performance Architecture (Migration: `20260123_dashboard_optimization_v2.sql`)
**Strategy:** Incremental Summary Table (`daily_employee_stats`) updated via Triggers.
*   **Why:** Runtime `GROUP BY` on 1M rows is O(N). Trigger-based updates are O(1) reads for the dashboard.
*   **Edge Case Handling:** I will refine the trigger function to handle:
    *   **Ownership Transfer:** Decrement old user, Increment new user.
    *   **Amount Updates:** Calculate delta (`NEW.amount - OLD.amount`) correctly.
    *   **Date Changes:** Move stats from old date to new date.

### 4. RLS + Index Coordination
*   **Rule:** RLS policies inject `WHERE` clauses. Your indexes must match these clauses.
*   **Fix:** If RLS is `employee_id = auth.uid()`, then `employee_id` MUST be the first column in your main indexes. My proposed indexes follow this rule strictly.

### 5. SVAR DataGrid Integration
*   I will provide the exact Typescript/Supabase code pattern for:
    *   `range(0, 50)` -> Server-side Pagination.
    *   `ilike('col', '%val%')` -> Server-side Filtering.
    *   `order('col', { ascending: true })` -> Server-side Sorting.

I will now generate the SQL migrations and the documentation as requested.
