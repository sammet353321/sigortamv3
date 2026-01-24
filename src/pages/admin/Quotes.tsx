import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Teklif } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Search, Download, ArrowUp, ArrowDown, ArrowUpDown, Loader2, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useDebounce } from '@/hooks/useDebounce';

interface Column {
  id: keyof Teklif | string;
  header: string;
  minWidth?: string;
  sortable?: boolean;
}

export default function AdminQuotesPage() {
    const [quotes, setQuotes] = useState<Teklif[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
    
    // Sort State - Default Ascending
    const [sort, setSort] = useState<{ id: string, dir: "asc" | "desc" } | null>({ id: 'tarih', dir: 'asc' });

    // Debounce search
    const debouncedSearch = useDebounce(searchTerm, 500);

    // Scroll Container Ref
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const months = [
        { value: 0, label: 'Tüm Aylar' },
        { value: 1, label: 'Ocak' },
        { value: 2, label: 'Şubat' },
        { value: 3, label: 'Mart' },
        { value: 4, label: 'Nisan' },
        { value: 5, label: 'Mayıs' },
        { value: 6, label: 'Haziran' },
        { value: 7, label: 'Temmuz' },
        { value: 8, label: 'Ağustos' },
        { value: 9, label: 'Eylül' },
        { value: 10, label: 'Ekim' },
        { value: 11, label: 'Kasım' },
        { value: 12, label: 'Aralık' }
    ];

    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return '-';
        return new Intl.NumberFormat('tr-TR', { 
            style: 'decimal', 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2,
            useGrouping: false 
        }).format(num) + ' ₺';
    };

    const formatDate = (dateStr: any, withTime = false) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return String(dateStr);
            return format(d, withTime ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy', { locale: tr });
        } catch {
            return String(dateStr);
        }
    };

    const fetchQuotes = async (offset = 0, currentSort = sort, search = debouncedSearch, isLoadMore = false) => {
        if (!isLoadMore) {
            setLoading(true);
            setQuotes([]); // Clear table immediately for new filter
        }
        else setLoadingMore(true);

        try {
            let query = supabase.from('teklifler').select('*', { count: 'exact', head: false });

            // Month Filter
            if (selectedMonth !== 0) {
                 const year = new Date().getFullYear();
                 const start = new Date(year, selectedMonth - 1, 1);
                 const end = new Date(year, selectedMonth, 1);
                 const startStr = format(start, 'yyyy-MM-dd');
                 const endStr = format(end, 'yyyy-MM-dd');
                 query = query.gte('tarih', startStr).lt('tarih', endStr);
            }

            // Text Search
            if (search) {
                query = query.or(`plaka.ilike.%${search}%,tc_vkn.ilike.%${search}%,ad_soyad.ilike.%${search}%`);
            }

            // Sort
            if (currentSort) {
                query = query.order(currentSort.id, { ascending: currentSort.dir === 'asc' });
            } else {
                query = query.order('tarih', { ascending: true });
            }

            // Pagination - DISABLED to load ALL data for the month at once as requested
            // User request: "sayfa açıldığı an ocak seçildiğinde bütün ocakları çek yükleniyor animasyonu olsun"
            // So we fetch ALL matching rows, no range limit.
            // const pageSize = 50;
            // query = query.range(offset, offset + pageSize - 1);

            const { data, count, error } = await query;

            if (error) throw error;
            
            if (offset === 0) {
                setQuotes(data || []);
                if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
            } else {
                setQuotes(prev => [...prev, ...(data || [])]);
            }
            setTotalCount(count || 0);

        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchQuotes(0, sort, debouncedSearch);
    }, [selectedMonth, debouncedSearch, sort]);

    const handleScroll = () => {
        if (!tableContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;
        if (scrollHeight - scrollTop - clientHeight < 100 && !loading && !loadingMore && quotes.length < totalCount) {
            fetchQuotes(quotes.length, sort, debouncedSearch, true);
        }
    };

    const handleSort = (columnId: string) => {
        if (sort?.id === columnId) {
            if (sort.dir === 'asc') setSort({ id: columnId, dir: 'desc' });
            else setSort(null);
        } else {
            setSort({ id: columnId, dir: 'asc' });
        }
    };

    const exportToExcel = async () => {
        try {
            setLoading(true);
            // Fetch ALL data
            let query = supabase.from('teklifler').select('*');
            if (selectedMonth !== 0) {
                 const year = new Date().getFullYear();
                 const startStr = format(new Date(year, selectedMonth - 1, 1), 'yyyy-MM-dd');
                 const endStr = format(new Date(year, selectedMonth, 1), 'yyyy-MM-dd');
                 query = query.gte('tarih', startStr).lt('tarih', endStr);
            }
            if (debouncedSearch) {
                query = query.or(`plaka.ilike.%${debouncedSearch}%,tc_vkn.ilike.%${debouncedSearch}%,ad_soyad.ilike.%${debouncedSearch}%`);
            }
            if (sort) query = query.order(sort.id, { ascending: sort.dir === 'asc' });
            
            const { data: allData, error } = await query;
            if (error) throw error;

            const dataToExport = (allData || []).map(q => ({
                'AD SOYAD': q.ad_soyad || '-',
                'DOĞUM TARİHİ': formatDate(q.dogum_tarihi),
                'TARİH': formatDate(q.tarih, true),
                'ŞASİ': q.sasi_no || '-',
                'PLAKA': q.plaka || '-',
                'TC/VKN': q.tc_vkn || q.tc || '-',
                'BELGE NO': q.belge_no || q.ruhsat_seri_no || '-',
                'ARAÇ CİNSİ': q.arac_cinsi || '-',
                'TÜR': q.tur || '-',
                'KESEN': (q as any).kesen?.name || '-',
                'İLGİLİ KİŞİ': q.ilgili_kisi?.name || '-',
                'POLİÇE NO': q.police_no || '-',
                'EK BİLGİLER': q.ek_bilgiler || '-',
                'DURUM': q.durum
            }));

            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Teklifler");
            XLSX.writeFile(wb, `Teklifler_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
        } catch (error) {
            console.error(error);
            alert('Excel indirme hatası');
        } finally {
            setLoading(false);
        }
    };

    const columns: Column[] = [
        { id: "ad_soyad", header: "AD SOYAD", minWidth: "200px", sortable: true },
        { id: "dogum_tarihi", header: "DOĞUM TARİHİ", minWidth: "120px", sortable: true },
        { id: "sirket", header: "ŞİRKET", minWidth: "150px", sortable: true },
        { id: "tarih", header: "TARİH", minWidth: "140px", sortable: true },
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
        { id: "ek_bilgiler", header: "EK BİLGİLER", minWidth: "250px", sortable: true },
        { id: "net_prim", header: "NET PRİM", minWidth: "140px", sortable: true },
        { id: "komisyon", header: "KOMİSYON", minWidth: "140px", sortable: true },
        { id: "durum", header: "DURUM", minWidth: "140px", sortable: true },
    ];

    const renderCell = (quote: Teklif, colId: string) => {
        switch(colId) {
            case 'brut_prim':
            case 'net_prim':
            case 'komisyon':
                return formatCurrency((quote as any)[colId]);
            case 'dogum_tarihi':
                return formatDate(quote.dogum_tarihi);
            case 'tarih':
                return formatDate(quote.tarih, true); // With time
            case 'durum':
                return <StatusBadge status={quote.durum} />;
            case 'tc_vkn': return quote.tc_vkn || quote.tc || '-';
            case 'sasi': return quote.sasi_no || '-';
            case 'belge_no': return quote.belge_no || quote.ruhsat_seri_no || '-';
            case 'kesen': return (quote as any).kesen?.name || '-';
            case 'ilgili_kisi': return quote.ilgili_kisi?.name || '-';
            case 'kart': return quote.kart_bilgisi || '-';
            default:
                return (quote as any)[colId] || '-';
        }
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="mb-6 flex justify-between items-end flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Tüm Teklifler</h1>
                    <p className="text-gray-500">Tüm sigorta tekliflerini buradan yönetebilirsiniz.</p>
                </div>
            </div>

            <div className="flex flex-col h-full bg-gray-50/50 flex-1 min-h-0">
                {/* Filters */}
                <div className="p-4 bg-white border-b flex flex-wrap gap-4 items-center justify-between shadow-sm z-10">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Plaka, TC, Ad Soyad Ara..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                            <Calendar size={16} className="text-gray-500 ml-2" />
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer py-1.5"
                            >
                                {months.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow"
                    >
                        <Download size={18} />
                        Excel İndir
                    </button>
                </div>

                {/* Table */}
                <div 
                    ref={tableContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-auto bg-white border rounded-lg m-4 shadow-sm relative"
                >
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
                            {loading && quotes.length === 0 ? (
                                Array.from({ length: 10 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {columns.map((col, idx) => (
                                            <td key={idx} className="p-4 border-b border-gray-100">
                                                <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                quotes.map((quote, rowIndex) => (
                                    <tr 
                                        key={`${quote.id}-${rowIndex}`} 
                                        className={`
                                            transition-colors group
                                            ${quote.durum === 'iptal' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-blue-50/50'}
                                        `}
                                    >
                                        {columns.map((col) => (
                                            <td 
                                                key={`${quote.id}-${col.id}`} 
                                                className={`
                                                    p-3 text-sm border-b border-gray-100
                                                    ${quote.durum === 'iptal' ? 'text-red-900 border-red-100' : 'text-gray-700 group-hover:bg-blue-50/50'}
                                                `}
                                            >
                                                <div className="truncate" style={{ maxWidth: col.minWidth }}>
                                                    {renderCell(quote, col.id as string)}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                            {loadingMore && (
                                <tr>
                                    <td colSpan={columns.length} className="p-4 text-center text-gray-500 bg-gray-50">
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            Daha fazla yükleniyor...
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {!loading && quotes.length === 0 && (
                        <div className="p-12 text-center text-gray-500">Kayıt bulunamadı.</div>
                    )}
                </div>

                <div className="bg-white border-t px-4 py-2 text-xs text-gray-500 flex justify-between items-center flex-shrink-0">
                    <span>Toplam {totalCount} kayıt</span>
                    <span>{loading || loadingMore ? 'Yükleniyor...' : 'Hazır'}</span>
                </div>
            </div>
        </div>
    );
}