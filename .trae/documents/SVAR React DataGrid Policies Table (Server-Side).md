**Step-by-Step Explanation**

* Install Grid

  * npm install @svar-ui/react-grid

  * Import styles: import "@svar-ui/react-grid/all.css"

  * Optional theme wrapper: import { Willow } from "@svar-ui/react-grid" (Docs: <https://docs.svar.dev/react/grid/getting_started/>)

* Supabase Edge Function

  * Create /functions/policies to serve paginated, sortable, filterable data

  * Accept query params: limit, offset, sortBy, sortDir, filters

  * Use Supabase PostgREST via supabase-js to apply order(), range(), ilike(), eq() per filters

* React Component

  * Reusable PolicyTable with SVAR Grid

  * Columns: Turkish headers, currency/date formatting

  * Virtual scroll + infinite paging: fetch next page on scroll near bottom; do not fetch all rows

  * Server-side sorting/filtering: map grid events to API params and refetch

  * Row selection: controlled selection state

  * Clean loading state and empty state

* Performance

  * Page size \~50–100 rows; append pages while scrolling

  * Debounce user filters/sort; cancel in-flight requests with AbortController

  * Keep a totalCount to stop further fetches

**React Component (PolicyTable.tsx)**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Grid, Willow } from "@svar-ui/react-grid";
import "@svar-ui/react-grid/all.css";

const PAGE_SIZE = 100;

type PolicyRow = {
  id: string;
  policy_no: string;
  customer_name: string;
  branch: string; // kasko, trafik, dask, etc.
  start_date: string;
  end_date: string;
  premium_amount: number;
  created_at: string;
};

type SortState = { by: keyof PolicyRow | null; dir: "asc" | "desc" };

export default function PolicyTable() {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState>({ by: null, dir: "asc" });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(v ?? 0);
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "-" : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth()+1).padStart(2, "0")}.${d.getFullYear()}`;
  };

  const columns = useMemo(
    () => [
      { id: "policy_no", header: "Poliçe No", width: 140, sort: true, filter: "text" },
      { id: "customer_name", header: "Ad Soyad", width: 180, sort: true, filter: "text" },
      { id: "branch", header: "Branş", width: 120, sort: true, filter: "select" },
      { id: "start_date", header: "Başlangıç", width: 120, sort: true, template: (r: PolicyRow) => fmtDate(r.start_date) },
      { id: "end_date", header: "Bitiş", width: 120, sort: true, template: (r: PolicyRow) => fmtDate(r.end_date) },
      { id: "premium_amount", header: "Prim", width: 140, sort: true, template: (r: PolicyRow) => fmtCurrency(r.premium_amount) },
      { id: "created_at", header: "Oluşturma", width: 140, sort: true, template: (r: PolicyRow) => fmtDate(r.created_at) },
    ],
    []
  );

  async function fetchPage(nextPage: number, replace = false) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(nextPage * PAGE_SIZE));
    if (sort.by) {
      params.set("sortBy", String(sort.by));
      params.set("sortDir", sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(`f_${k}`, v);
    });

    setLoading(true);
    try {
      const res = await fetch(`/functions/v1/policies?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { data: PolicyRow[]; total: number } = await res.json();
      setTotal(json.total);
      setRows(prev => (replace ? json.data : [...prev, ...json.data]));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load or when sort/filter changes, reset and fetch page 0
    setRows([]);
    setPage(0);
    fetchPage(0, true);
  }, [sort.by, sort.dir, JSON.stringify(filters)]);

  const onGridSortChange = (colId: string, dir: "asc" | "desc") => {
    setSort({ by: colId as keyof PolicyRow, dir });
  };
  const onGridFilterChange = (filterMap: Record<string, string>) => {
    setFilters(filterMap);
  };
  const onGridSelectionChange = (ids: string[]) => setSelection(ids);

  const onGridScrollEnd = () => {
    const canLoadMore = total == null || rows.length < total;
    if (loading || !canLoadMore) return;
    fetchPage(page + 1);
  };

  return (
    <Willow>
      <div style={{ height: "calc(100vh - 160px)" }}>
        <Grid
          data={rows}
          columns={columns}
          loading={loading}
          selection={selection}
          onSelectionChange={onGridSelectionChange}
          sortMode="server"
          onSortChange={onGridSortChange}
          filterMode="server"
          onFilterChange={onGridFilterChange}
          virtualRows={true}
          onScrollEnd={onGridScrollEnd}
          responsive={true}
        />
      </div>
    </Willow>
  );
}
```

Notes

* Sort/filter/scroll event prop names follow SVAR React DataGrid conventions (see docs). If your version uses different names, map them accordingly (Docs: <https://docs.svar.dev/react/grid/guides/installation_initialization/> and <https://svar.dev/react/datagrid/>).

* The Grid is wrapped with Willow theme for consistent enterprise look.

**Supabase Edge Function (functions/policies/index.ts)**

```ts
// Deno (Supabase Edge Function)
// File: supabase/functions/policies/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const sortBy = url.searchParams.get("sortBy") ?? "created_at";
  const sortDir = (url.searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

  const filters: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k.startsWith("f_")) filters[k.slice(2)] = v;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")! // or SERVICE_ROLE for wider access
  );

  let q = supabase
    .from("policies")
    .select("id, policy_no, customer_name, branch, start_date, end_date, premium_amount, created_at", { count: "exact" })
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(offset, offset + limit - 1);

  // Apply filters (server-side)
  Object.entries(filters).forEach(([field, val]) => {
    if (!val) return;
    switch (field) {
      case "customer_name":
      case "policy_no":
        q = q.ilike(field, `%${val}%`);
        break;
      case "branch":
        q = q.eq(field, val);
        break;
      case "start_date":
        // example: f_start_date=gte:2025-01-01 (supports simple operators)
        const [op, dateStr] = val.split(":");
        if (op === "gte") q = q.gte(field, dateStr);
        else if (op === "lte") q = q.lte(field, dateStr);
        break;
      default:
        q = q.ilike(field, `%${val}%`);
    }
  });

  const { data, count, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  return new Response(JSON.stringify({ data, total: count ?? 0 }), {
    headers: { "content-type": "application/json" },
  });
});
```

**Supabase Query Example**

```ts
// Example server-side query for page 2 (offset 200), 100 rows per page,
// sorted by end_date descending, branch filter "kasko"
const { data, count } = await supabase
  .from("policies")
  .select("*", { count: "exact" })
  .eq("branch", "kasko")
  .order("end_date", { ascending: false })
  .range(200, 299);
```

Deliverables

* Production-ready PolicyTable component with SVAR Grid

* Edge Function implementing server-side pagination, sorting, filtering

* Turkish headers, currency/date formatting, responsive layout, selection

After approval, I will:

* Add the component and Edge Function files in your repo

* Wire up routing and ensure env vars are set

* Verify with large datasets and optimize debounce/cancellation further.

