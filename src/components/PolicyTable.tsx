import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Search, Calendar, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, Loader2, Download } from 'lucide-react';
import PolicyImportModal from './PolicyImportModal';
import { useDebounce } from '../hooks/useDebounce';
import * as XLSX from 'xlsx';

interface Policy {
  id: number;
  police_no: string;
  ad_soyad: string;
  plaka: string;
  sirket: string;
  tarih: string;
  brut_prim: number;
  net_prim: number;
  komisyon: number;
  tur: string;
  durum: string;
  dogum_tarihi: string;
  sasi: string;
  tc_vkn: string;
  belge_no: string;
  arac_cinsi: string;
  kesen: string;
  ilgili_kisi: string;
  acente: string;
  kart: string;
  ek_bilgiler_iletisim: string;
}

interface Column {
  id: keyof Policy | string;
  header: string;
  width?: string; // Tailwind width class or pixel value
  minWidth?: string;
  sortable?: boolean;
}

export default function PolicyTable() {
  const { user } = useAuth();
  const [data, setData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // Default current month
  const [showCancelled, setShowCancelled] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // Sort State - Default Ascending by Date
  const [sort, setSort] = useState<{ id: string, dir: "asc" | "desc" } | null>({ id: 'tarih', dir: 'asc' });
  
  // Debounce search
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Scroll Container Ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Formatters
  const formatCurrency = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return '0,00 ₺';
    // Custom format: 7999,95 instead of 7.999,95
    return new Intl.NumberFormat('tr-TR', { 
        style: 'decimal', 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2,
        useGrouping: false 
    }).format(num) + ' ₺';
  };

  const formatDate = (dateStr: any) => {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('tr-TR');
    } catch {
        return String(dateStr);
    }
  };

  // Export to Excel
  const exportToExcel = async () => {
    try {
        setLoading(true);
        // Fetch ALL data for export matching current filters
        let query = supabase.from('policeler').select('*');

        // Month Filter
        if (selectedMonth !== 0) {
            const year = new Date().getFullYear();
            const startStr = new Date(year, selectedMonth - 1, 1).toISOString().split('T')[0];
            const endStr = new Date(year, selectedMonth, 1).toISOString().split('T')[0];
            query = query.gte('tarih', startStr).lt('tarih', endStr);
        }

        // Text Search
        if (debouncedSearch) {
            query = query.or(`plaka.ilike.%${debouncedSearch}%,tc_vkn.ilike.%${debouncedSearch}%,ad_soyad.ilike.%${debouncedSearch}%,police_no.ilike.%${debouncedSearch}%`);
        }

        // Sort
        if (sort) {
            query = query.order(sort.id, { ascending: sort.dir === 'asc' });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        const { data: allData, error } = await query;
        if (error) throw error;

        const dataToExport = (allData || []).map(p => ({
            'AD SOYAD': p.ad_soyad,
            'DOĞUM TARİHİ': formatDate(p.dogum_tarihi),
            'ŞİRKET': p.sirket,
            'TARİH': formatDate(p.tarih),
            'ŞASİ': p.sasi,
            'PLAKA': p.plaka,
            'TC/VKN': p.tc_vkn,
            'BELGE NO': p.belge_no,
            'ARAÇ CİNSİ': p.arac_cinsi,
            'BRÜT PRİM': p.brut_prim,
            'TÜR': p.tur,
            'KESEN': p.kesen,
            'İLGİLİ KİŞİ': p.ilgili_kisi,
            'POLİÇE NO': p.police_no,
            'ACENTE': p.acente,
            'KART': p.kart,
            'EK BİLGİLER': p.ek_bilgiler_iletisim,
            'NET PRİM': p.net_prim,
            'KOMİSYON': p.komisyon,
            'DURUM': p.durum
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Poliçeler");
        XLSX.writeFile(wb, `Policeler_${new Date().toISOString().slice(0,10)}.xlsx`);

    } catch (error) {
        console.error('Export error:', error);
        alert('Excel indirilirken bir hata oluştu.');
    } finally {
        setLoading(false);
    }
  };

  // Data Fetching Logic
  const fetchPolicies = async (currentSort = sort, search = debouncedSearch) => {
    setLoading(true);
    setData([]); 

    try {
      let query = supabase.from('policeler').select('*', { count: 'exact', head: false });

      // Month Filter (Full Month Coverage Fix - Timezone Safe)
      if (selectedMonth !== 0) {
            const year = new Date().getFullYear();
            // Construct YYYY-MM-DD strings manually to avoid timezone shifts
            const startStr = `${year}-${String(selectedMonth).padStart(2, '0')}-01`;
            
            // Calculate next month for the end date (exclusive)
            let endYear = year;
            let endMonth = selectedMonth + 1;
            if (endMonth > 12) {
                endMonth = 1;
                endYear = year + 1;
            }
            const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
            
            query = query.gte('tarih', startStr).lt('tarih', endStr);
      }

      // Cancelled Filter
      if (!showCancelled) {
          query = query.not('durum', 'ilike', '%iptal%');
      }

      // Text Search
      if (search) {
        query = query.or(`plaka.ilike.%${search}%,tc_vkn.ilike.%${search}%,ad_soyad.ilike.%${search}%,police_no.ilike.%${search}%`);
      }

      // Apply Sort
      if (currentSort) {
        query = query.order(currentSort.id, { ascending: currentSort.dir === 'asc' });
      } else {
        query = query.order('tarih', { ascending: true });
      }
      
      // Pagination REMOVED - Fetch ALL data
      // query = query.range(offset, offset + pageSize - 1);

      const { data: results, count, error } = await query;
      
      if (error) throw error;
      
      setData(results || []);
      // Reset scroll position when filter changes
      if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;

      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies(sort, debouncedSearch);
  }, [sort, selectedMonth, debouncedSearch, showCancelled]);

  const handleScroll = () => {
      // Infinite scroll disabled as per request
      // if (!tableContainerRef.current) return;
      // const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;
      // if (scrollHeight - scrollTop - clientHeight < 100 && !loading && !loadingMore && data.length < totalCount) {
      //    fetchPolicies(data.length, sort, debouncedSearch, true);
      // }
  };

  const handleSort = (columnId: string) => {
      if (sort?.id === columnId) {
          if (sort.dir === 'asc') setSort({ id: columnId, dir: 'desc' });
          else setSort(null);
      } else {
          setSort({ id: columnId, dir: 'asc' });
      }
  };

  const columns: Column[] = [
    { id: "ad_soyad", header: "AD SOYAD", minWidth: "200px", sortable: true },
    { id: "dogum_tarihi", header: "DOĞUM TARİHİ", minWidth: "120px", sortable: true },
    { id: "sirket", header: "ŞİRKET", minWidth: "150px", sortable: true },
    { id: "tarih", header: "TARİH", minWidth: "120px", sortable: true },
    { id: "sasi", header: "ŞASİ", minWidth: "180px", sortable: true },
    { id: "plaka", header: "PLAKA", minWidth: "120px", sortable: true },
    { id: "tc_vkn", header: "TC/VKN", minWidth: "140px", sortable: true },
    { id: "belge_no", header: "BELGE NO", minWidth: "140px", sortable: true },
    { id: "arac_cinsi", header: "ARAÇ CİNSİ", minWidth: "160px", sortable: true },
    { id: "brut_prim", header: "BRÜT PRİM", minWidth: "140px", sortable: true },
    { id: "tur", header: "TÜR", minWidth: "140px", sortable: true },
    { id: "kesen", header: "KESEN", minWidth: "160px", sortable: true },
    { id: "ilgili_kisi", header: "İLGİLİ KİŞİ", minWidth: "160px", sortable: true },
    { id: "police_no", header: "POLİÇE NO", minWidth: "160px", sortable: true },
    { id: "acente", header: "ACENTE", minWidth: "160px", sortable: true },
    { id: "kart", header: "KART", minWidth: "160px", sortable: true },
    { id: "ek_bilgiler_iletisim", header: "EK BİLGİLER", minWidth: "250px", sortable: true },
    { id: "net_prim", header: "NET PRİM", minWidth: "140px", sortable: true },
    { id: "komisyon", header: "KOMİSYON", minWidth: "140px", sortable: true },
    { id: "durum", header: "DURUM", minWidth: "120px", sortable: true },
  ];

  const renderCell = (policy: Policy, colId: string) => {
      switch(colId) {
          case 'brut_prim':
          case 'net_prim':
          case 'komisyon':
              return formatCurrency((policy as any)[colId]);
          case 'tarih':
          case 'dogum_tarihi':
              return formatDate((policy as any)[colId]);
          case 'durum':
              return (policy as any)[colId] || 'POLİÇE';
          default:
              return (policy as any)[colId] || '-';
      }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Filters Bar */}
      <div className="p-4 bg-white border-b flex flex-wrap gap-4 items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Plaka, TC, Ad Soyad veya Poliçe No ara..." 
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                <Calendar size={16} className="text-gray-500 ml-2" />
                <select 
                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer py-1.5"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                    <option value={0}>Tüm Aylar</option>
                    <option value={1}>Ocak</option>
                    <option value={2}>Şubat</option>
                    <option value={3}>Mart</option>
                    <option value={4}>Nisan</option>
                    <option value={5}>Mayıs</option>
                    <option value={6}>Haziran</option>
                    <option value={7}>Temmuz</option>
                    <option value={8}>Ağustos</option>
                    <option value={9}>Eylül</option>
                    <option value={10}>Ekim</option>
                    <option value={11}>Kasım</option>
                    <option value={12}>Aralık</option>
                </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 px-3 h-[38px]">
                <input 
                    type="checkbox" 
                    id="showCancelledTable" 
                    checked={showCancelled} 
                    onChange={(e) => setShowCancelled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="showCancelledTable" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                    İptalleri Göster
                </label>
            </div>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow"
            >
                <Download size={18} />
                Excel İndir
            </button>
            <button 
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow"
            >
                <FileSpreadsheet size={18} />
                Excel Yükle
            </button>
        </div>
      </div>

      {/* Standard HTML Table Container */}
      <div 
        ref={tableContainerRef}
        className="flex-1 overflow-auto bg-white border rounded-lg m-4 shadow-sm relative"
      >
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm">
                <Loader2 size={48} className="text-blue-600 animate-spin mb-3" />
                <p className="text-blue-900 font-bold text-lg animate-pulse">Tablo Yükleniyor...</p>
                <p className="text-blue-600 text-sm">Lütfen bekleyiniz</p>
            </div>
          )}

          <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-30 shadow-sm">
                  <tr>
                      {columns.map((col, index) => (
                          <th 
                              key={col.id} 
                              className={`
                                p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 bg-gray-50
                                ${col.sortable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}
                              `}
                              style={{ minWidth: col.minWidth }}
                              onClick={() => col.sortable && handleSort(col.id as string)}
                          >
                              <div className="flex items-center gap-2">
                                  {col.header}
                                  {sort?.id === col.id && (
                                      sort.dir === 'asc' ? <ArrowUp size={14} className="text-blue-600" /> : <ArrowDown size={14} className="text-blue-600" />
                                  )}
                                  {col.sortable && sort?.id !== col.id && (
                                      <ArrowUpDown size={14} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                                  )}
                              </div>
                          </th>
                      ))}
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {data.map((policy, rowIndex) => (
                      <tr 
                        key={`${policy.id}-${rowIndex}`} 
                        className={`
                            transition-colors group
                            ${policy.durum === 'İPTAL' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-blue-50/50'}
                        `}
                      >
                          {columns.map((col, colIndex) => (
                              <td 
                                  key={`${policy.id}-${col.id}`} 
                                  className={`
                                    p-3 text-sm border-b border-gray-100 
                                    ${policy.durum === 'İPTAL' ? 'text-red-900 border-red-100' : 'text-gray-700 group-hover:bg-blue-50/50'}
                                  `}
                              >
                                  <div className="truncate" style={{ maxWidth: col.minWidth }}>
                                      {renderCell(policy, col.id as string)}
                                  </div>
                              </td>
                          ))}
                      </tr>
                  ))}
              </tbody>
          </table>
          
          {!loading && data.length === 0 && (
              <div className="p-12 text-center text-gray-500">
                  Kayıt bulunamadı.
              </div>
          )}
      </div>
      
      {/* Footer Status */}
      <div className="bg-white border-t px-4 py-2 text-xs text-gray-500 flex justify-between items-center flex-shrink-0">
          <span>Toplam {totalCount} kayıt</span>
          <span>{loading ? 'Yükleniyor...' : 'Hazır'}</span>
      </div>

      <PolicyImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onSuccess={() => {
            fetchPolicies(0, sort, debouncedSearch);
        }}
      />
    </div>
  );
}