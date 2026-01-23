## Optimization Plan for 100,000+ Rows

### **1. Database Optimization (Supabase/PostgreSQL)**
To support fast filtering and sorting on large datasets, I will apply the following indexes:

- **B-Tree Indexes**: For standard equality checks and sorting.
  - `policy_no`
  - `branch`
  - `start_date`
  - `created_at` (for default sort)
- **Trigram Index (`pg_trgm`)**: Essential for fast `ilike` partial text searches (e.g., searching for "Ahmet" in "Ahmet Yılmaz").
  - `customer_name`
  - `policy_no` (also useful for partial matches)

### **2. React Component Optimization**
I will refactor `PolicyTable.tsx` to handle scale:

- **Debounced Filtering**: Implement a 500ms debounce on filter inputs to prevent flooding the server with requests while typing.
- **Efficient Count Strategy**: Move `count: 'exact'` out of the pagination loop. Fetch the total count **only** on initial load or when filters change, not on every scroll event. Counting 100k rows is expensive.
- **Optimized State Management**:
  - Use `useRef` for the AbortController to cancel stale requests.
  - Ensure the `data` array updates are efficient (append-only logic is already good, but we'll ensure no unnecessary copies).
- **Loading State UX**: Keep the existing data visible while loading the next page to prevent UI flashing.

### **3. Implementation Steps**
1.  **SQL Migration**: Create a SQL file with the index definitions.
2.  **Code Refactor**: Update `PolicyTable.tsx` with debounce logic and optimized fetching.
3.  **Verification**: Ensure the table still works smoothly with these changes.

**Confirmation Required**: Should I proceed with creating the SQL indexes and refactoring the component?