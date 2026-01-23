# Enterprise Excel/CSV Import System for Insurance Policies

## 1. System Architecture

### **Frontend (React + SVAR Grid)**
- **Upload Component**: A dedicated modal (`PolicyImportModal.tsx`) using `xlsx` to parse files client-side.
- **Preview Grid**: Uses `SVAR React DataGrid` to display parsed rows before import.
- **Validation**:
  - Highlights invalid cells (e.g., missing policy_no, invalid date).
  - Displays a summary (Total, Valid, Invalid rows).
- **Chunking Logic**:
  - Splits data into chunks of **500 rows**.
  - Sends chunks sequentially to the Supabase Edge Function to avoid timeouts.

### **Backend (Supabase Edge Function)**
- **Function Name**: `import-policies`
- **Logic**:
  - Receives a JSON chunk.
  - Validates schema server-side (Zod or manual check).
  - Injects `employee_id` from the authenticated user context.
  - Uses `upsert` (ON CONFLICT `policy_no` DO UPDATE) to handle duplicates or updates.
  - Returns a detailed report of success/failure for the chunk.

### **Database (Supabase/PostgreSQL)**
- **Schema Update**: Add `commission_amount` and `employee_id` to the `policies` table.
- **Indexes**: Ensure `policy_no` is unique and indexed (already done, but verified).
- **RLS**: Policies are automatically applied; Edge Function uses Service Role if needed or acts as the user (preferred for audit).

---

## 2. Implementation Steps

### **Step 1: Database Migration**
Update the `policies` table to include the new required fields.
```sql
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES auth.users(id);

-- Ensure policy_no is unique constraint for upsert
ALTER TABLE public.policies ADD CONSTRAINT policies_policy_no_key UNIQUE (policy_no);
```

### **Step 2: Supabase Edge Function (`import-policies`)**
Create a new Edge Function that handles the bulk upsert logic securely.
- **Path**: `supabase/functions/import-policies/index.ts`
- **Key Features**: Transactional upsert, error mapping.

### **Step 3: Frontend Import Modal**
Create `src/components/PolicyImportModal.tsx`.
- **Libraries**: `xlsx` (already in package.json), `lucide-react`.
- **Features**: Drag & drop, parsing, validation visualizer.

### **Step 4: Integration**
Add the "Excel Yükle" button to `src/pages/admin/Policies.tsx` that triggers the modal.

---

## 3. Plan

1.  **Create Migration**: Add `commission_amount` and `employee_id` columns.
2.  **Create Edge Function**: Scaffold and write the `import-policies` function.
3.  **Create Modal Component**: Implement the UI with SVAR Grid preview and Chunking logic.
4.  **Update Page**: Add the button to `Policies.tsx`.

**Confirmation Required**: Should I proceed with this architecture and implementation plan?