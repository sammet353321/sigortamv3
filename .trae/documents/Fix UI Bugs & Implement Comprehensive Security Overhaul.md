I have analyzed the issues and the security request. Here is the plan:

### 1. Fix Policy Import Modal UI (Priority)
**Problem:** The grid displays `[object Object]` in the Status/Error columns and `undefined` for prices because `@svar-ui/react-grid`'s `template` function works best with string/number returns, or needs careful handling for React Elements in some versions. Also, the parsing logic for prices might be failing.
**Fix:**
*   Modify `src/components/PolicyImportModal.tsx` to ensure `template` returns are properly handled or simplify the template if the grid library has limitations.
*   Improve the price parsing logic (`parsedRow` function) to handle various formats better.
*   Debug the `[object Object]` by ensuring we are not passing an object to a text-only field.

### 2. Fix Dashboard Error & Apply Migration
**Problem:** `employee_stats_daily` table is missing.
**Fix:**
*   I will verify the migration file `supabase/migrations/20260123_fix_dashboard_stats.sql` exists.
*   I will provide the SQL content again in a consolidated "Fix All" migration file so the user can apply it easily.

### 3. Implement Comprehensive Security Fixes (The User's Request)
**Problem:** The user requested a complete security overhaul (Functions, RLS, Service Role).
**Fix:**
*   I will create a new migration file `supabase/migrations/20260123_security_overhaul.sql` that includes:
    *   **Functions:** `ALTER FUNCTION ... SET search_path = public` for all functions.
    *   **RLS:** Drop insecure policies and create strict ones for `policeler`, `teklifler`, `users`.
    *   **Service Role:** Secure `whatsapp_sessions_v2`.
*   I will provide a detailed explanation of the changes.

### 4. Fix Network Errors (RLS related)
**Problem:** `net::ERR_ABORTED` on `users`, `notifications`, etc.
**Fix:** The new RLS policies in step 3 will resolve this by correctly allowing authenticated users to read necessary data (like their own notifications and basic user info).

### Execution Steps:
1.  **Update `PolicyImportModal.tsx`**: Fix the rendering issue.
2.  **Create `supabase/migrations/20260123_security_and_fixes.sql`**: This will be a master migration file containing:
    *   Creation of `employee_stats_daily`.
    *   The Security Overhaul (RLS, Functions).
3.  **Instruction:** I will instruct the user to run this migration file in their Supabase SQL Editor to apply all DB fixes at once.
