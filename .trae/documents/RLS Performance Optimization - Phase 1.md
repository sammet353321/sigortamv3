I will implement the performance and security optimizations in two phases, starting with the core tables as requested.

### Phase 1: Core Tables Optimization (`employee_stats_daily`, `policeler`, `teklifler`)
**Goal:** Fix the `Auth RLS Initialization Plan` performance issue by wrapping `auth.uid()` and `auth.jwt()` calls in subqueries `(SELECT ...)` to ensure they are evaluated once per query, not per row.

**Steps:**
1.  **Create Migration File:** `supabase/migrations/20260123_rls_perf_optimization_part1.sql`
2.  **`employee_stats_daily` Table:**
    *   Drop `Admins view all stats` -> Create optimized version using JWT role check.
    *   Drop `Employees view own stats` -> Create optimized version using `(SELECT auth.uid())`.
3.  **`policeler` Table:**
    *   Drop existing policies (`admin_all_policeler`, `employee_select_policeler`, etc.).
    *   Create optimized versions wrapping `auth.uid()` and using JWT for admin checks.
4.  **`teklifler` Table:**
    *   Repeat the same optimization pattern as `policeler`.

### Phase 2: Complex Policy Merging (WhatsApp & Workgroups)
*Note: I will wait for your confirmation after Phase 1 to proceed with this, as requested.*
**Goal:** Solve the `Multiple Permissive Policies` issue by combining overlapping policies into single, logical policies using `OR` conditions.

**Tables to be handled in Phase 2:**
*   `whatsapp_sessions_v2` (Merging Admin, User, and Service Role logic)
*   `whatsapp_messages_v2`
*   `workgroups` & `workgroup_members`

I will now generate the SQL for **Phase 1** to demonstrate the solution.
