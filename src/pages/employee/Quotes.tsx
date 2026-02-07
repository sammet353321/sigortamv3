import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Teklif } from '@/types';
import { format } from 'date-fns';
import { Search, Filter, Eye, ArrowRight, Download, Calendar, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from '@/hooks/useDebounce';
import * as XLSX from 'xlsx';

interface Column {
  id: keyof Teklif | string;
  header: string;
  minWidth?: number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export default function EmployeeQuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Teklif[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [uniqueTypes, setUniqueTypes] = useState<string[]>([]);
  
  // Sort State
  const [sort, setSort] = useState<{ id: string, dir: "asc" | "desc" } | null>({ id: 'tarih', dir: 'desc' });

  const debouncedSearch = useDebounce(searchTerm, 500);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Data Fetching
  const fetchQuotes = async () => {
    if (!user) return;
    setLoading(true);
    setData([]);

    try {
      let query = supabase.from('teklifler').select('*', { count: 'exact' });

      // Employee Filter
      if (user?.role === 'employee' || user?.role === 'sub_agent') {
          query = query.eq('employee_id', user.id); // Or kesen_id depending on schema
      }

      // Month Filter
      if (selectedMonth !== 0) {
        const year = new Date().getFullYear();
        const startStr = `${year}-${String(selectedMonth).padStart(2, '0')}-01`;
        let endYear = year;
        let endMonth = selectedMonth + 1;
        if (endMonth > 12) { endMonth = 1; endYear = year + 1; }
        const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
        query = query.gte('tarih', startStr).lt('tarih', endStr);
      }

      // Search
      if (debouncedSearch) {
        query = query.or(`plaka.ilike.%${debouncedSearch}%,tc_vkn.ilike.%${debouncedSearch}%,ad_soyad.ilike.%${debouncedSearch}%`);
      }

      // Filters
      if (filterStatus !== 'all') query = query.eq('durum', filterStatus);
      if (filterType !== 'all') query = query.eq('tur', filterType);

      // Sort
      if (sort) {
        query = query.order(sort.id, { ascending: sort.dir === 'asc' });
      } else {
        query = query.order('tarih', { ascending: false });
      }

      // Pagination (Load all for now as per policy table logic, or batch)
      // For virtualizer to work well with sort/search, we ideally fetch all matching IDs or batch.
      // PolicyTable uses batching.
      
      const pageSize = 1000;
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
          const { data: batchData, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          
          if (batchData && batchData.length > 0) {
              allData = [...allData, ...batchData];
              if (batchData.length < pageSize) hasMore = false;
          } else {
              hasMore = false;
          }
          page++;
          if (page > 100) hasMore = false;
      }

      setData(allData as any);
      setTotalCount(allData.length);
      
      // Extract unique types for filter
      const types = Array.from(new Set(allData.map((q: any) => q.tur).filter(Boolean) as string[]));
      setUniqueTypes(types);

    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Context Menu Copy
  const handleCellContextMenu = (e: React.MouseEvent, text: any) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent row click
      if (!text) return;
      
      const textToCopy = String(text);
      
      const copyToClipboard = async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
                toast.success(`Kopyalandı: ${textToCopy}`, { id: 'copy', duration: 1000, icon: '📋' });
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                toast.success(`Kopyalandı: ${textToCopy}`, { id: 'copy', duration: 1000, icon: '📋' });
            }
        } catch (err) {
            console.error('Copy failed', err);
            toast.error('Kopyalama başarısız');
        }
      };

      copyToClipboard();
  };

  useEffect(() => {
    fetchQuotes();
  }, [user?.id, selectedMonth, debouncedSearch, filterStatus, filterType, sort]);

  const handleSort = (columnId: string) => {
      if (sort?.id === columnId) {
          if (sort.dir === 'asc') setSort({ id: columnId, dir: 'desc' });
          else setSort(null);
      } else {
          setSort({ id: columnId, dir: 'asc' });
      }
  };

  // Excel Export
  const downloadExcel = () => {
    if (!data.length) return;
    const headers = ['AD SOYAD', 'DOĞUM TARİHİ', 'TARİH', 'ŞASİ', 'PLAKA', 'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'TÜR', 'KESEN', 'İLGİLİ KİŞİ', 'POLİÇE NO', 'EK BİLGİLER', 'DURUM'];
    
    const dataToExport = data.map(q => ({
        'AD SOYAD': q.ad_soyad,
        'DOĞUM TARİHİ': q.dogum_tarihi ? format(new Date(q.dogum_tarihi), 'dd.MM.yyyy') : '',
        'TARİH': format(new Date(q.guncellenme_tarihi || q.tarih), 'dd.MM.yyyy HH:mm'),
        'ŞASİ': q.sasi_no,
        'PLAKA': q.plaka,
        'TC/VKN': q.tc_vkn,
        'BELGE NO': q.belge_no,
        'ARAÇ CİNSİ': q.arac_cinsi,
        'TÜR': q.tur,
        'KESEN': (q as any).kesen?.name || '',
        'İLGİLİ KİŞİ': (q as any).ilgili_kisi?.name || '',
        'POLİÇE NO': q.police_no,
        'EK BİLGİLER': q.ek_bilgiler,
        'DURUM': q.durum
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teklifler");
    XLSX.writeFile(wb, `Teklifler_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const columns: Column[] = [
      { id: "ad_soyad", header: "AD SOYAD", minWidth: 200, sortable: true },
      { id: "dogum_tarihi", header: "DOĞUM TARİHİ", minWidth: 120, sortable: true },
      { id: "sirket", header: "ŞİRKET", minWidth: 150, sortable: true },
      { id: "tarih", header: "TARİH", minWidth: 140, sortable: true },
      { id: "sasi", header: "ŞASİ", minWidth: 150, sortable: true },
      { id: "plaka", header: "PLAKA", minWidth: 100, sortable: true },
      { id: "tc_vkn", header: "TC / VKN", minWidth: 120, sortable: true },
      { id: "belge_no", header: "BELGE NO", minWidth: 120, sortable: true },
      { id: "arac_cinsi", header: "ARAÇ CİNSİ", minWidth: 150, sortable: true },
      { id: "brut_prim", header: "BRÜT PRİM", minWidth: 140, sortable: true },
      { id: "tur", header: "TÜR", minWidth: 120, sortable: true },
      { id: "kesen", header: "KESEN", minWidth: 150, sortable: false },
      { id: "ilgili_kisi", header: "İLGİLİ KİŞİ", minWidth: 150, sortable: true },
      { id: "police_no", header: "POLİÇE NO", minWidth: 150, sortable: true },
      { id: "acente", header: "ACENTE", minWidth: 150, sortable: true },
      { id: "kart_bilgisi", header: "KART", minWidth: 80, align: 'center', sortable: false },
      { id: "ek_bilgiler_iletisim", header: "EK BİLGİLER / İLETİŞİM", minWidth: 200, sortable: true },
      { id: "net_prim", header: "NET PRİM", minWidth: 140, sortable: true },
      { id: "komisyon", header: "KOMİSYON", minWidth: 140, sortable: true },
      { id: "durum", header: "DURUM", minWidth: 140, sortable: true },
      { id: "actions", header: "İŞLEM", minWidth: 80, align: 'right', sortable: false },
  ];

  const renderCell = (quote: any, colId: string) => {
      const content = (() => {
        switch(colId) {
            case 'ad_soyad': return <span className="font-bold text-gray-900">{quote.ad_soyad || '-'}</span>;
            case 'dogum_tarihi': return <span className="text-gray-600">{quote.dogum_tarihi ? format(new Date(quote.dogum_tarihi), 'd.MM.yyyy') : '-'}</span>;
            case 'tarih': return <span className="text-gray-600">{format(new Date(quote.guncellenme_tarihi || quote.tarih), 'd.MM.yyyy')}</span>;
            case 'sasi': return <span className="font-mono text-xs">{quote.sasi || '-'}</span>;
            case 'plaka': return <span className="font-bold">{quote.plaka || '-'}</span>;
            case 'tc_vkn': return <span className="font-mono">{quote.tc_vkn || '-'}</span>;
            case 'belge_no': return <span className="font-mono">{quote.belge_no || '-'}</span>;
            case 'kesen': return <span className="text-gray-600">{quote.kesen || '-'}</span>;
            case 'ilgili_kisi': return <span className="text-blue-600 font-medium">{quote.ilgili_kisi || 'Bilinmiyor'}</span>;
            case 'kart_bilgisi': return quote.kart_bilgisi ? <a href={quote.kart_bilgisi} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 flex justify-center"><Eye size={18} /></a> : '-';
            case 'ek_bilgiler_iletisim': return <span className="text-gray-500 text-xs truncate block" title={quote.ek_bilgiler_iletisim || ''}>{quote.ek_bilgiler_iletisim || quote.misafir_bilgi?.phone || '-'}</span>;
            case 'durum': return <StatusBadge status={quote.durum} />;
            case 'actions': return <div className="flex justify-end"><ArrowRight size={18} className="text-gray-400 group-hover:text-blue-600" /></div>;
            case 'brut_prim':
            case 'net_prim':
            case 'komisyon':
                return quote[colId] ? <span>{Number(quote[colId]).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span> : '-';
            default: return <span>{quote[colId] || '-'}</span>;
        }
      })();

      // Wrap in context menu handler
      return (
          <div onContextMenu={(e) => handleCellContextMenu(e, quote[colId])} className="w-full h-full flex items-center">
              {content}
          </div>
      );
  };

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 20,
  });

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Header & Filters */}
      <div className="p-4 bg-white border-b flex flex-wrap gap-4 items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Plaka, TC, İsim ara..." 
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                <Calendar size={16} className="text-gray-500 ml-2" />
                <select 
                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer py-1.5 outline-none" 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                    <option value={0}>Tüm Aylar</option>
                    {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{new Date(0, i).toLocaleString('tr-TR', {month: 'long'})}</option>)}
                </select>
            </div>

            <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <select className="pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">Tüm Ürünler</option>
                  {uniqueTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
            </div>

            <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <select className="pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">Tüm Durumlar</option>
                  <option value="bekliyor">Bekliyor</option>
                  <option value="islemde">İşlemde</option>
                  <option value="hesaplandi">Hesaplandı</option>
                  <option value="onaylandi">Onaylandı</option>
                  <option value="policelestirme_bekliyor">Poliçeleştirme Bekliyor</option>
                  <option value="policelesti">Poliçeleşti</option>
                  <option value="reddedildi">Reddedildi</option>
                </select>
            </div>
        </div>

        <button onClick={downloadExcel} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow">
            <Download size={18} /> Excel İndir
        </button>
      </div>

      {/* Virtualized Table Container */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white border rounded-lg m-4 shadow-sm relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm">
              <Loader2 size={48} className="text-blue-600 animate-spin mb-3" />
              <p className="text-blue-900 font-bold text-lg animate-pulse">Tablo Yükleniyor...</p>
              <p className="text-blue-600 text-sm">Lütfen bekleyiniz</p>
          </div>
        )}

        <div className="w-full relative" style={{ minWidth: 'fit-content' }}>
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 bg-gray-50 border-b border-gray-200 flex min-w-max">
                {columns.map((col) => (
                    <div 
                        key={col.id} 
                        className={`
                            p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50
                            ${col.sortable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}
                        `}
                        style={{ width: col.minWidth, flexShrink: 0, textAlign: col.align || 'left' }}
                        onClick={() => col.sortable && handleSort(col.id as string)}
                    >
                        <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                            {col.header}
                            {sort?.id === col.id && (
                                sort.dir === 'asc' ? <ArrowUp size={14} className="text-blue-600" /> : <ArrowDown size={14} className="text-blue-600" />
                            )}
                            {col.sortable && sort?.id !== col.id && (
                                <ArrowUpDown size={14} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Virtual Body */}
            <div className="relative w-full min-w-max" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const quote = data[virtualRow.index];
                    return (
                        <div
                            key={virtualRow.key}
                            className={`absolute top-0 left-0 w-full flex border-b border-gray-100 transition-colors ${quote.durum === 'policelesti' ? 'bg-gray-50 cursor-default opacity-75' : 'hover:bg-blue-50 cursor-pointer'}`}
                            style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                            onClick={() => {
                                if (quote.durum !== 'policelesti') {
                                    navigate(`/employee/quotes/${quote.id}`);
                                }
                            }}
                        >
                            {columns.map((col) => (
                                <div 
                                    key={`${quote.id}-${col.id}`} 
                                    className="p-3 text-sm flex items-center" 
                                    style={{ width: col.minWidth, flexShrink: 0, justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }}
                                >
                                    <div className="truncate w-full">
                                        {renderCell(quote, col.id as string)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {!loading && data.length === 0 && (
                <div className="p-12 text-center text-gray-500 absolute top-12 left-0 w-full">
                    Kayıt bulunamadı.
                </div>
            )}
        </div>
      </div>
      
      {/* Footer Status */}
      <div className="bg-white border-t px-4 py-2 text-xs text-gray-500 flex justify-between items-center flex-shrink-0">
          <span>Toplam {totalCount} kayıt</span>
          <span>{loading ? 'Yükleniyor...' : 'Hazır'}</span>
      </div>
    </div>
  );
}