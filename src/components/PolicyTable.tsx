import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Grid, Willow } from "@svar-ui/react-grid";
import "@svar-ui/react-grid/all.css";
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Policy } from '../types';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

const PAGE_SIZE = 50;

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function PolicyTable() {
  const [data, setData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);
  
  // Filter states
  const [filters, setFilters] = useState<Record<string, string>>({});
  const debouncedFilters = useDebounce(filters, 500); // 500ms debounce

  const fetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Formatting Helpers
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
        return format(new Date(dateStr), 'dd.MM.yyyy', { locale: tr });
    } catch (e) {
        return dateStr;
    }
  };

  // Data Fetching Logic
  const fetchPolicies = useCallback(async (startIndex: number, sortConfig?: any, filterConfig?: any) => {
    // If we are already fetching this specific page, skip
    if (fetchingRef.current) return;
    
    fetchingRef.current = true;
    setLoading(true);

    // Cancel previous request if it was a filter/sort change (startIndex === 0)
    if (startIndex === 0 && abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 1. Construct Base Query
      let query = supabase.from('policies').select('*', { count: 'exact', head: false });

      // Apply Sort
      if (sortConfig) {
        query = query.order(sortConfig.id, { ascending: sortConfig.dir === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply Filters
      if (filterConfig) {
        Object.entries(filterConfig).forEach(([key, value]) => {
           if (value) query = query.ilike(key, `%${value}%`);
        });
      }

      // 2. Fetch Data
      const { data: results, count, error } = await query
        .range(startIndex, startIndex + PAGE_SIZE - 1)
        .abortSignal(abortController.signal);

      if (error) {
          if (error.code === '20') return; // Abort error
          throw error;
      }

      // 3. Update State
      setData(prev => {
        // If it's a reset (new filters/sort), replace entirely
        if (startIndex === 0) return results || [];
        
        // Efficient Merge: Create a new array only if necessary or append
        const newData = [...prev];
        results?.forEach((item, index) => {
            newData[startIndex + index] = item;
        });
        return newData;
      });
      
      // Update count
      if (count !== null) setTotalCount(count);
      else if (startIndex === 0 && (!results || results.length === 0)) setTotalCount(0);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
          console.error('Error fetching policies:', err);
      }
    } finally {
      if (!abortController.signal.aborted) {
          setLoading(false);
          fetchingRef.current = false;
      }
    }
  }, []);

  // Effect: Trigger fetch when Sort or Debounced Filters change
  useEffect(() => {
    // Reset data and fetch from 0
    setData([]); 
    fetchPolicies(0, sort, debouncedFilters);
  }, [sort, debouncedFilters]);

  // Grid Column Configuration
  const columns = [
    { id: "policy_no", header: "Poliçe No", width: 150, sort: true, filter: "text" },
    { id: "customer_name", header: "Müşteri Adı", width: 200, sort: true, filter: "text" },
    { id: "branch", header: "Branş", width: 120, sort: true, filter: "text" },
    { 
      id: "start_date", 
      header: "Başlangıç", 
      width: 130, 
      sort: true,
      template: (row: Policy) => formatDate(row.start_date) 
    },
    { 
      id: "end_date", 
      header: "Bitiş", 
      width: 130, 
      sort: true,
      template: (row: Policy) => formatDate(row.end_date) 
    },
    { 
      id: "premium_amount", 
      header: "Prim", 
      width: 140, 
      sort: true,
      template: (row: Policy) => formatCurrency(row.premium_amount) 
    },
    {
      id: "created_at",
      header: "Oluşturulma",
      width: 130,
      hidden: true
    }
  ];

  const handleScrollEnd = () => {
    if (!loading && data.length < totalCount) {
        fetchPolicies(data.length, sort, debouncedFilters);
    }
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data.map(p => ({
        'Poliçe No': p.policy_no,
        'Müşteri': p.customer_name,
        'Branş': p.branch,
        'Başlangıç': formatDate(p.start_date),
        'Bitiş': formatDate(p.end_date),
        'Prim': p.premium_amount
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Poliçeler");
    XLSX.writeFile(wb, "policeler.xlsx");
  };

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h2 className="text-lg font-semibold text-gray-800">Poliçe Listesi</h2>
        <div className="flex items-center gap-2">
            <button 
                onClick={handleExportExcel}
                className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded flex items-center transition-colors mr-2"
            >
                <Download size={14} className="mr-1" /> Excel İndir
            </button>
            <span className="text-sm text-gray-500">
                {totalCount > 0 ? `Toplam: ${totalCount} Kayıt` : (loading ? 'Yükleniyor...' : 'Kayıt Yok')}
            </span>
            {loading && <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>}
        </div>
      </div>

      {/* SVAR DataGrid */}
      <div className="flex-1 relative min-h-[500px]">
        <Willow>
            <Grid
              data={data}
              columns={columns}
              rowHeight={45}
              virtual={true}
              
              // Server-side Sorting
              sortMode="server"
              onSortChange={(id, dir) => {
                  setSort({ id, dir });
              }}

              // Server-side Filtering
              filterMode="server"
              onFilterChange={(newFilters) => {
                  setFilters(newFilters); // This updates state, which triggers useDebounce -> useEffect
              }}
              
              // Infinite Scroll
              onScrollEnd={handleScrollEnd}
            />
        </Willow>
      </div>
    </div>
  );
}
