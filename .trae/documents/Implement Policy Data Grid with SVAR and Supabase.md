## Implement Professional Policy Data Grid

### **1. Component Creation**
- Create a new component `src/components/admin/PolicyTable.tsx` using SVAR React DataGrid.
- Define columns with Turkish headers: "Poliçe No", "Müşteri Adı", "Branş", "Başlangıç", "Bitiş", "Prim".
- Implement custom templates for Turkish Lira (₺) and Date (DD.MM.YYYY) formatting.

### **2. Data Fetching Logic**
- Use Supabase JS client to fetch data from the `policies` table.
- Implement server-side pagination using `.range(offset, limit)`.
- Integrate infinite scroll logic by hooking into the grid's scroll events.
- Handle sorting and filtering server-side via Supabase query modifiers.

### **3. UI/UX Refinement**
- Add a loading spinner for background data fetching.
- Ensure the container has a fixed height for virtual scrolling to function correctly.
- Match the "Enterprise Look" using Tailwind CSS for the container and headers.

### **4. Database Setup**
- Provide the SQL migration for the `policies` table if it doesn't exist.
- Ensure RLS policies are in place for secure data access.

**Confirmation Required**: Should I proceed with creating the `PolicyTable.tsx` component and its integration?