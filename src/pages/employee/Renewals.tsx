import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { format, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Search, Filter, ArrowRight, Clock, Download, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';

export default function RenewalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [uniqueTypes, setUniqueTypes] = useState<string[]>([]);

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
        .select('*, kesen:users!kesen_id(name), ilgili_kisi:users!ilgili_kisi_id(name)')
        .gte('bitis_tarihi', today.toISOString().split('T')[0])
        .lte('bitis_tarihi', next14Days.toISOString().split('T')[0])
        .order('bitis_tarihi', { ascending: true });

      if (error) throw error;
      setPolicies(data || []);
      
      // Extract unique types for filter
      const types = Array.from(new Set(data?.map(p => p.urun).filter(Boolean) as string[]));
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

    const matchesType = filterType === 'all' || policy.urun === filterType;

    return matchesSearch && matchesType;
  });

  const downloadExcel = () => {
    if (!filteredPolicies.length) return;
    const headers = ['AD SOYAD', 'DOĞUM TARİHİ', 'ŞİRKET', 'TARİH', 'ŞASİ', 'PLAKA', 'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'BRÜT PRİM', 'TÜR', 'KESEN', 'İLGİLİ KİŞİ', 'POLİÇE NO', 'ACENTE', 'KART', 'EK BİLGİLER', 'NET PRİM', 'KOMİSYON', 'BİTİŞ TARİHİ', 'KALAN GÜN'];
    
    const csvContent = [
      headers.join(';'),
      ...filteredPolicies.map(p => {
        const daysLeft = Math.ceil((new Date(p.bitis_tarihi).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const date = p.dogum_tarihi ? format(new Date(p.dogum_tarihi), 'dd.MM.yyyy') : '';
        const createdDate = format(new Date(p.tarih), 'dd.MM.yyyy');
        const endDate = format(new Date(p.bitis_tarihi), 'dd.MM.yyyy');
        
        return [
          `"${p.ad_soyad || ''}"`, `"${date}"`, `"${p.sirket || ''}"`, `"${createdDate}"`, `"${p.sasi_no || ''}"`,
          `"${p.plaka || ''}"`, `"${p.tc_vkn || ''}"`, `"${p.belge_no || ''}"`, `"${p.arac_cinsi || ''}"`,
          `"${p.brut_prim || ''}"`, `"${p.urun || ''}"`, `"${(p as any).kesen?.name || ''}"`, `"${(p as any).ilgili_kisi?.name || ''}"`, `"${p.police_no || ''}"`,
          `"${p.acente || ''}"`, `"${p.kart_bilgisi || ''}"`, `"${(p.ek_bilgiler || '').replace(/"/g, '""')}"`,
          `"${p.net_prim || ''}"`, `"${p.komisyon || ''}"`, `"${endDate}"`, `"${daysLeft}"`
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
                <th className="px-4 py-3">BİTİŞ TARİHİ</th>
                <th className="px-4 py-3">KALAN GÜN</th>
                <th className="px-4 py-3">AD SOYAD</th>
                <th className="px-4 py-3">DOĞUM TARİHİ</th>
                <th className="px-4 py-3">ŞİRKET</th>
                <th className="px-4 py-3">TARİH</th>
                <th className="px-4 py-3">ŞASİ</th>
                <th className="px-4 py-3">PLAKA</th>
                <th className="px-4 py-3">TC / VKN</th>
                <th className="px-4 py-3">BELGE NO</th>
                <th className="px-4 py-3">ARAÇ CİNSİ</th>
                <th className="px-4 py-3">BRÜT PRİM</th>
                <th className="px-4 py-3">TÜR</th>
                <th className="px-4 py-3">KESEN</th>
                <th className="px-4 py-3">İLGİLİ KİŞİ (TALİ)</th>
                <th className="px-4 py-3">POLİÇE NO</th>
                <th className="px-4 py-3">ACENTE</th>
                <th className="px-4 py-3 text-center">KART</th>
                <th className="px-4 py-3">EK BİLGİLER</th>
                <th className="px-4 py-3">NET PRİM</th>
                <th className="px-4 py-3">KOMİSYON</th>
                <th className="px-4 py-3 text-right">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={22} className="px-6 py-8 text-center text-gray-500">Yükleniyor...</td>
                </tr>
              ) : filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={22} className="px-6 py-8 text-center text-gray-500">Yenileme kaydı bulunamadı.</td>
                </tr>
              ) : (
                filteredPolicies.map((policy) => {
                    const daysLeft = Math.ceil((new Date(policy.bitis_tarihi).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr 
                        key={policy.id} 
                        className="hover:bg-blue-50 cursor-pointer transition-colors group whitespace-nowrap"
                        onClick={() => navigate(`/employee/policies/${policy.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                            {format(new Date(policy.bitis_tarihi), 'd.MM.yyyy')}
                        </td>
                        <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${daysLeft <= 3 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                {daysLeft} Gün
                            </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">{policy.ad_soyad || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{policy.dogum_tarihi ? format(new Date(policy.dogum_tarihi), 'd.MM.yyyy') : '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{policy.sirket || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{format(new Date(policy.tarih), 'd.MM.yyyy')}</td>
                        <td className="px-4 py-3 font-mono text-xs">{policy.sasi_no || '-'}</td>
                        <td className="px-4 py-3 font-bold">{policy.plaka || '-'}</td>
                        <td className="px-4 py-3 font-mono">{policy.tc_vkn || '-'}</td>
                        <td className="px-4 py-3 font-mono">{policy.belge_no || '-'}</td>
                        <td className="px-4 py-3">{policy.arac_cinsi || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{policy.brut_prim ? `₺${Number(policy.brut_prim).toLocaleString('tr-TR')}` : '-'}</td>
                        <td className="px-4 py-3">{policy.urun || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{(policy as any).kesen?.name || '-'}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">
                            {policy.tali || (policy as any).ilgili_kisi?.name || 'Bilinmiyor'}
                        </td>
                        <td className="px-4 py-3 font-mono text-blue-600">{policy.police_no || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{policy.acente || '-'}</td>
                        <td className="px-4 py-3 text-center">
                            {policy.kart_bilgisi ? (
                                <Eye size={18} className="text-blue-500" />
                            ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{policy.ek_bilgiler || '-'}</td>
                        <td className="px-4 py-3 font-bold text-gray-700">₺{Number(policy.net_prim || 0).toLocaleString('tr-TR')}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">{policy.komisyon ? `₺${Number(policy.komisyon).toLocaleString('tr-TR')}` : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            className="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors"
                          >
                            <ArrowRight size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
