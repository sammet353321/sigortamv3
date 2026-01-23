# Bug Fixes & Feature Implementation Plan

## 1. Fix Login & Routing Issues
- **Problem**: Login inputs clear without action, potential route abort errors.
- **Solution**: 
  - Ensure `e.preventDefault()` is robust.
  - Add better error handling for network issues during `signInWithPassword`.
  - Verify `admin/quotes` route exists in `App.tsx`.

## 2. Fix Dashboard Database Error
- **Problem**: `Could not find the table 'public.employee_stats_daily'`.
- **Cause**: The stats table migration might not have been applied or the PostgREST cache is stale.
- **Solution**: 
  - Verify the SQL migration file content.
  - Advise user to run the migration (I cannot run it directly, but I can provide the SQL again or verify the file).
  - Add error handling in frontend to gracefully degrade if stats table is missing.

## 3. Add Monthly Performance to Admin Dashboard
- **Task**: Add a new section for Monthly Performance.
- **Implementation**:
  - Update `AdminDashboard.tsx` to include a new card or chart for monthly stats.
  - Ensure data is fetched from the (to be fixed) `employee_stats_daily` table.

## 4. Fix Policies Page "Loading..." Stuck
- **Problem**: Infinite loading state.
- **Cause**: Likely an error in `fetchPolicies` that isn't caught or doesn't toggle `setLoading(false)`.
- **Solution**:
  - Add `try-catch-finally` block in `PolicyTable.tsx`.
  - Check for specific Supabase errors.

## 5. Add Excel Export
- **Task**: Add Export button to Quotes and Policies.
- **Implementation**:
  - Use `xlsx` library.
  - Add button in `PolicyTable` and `QuoteTable` (or parent pages).

## 6. Improve Excel Import UX
- **Problem**: Freezing UI, all rows invalid.
- **Solution**:
  - **Performance**: Move parsing to a Web Worker or optimize the loop. For now, optimize the existing loop.
  - **Validation**: Debug why rows are invalid (likely column name mismatch).
  - **UX**: Add a real progress bar and better error messages.

---

## Execution Order
1.  **Fix Login**: Ensure entry point works.
2.  **Fix Dashboard Error**: Ensure stats table exists (SQL check).
3.  **Fix Policies Loading**: Ensure data visibility.
4.  **Add Excel Export**: Quick win.
5.  **Improve Excel Import**: Complex task, do last to ensure stability.
6.  **Add Monthly Performance**: Enhacement.

**Confirmation**: I will start by fixing the Login and Dashboard errors.