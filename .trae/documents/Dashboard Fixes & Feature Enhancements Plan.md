I have analyzed the issues and requests. Here is the plan to address them:

### 1. Fix Dashboard & Auth Errors
**Problem:** The `employee_stats_daily` table is missing in the database, causing the dashboard to crash. The "Refresh Token" error is a side effect of auth state issues.
**Plan:**
*   **Create Missing Table:** I will create a new migration file `supabase/migrations/20260123_fix_dashboard_stats.sql` to properly create the `public.employee_stats_daily` table and its triggers.
*   **Fix Relations:** Ensure the table references `public.users` (not `auth.users` directly) so the dashboard query `employee:users!employee_id(name)` works correctly.
*   **Verify Monthly Performance:** The dashboard already has a "Monthly Performance" section. Fixing the crash will make it visible.

### 2. Improve Excel Upload (Policies Page)
**Problem:** The upload process lacks clear feedback, and the user feels it "doesn't upload".
**Plan:**
*   **Enhanced UI:** Modify `src/components/PolicyImportModal.tsx` to show a more prominent "Importing..." state with a better progress bar and animation.
*   **User Safety:** Add a browser warning (`onbeforeunload`) to prevent accidental tab closing during upload.
*   **Feedback:** Add clear success/error notifications after the process completes.

### 3. Employee Groups - WhatsApp Group Assignment
**Problem:** Users cannot assign WhatsApp groups to Employee Groups directly from the Employee Groups page.
**Plan:**
*   **Update UI:** Modify `src/pages/admin/EmployeeGroups.tsx` to add a new section/modal for "WhatsApp Group Assignment".
*   **Selection Logic:** List all available WhatsApp groups with checkboxes.
*   **Action:** When saved, update the `chat_groups` table to link selected WP groups to the current Employee Group.
*   **Feedback:** Add a "Save" button that shows a success notification (Toast) and automatically closes the panel.

**Note:** For the request "assign one group to multiple groups", the current system structure links one WhatsApp group to *one* Employee team. I will implement the assignment logic to allow moving WP groups to the selected team easily.
