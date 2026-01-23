# High-Performance Dashboard Architecture

## 1. Database Schema Design
We will transition from live scanning to pre-aggregated statistics.

### **Stats Table: `employee_stats_daily`**
This table will store daily totals per employee.
- `id` (PK)
- `employee_id` (FK -> auth.users)
- `date` (DATE, e.g., '2024-01-24')
- `quotes_count` (INT, default 0)
- `policies_count` (INT, default 0)
- `total_premium` (NUMERIC, default 0)
- `total_commission` (NUMERIC, default 0)
- `created_at` / `updated_at`

**Uniqueness Constraint**: `(employee_id, date)`

### **RLS Policies**
- **Employees**: `SELECT * FROM employee_stats_daily WHERE employee_id = auth.uid()`
- **Managers**: `SELECT * FROM employee_stats_daily` (No restriction)

---

## 2. Trigger Logic (The Core Engine)
We need triggers on both `policies` and `quotes` tables.

**Trigger Function: `update_daily_stats()`**
1. Extract `employee_id` and `date` (from `created_at` or specific date field).
2. Perform an `INSERT ... ON CONFLICT` (Upsert) into `employee_stats_daily`.
3. Increment counts and sum amounts.

**Handling Updates/Deletes**:
- If a policy is deleted -> Decrement stats.
- If a policy amount changes -> Update sum.

---

## 3. Dashboard Implementation Plan

### **Employee Dashboard**
- **Fetch Logic**:
  - Today: Query `employee_stats_daily` where `date = CURRENT_DATE`.
  - This Week: Sum of `employee_stats_daily` where `date >= start_of_week`.
  - This Month: Sum of `employee_stats_daily` where `date >= start_of_month`.
- **UI**: Display these 4 key metrics in cards.

### **Manager Dashboard**
- **Fetch Logic**:
  - Same as employee but grouped by `employee_id` for ranking.
  - Global totals: Sum of all rows in the date range.

---

## 4. Execution Steps
1.  **SQL Migration**: Create table and RLS policies.
2.  **SQL Triggers**: Create the robust trigger functions.
3.  **Frontend Update**: Refactor `EmployeeDashboard.tsx` to read *only* from `employee_stats_daily`.
4.  **Frontend Update**: Refactor `AdminDashboard.tsx` (Manager) to read from `employee_stats_daily`.

**Confirmation Required**: Should I proceed with creating the stats table and triggers?