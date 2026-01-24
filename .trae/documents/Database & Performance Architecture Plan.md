I have analyzed your database schema and requirements thoroughly.

**Current State Analysis:**
*   **Tables Identified:** `policeler`, `teklifler`, `messages` (whatsapp_messages_v2), `notifications`, `chat_groups`.
*   **Missing Indexes:** The local migration files contain **zero** `CREATE INDEX` statements. Your database is likely running on raw sequential scans for many queries.
*   **Dashboard Logic:** Currently relying on a `employee_stats_daily` table (likely populated via triggers or view).

**Optimization Plan:**

1.  **Database Optimization (Indexing Strategy):**
    *   I will generate SQL to create covering indexes for all Foreign Keys (`employee_id`, `user_id`, `group_id`).
    *   I will add composite indexes for common query patterns:
        *   Dashboard: `(employee_id, date)` or `(kesen_id, tarih)`
        *   Status Filtering: `(durum, tarih DESC)`
    *   I will add GIN indexes for JSONB columns (`metadata`, `misafir_bilgi`) if frequently queried.

2.  **Dashboard Data Strategy (Performance Core):**
    *   **Decision:** "Incremental Summary Table" approach is best here. Runtime `GROUP BY` is too slow for 500k rows, and Materialized Views have a refresh lag.
    *   **Solution:** I will design a `daily_employee_stats` table updated by **Triggers**.
        *   When a policy is inserted/updated -> Trigger fires -> Updates the specific row in `daily_employee_stats`.
        *   This makes Dashboard reads `O(1)` (instant) instead of `O(N)`.

3.  **DataGrid Optimization (SVAR Integration):**
    *   I will provide the Supabase query pattern for server-side pagination: `.range(start, end)`.
    *   I will explain how to map DataGrid filters to Supabase `.ilike()` or `.eq()` queries efficiently.

4.  **Role-Based Access (RLS):**
    *   I will provide optimized RLS policies that leverage the new indexes (avoiding full table scans inside RLS checks).

I will construct the full architectural response with the SQL artifacts now.
