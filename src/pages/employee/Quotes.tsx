import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Teklif } from '@/types';
import { format } from 'date-fns';
import { Search, Filter, Eye, ArrowRight, Download, Calendar, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function EmployeeQuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Teklif[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [uniqueTypes, setUniqueTypes] = useState<string[]>([]);
  
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchQuotes();
  }, [user, selectedMonth]);

  const handleCellContextMenu = (e: React.MouseEvent, text: string | number | null | undefined) => {
      e.preventDefault();
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

  const fetchQuotes = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setQuotes([]);
      
      let query = supabase
        .from('teklifler')
        .select('*')
        .order('tarih', { ascending: false });

      // Employee Filter
      if (user?.role === 'employee' || user?.role === 'sub_agent') {
          query = query.eq('employee_id', user.id);
      }

      if (selectedMonth !== 0) {
        const year = new Date().getFullYear();
        const startStr = `${year}-${String(selectedMonth).padStart(2, '0')}-01`;
        let endYear = year;
        let endMonth = selectedMonth + 1;
        if (endMonth > 12) { endMonth = 1; endYear = year + 1; }
        const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
        query = query.gte('tarih', startStr).lt('tarih', endStr);
      }

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

      setQuotes(allData as any || []);
      const types = Array.from(new Set(allData?.map((q: any) => q.tur).filter(Boolean) as string[]));
      setUniqueTypes(types);

    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = quotes.filter(quote => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (quote.plaka?.toLowerCase().includes(searchLower) || '') ||
      (quote.tc_vkn?.includes(searchLower) || '') ||
      ((quote as any).ilgili_kisi?.name?.toLowerCase().includes(searchLower) || '');

    const matchesStatus = filterStatus === 'all' || quote.durum === filterStatus;
    const matchesType = filterType === 'all' || quote.tur === filterType;

    return matchesSearch && matchesStatus && matchesType;
  });

  const downloadExcel = () => {
    if (!filteredQuotes.length) return;
    const headers = ['AD SOYAD', 'DOĞUM TARİHİ', 'TARİH', 'ŞASİ', 'PLAKA', 'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'TÜR', 'KESEN', 'İLGİLİ KİŞİ', 'POLİÇE NO', 'EK BİLGİLER', 'DURUM'];
    const csvContent = [
      headers.join(';'),
      ...filteredQuotes.map(q => {
        const date = q.dogum_tarihi ? format(new Date(q.dogum_tarihi), 'dd.MM.yyyy') : '';
        const createdDate = format(new Date(q.guncellenme_tarihi || q.tarih), 'dd.MM.yyyy HH:mm');
        const kesen = (q as any).kesen?.name || '';
        const ilgiliKisi = (q as any).ilgili_kisi?.name || '';
        return [
          `"${q.ad_soyad || ''}"`, `"${date}"`, `"${createdDate}"`, `"${q.sasi_no || ''}"`, `"${q.plaka || ''}"`, `"${q.tc_vkn || ''}"`, `"${q.belge_no || ''}"`, `"${q.arac_cinsi || ''}"`, `"${q.tur || ''}"`, `"${kesen}"`, `"${ilgiliKisi}"`, `"${q.police_no || ''}"`, `"${(q.ek_bilgiler || '').replace(/"/g, '""')}"`, `"${q.durum}"`
        ].join(';');
      })
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `teklifler_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: filteredQuotes.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 20,
  });

  const columns = [
      { header: "AD SOYAD", width: 200, render: (q: any) => <span className="font-bold text-gray-900">{q.ad_soyad || '-'}</span> },
      { header: "DOĞUM TARİHİ", width: 120, render: (q: any) => <span className="text-gray-600">{q.dogum_tarihi ? format(new Date(q.dogum_tarihi), 'd.MM.yyyy') : '-'}</span> },
      { header: "ŞİRKET", width: 100, render: () => <span className="text-gray-600">-</span> },
      { header: "TARİH", width: 140, render: (q: any) => <span className="text-gray-600">{format(new Date(q.guncellenme_tarihi || q.tarih), 'd.MM.yyyy HH:mm')}</span> },
      { header: "ŞASİ", width: 150, render: (q: any) => <span className="font-mono text-xs">{q.sasi_no || '-'}</span> },
      { header: "PLAKA", width: 100, render: (q: any) => <span className="font-bold">{q.plaka || '-'}</span> },
      { header: "TC / VKN", width: 120, render: (q: any) => <span className="font-mono">{q.tc_vkn || '-'}</span> },
      { header: "BELGE NO", width: 120, render: (q: any) => <span className="font-mono">{q.belge_no || '-'}</span> },
      { header: "ARAÇ CİNSİ", width: 150, render: (q: any) => <span>{q.arac_cinsi || '-'}</span> },
      { header: "BRÜT PRİM", width: 120, render: () => <span className="text-gray-600">-</span> },
      { header: "TÜR", width: 120, render: (q: any) => <span>{q.tur || '-'}</span> },
      { header: "KESEN", width: 150, render: (q: any) => <span className="text-gray-600">{q.kesen?.name || '-'}</span> },
      { header: "İLGİLİ KİŞİ", width: 150, render: (q: any) => <span className="text-blue-600 font-medium">{q.tali || q.ilgili_kisi?.name || 'Bilinmiyor'}</span> },
      { header: "POLİÇE NO", width: 150, render: (q: any) => <span className="text-gray-600">{q.police_no || '-'}</span> },
      { header: "ACENTE", width: 120, render: () => <span className="text-gray-600">-</span> },
      { header: "KART", width: 80, align: 'center', render: (q: any) => q.kart_bilgisi ? <a href={q.kart_bilgisi} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 flex justify-center"><Eye size={18} /></a> : '-' },
      { header: "EK BİLGİLER", width: 200, render: (q: any) => <span className="text-gray-500 text-xs truncate block" title={q.ek_bilgiler || ''}>{q.ek_bilgiler || q.misafir_bilgi?.phone || '-'}</span> },
      { header: "NET PRİM", width: 120, render: () => <span className="text-gray-600">-</span> },
      { header: "KOMİSYON", width: 120, render: () => <span className="text-gray-600">-</span> },
      { header: "DURUM", width: 140, render: (q: any) => <StatusBadge status={q.durum} /> },
      { header: "İŞLEM", width: 80, align: 'right', render: () => <div className="flex justify-end"><ArrowRight size={18} className="text-gray-400 group-hover:text-blue-600" /></div> },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50/50 space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 bg-white border-b shadow-sm z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Teklifler</h1>
          <p className="text-gray-500 text-sm">Size atanan ve bekleyen tüm teklifler</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={downloadExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Download size={18} /> Excel İndir
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" placeholder="Plaka, TC, İsim ara..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-300">
            <Calendar size={18} className="text-gray-500 ml-2" />
            <select className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer py-1.5 outline-none" value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                <option value={0}>Tüm Aylar</option>
                {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{new Date(0, i).toLocaleString('tr-TR', {month: 'long'})}</option>)}
            </select>
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-full sm:w-48" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">Tüm Ürünler</option>
              {uniqueTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-full sm:w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
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
                {columns.map((col, idx) => (
                    <div key={idx} className="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50" style={{ width: col.width, flexShrink: 0, textAlign: col.align as any }}>
                        {col.header}
                    </div>
                ))}
            </div>

            {/* Virtual Body */}
            <div className="relative w-full min-w-max" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const quote = filteredQuotes[virtualRow.index];
                    return (
                        <div
                            key={virtualRow.key}
                            className={`absolute top-0 left-0 w-full flex border-b border-gray-100 transition-colors ${quote.durum === 'policelesti' ? 'bg-gray-50 cursor-default opacity-75' : 'hover:bg-blue-50 cursor-pointer'}`}
                            style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                            onClick={() => {
                                if (quote.durum !== 'policelesti') {
                                    navigate(`/employee/policies/cut/${quote.id}`);
                                }
                            }}
                        >
                            {columns.map((col, idx) => (
                                <div 
                                    key={idx} 
                                    className="p-3 text-sm flex items-center" 
                                    style={{ width: col.width, flexShrink: 0, justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }}
                                    onContextMenu={(e) => {
                                        // Context menu logic needs specific text, extracting simplistic text here
                                        let text = '';
                                        if (col.header === 'AD SOYAD') text = quote.ad_soyad;
                                        else if (col.header === 'PLAKA') text = quote.plaka;
                                        else if (col.header === 'TC / VKN') text = quote.tc_vkn;
                                        // ... other fields can be added if needed
                                        if (text) handleCellContextMenu(e, text);
                                    }}
                                >
                                    <div className="truncate w-full">
                                        {col.render(quote)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {!loading && filteredQuotes.length === 0 && (
                <div className="p-12 text-center text-gray-500 absolute top-12 left-0 w-full">
                    Kayıt bulunamadı.
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
