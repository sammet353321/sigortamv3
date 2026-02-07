import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { format, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Search, Filter, ArrowRight, Clock, Download, Eye, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface Policy {
  id: number;
  police_no: string;
  ad_soyad: string;
  plaka: string;
  sirket: string;
  tarih: string; // Expiration Date
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
  urun: string;
}

interface Column {
  id: keyof Policy | string;
  header: string;
  minWidth?: string;
  sortable?: boolean;
}

export default function RenewalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [uniqueTypes, setUniqueTypes] = useState<string[]>([]);
  
  // Sort State
  const [sort, setSort] = useState<{ id: string, dir: "asc" | "desc" } | null>({ id: 'tarih', dir: 'asc' });

  useEffect(() => {
    fetchRenewals();
  }, [user]);

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

  const fetchRenewals = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const today = new Date();
      const next14Days = addDays(today, 14);
      
      const { data, error } = await supabase
        .from('policeler')
        .select('*')
        .gte('tarih', today.toISOString().split('T')[0])
        .lte('tarih', next14Days.toISOString().split('T')[0])
        .order('tarih', { ascending: true });

      if (error) throw error;
      setPolicies(data || []);
      
      // Extract unique types for filter
      const types = Array.from(new Set(data?.map(p => p.tur).filter(Boolean) as string[]));
      setUniqueTypes(types);

    } catch (error) {
      console.error('Error fetching renewals:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPolicies = policies.filter(policy => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (policy.plaka?.toLowerCase().includes(searchLower) || '') ||
      (policy.tc_vkn?.includes(searchLower) || '') ||
      (policy.ad_soyad?.toLowerCase().includes(searchLower) || '');

    const matchesType = filterType === 'all' || policy.tur === filterType;

    return matchesSearch && matchesType;
  });

  // Sort logic
  const sortedPolicies = [...filteredPolicies].sort((a: any, b: any) => {
      if (!sort) return 0;
      const aVal = a[sort.id];
      const bVal = b[sort.id];
      
      if (sort.id === 'tarih' || sort.id === 'dogum_tarihi') {
          return sort.dir === 'asc' 
              ? new Date(aVal || 0).getTime() - new Date(bVal || 0).getTime()
              : new Date(bVal || 0).getTime() - new Date(aVal || 0).getTime();
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sort.dir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
  });

  const handleSort = (columnId: string) => {
      if (sort?.id === columnId) {
          if (sort.dir === 'asc') setSort({ id: columnId, dir: 'desc' });
          else setSort(null);
      } else {
          setSort({ id: columnId, dir: 'asc' });
      }
  };

  const downloadExcel = () => {
    if (!sortedPolicies.length) return;
    const headers = ['AD SOYAD', 'DOĞUM TARİHİ', 'ŞİRKET', 'BİTİŞ TARİHİ', 'ŞASİ', 'PLAKA', 'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'BRÜT PRİM', 'TÜR', 'KESEN', 'İLGİLİ KİŞİ', 'POLİÇE NO', 'ACENTE', 'KART', 'EK BİLGİLER / İLETİŞİM', 'NET PRİM', 'KOMİSYON', 'KALAN GÜN'];
    
    const csvContent = [
      headers.join(';'),
      ...sortedPolicies.map(p => {
        const daysLeft = Math.ceil((new Date(p.tarih).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const date = p.dogum_tarihi ? format(new Date(p.dogum_tarihi), 'dd.MM.yyyy') : '';
        const endDate = format(new Date(p.tarih), 'dd.MM.yyyy');
        
        return [
          `"${p.ad_soyad || ''}"`, `"${date}"`, `"${p.sirket || ''}"`, `"${endDate}"`, `"${p.sasi || ''}"`,
          `"${p.plaka || ''}"`, `"${p.tc_vkn || ''}"`, `"${p.belge_no || ''}"`, `"${p.arac_cinsi || ''}"`,
          `"${p.brut_prim || ''}"`, `"${p.tur || ''}"`, `"${(p as any).kesen || ''}"`, `"${(p as any).ilgili_kisi || ''}"`, `"${p.police_no || ''}"`,
          `"${p.acente || ''}"`, `"${p.kart || ''}"`, `"${(p.ek_bilgiler_iletisim || '').replace(/"/g, '""')}"`,
          `"${p.net_prim || ''}"`, `"${p.komisyon || ''}"`, `"${daysLeft}"`
        ].join(';');
      })
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `yenilemeler_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: Column[] = [
    { id: "ad_soyad", header: "AD SOYAD", minWidth: "150px", sortable: true },
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
    { id: "ek_bilgiler_iletisim", header: "EK BİLGİLER / İLETİŞİM", minWidth: "250px", sortable: true },
    { id: "net_prim", header: "NET PRİM", minWidth: "140px", sortable: true },
    { id: "komisyon", header: "KOMİSYON", minWidth: "140px", sortable: true },
    { id: "days_left", header: "KALAN GÜN", minWidth: "100px", sortable: false },
  ];

  const renderCell = (policy: Policy, colId: string) => {
      const daysLeft = Math.ceil((new Date(policy.tarih).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      switch(colId) {
          case 'brut_prim':
          case 'net_prim':
          case 'komisyon':
              return policy[colId] ? `₺${Number(policy[colId]).toLocaleString('tr-TR')}` : '-';
          case 'tarih':
          case 'dogum_tarihi':
              return policy[colId] ? format(new Date(policy[colId]), 'd.MM.yyyy') : '-';
          case 'days_left':
              return (
                <span className={`px-2 py-1 rounded text-xs font-bold ${daysLeft <= 3 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    {daysLeft} Gün
                </span>
              );
          case 'kart':
              return policy.kart ? (
                <a href={policy.kart} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-700">
                    <Eye size={18} />
                </a>
              ) : '-';
          default:
              return (policy as any)[colId] || '-';
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <Clock className="mr-2 text-amber-500" /> Yenilemeler
          </h1>
          <p className="text-gray-500 text-sm">Önümüzdeki 14 gün içinde süresi dolacak poliçeler</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button 
            onClick={downloadExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={18} />
            Excel İndir
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Plaka, TC, İsim ara..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select 
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-full sm:w-48"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Tüm Ürünler</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold whitespace-nowrap">
                {columns.map((col) => (
                    <th 
                        key={col.id} 
                        className={`
                            px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors
                            ${col.sortable ? 'cursor-pointer' : 'cursor-default'}
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
                <th className="px-4 py-3 text-right">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-8 text-center text-gray-500">Yükleniyor...</td>
                </tr>
              ) : sortedPolicies.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-8 text-center text-gray-500">Yenileme kaydı bulunamadı.</td>
                </tr>
              ) : (
                sortedPolicies.map((policy) => (
                  <tr 
                    key={policy.id} 
                    className="hover:bg-blue-50 cursor-pointer transition-colors group whitespace-nowrap"
                    onClick={() => navigate(`/employee/policies/${policy.id}`)}
                  >
                    {columns.map((col) => (
                        <td 
                            key={`${policy.id}-${col.id}`}
                            className="px-4 py-3"
                            onContextMenu={(e) => handleCellContextMenu(e, (policy as any)[col.id])}
                        >
                            {renderCell(policy, col.id as string)}
                        </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <button className="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors">
                        <ArrowRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
