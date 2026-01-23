import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Teklif } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Search, FileText, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AdminQuotesPage() {
    const [quotes, setQuotes] = useState<Teklif[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyThisMonth, setOnlyThisMonth] = useState(true);

    useEffect(() => {
        fetchQuotes();
    }, []);

    async function fetchQuotes() {
        try {
            // AbortController can be added if needed, but simple fetch is usually fine for this page
            const { data, error } = await supabase
                .from('teklifler')
                .select('*, ilgili_kisi:users!ilgili_kisi_id(name), kesen:users!kesen_id(name)')
                .order('tarih', { ascending: false });

            if (error) {
                 // Ignore network abort errors which might happen on rapid navigation
                if (error.code !== '20' && error.message !== 'FetchError: The user aborted a request.') {
                    throw error;
                }
                return;
            }
            setQuotes(data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    const filteredQuotes = quotes.filter(q => {
        const monthStart = startOfMonth(new Date());
        const matchesSearch = 
            (q.plaka && q.plaka.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (q.police_no && q.police_no.toLowerCase().includes(searchTerm.toLowerCase()));
        const endDate = (q as any).bitis_tarihi ? new Date((q as any).bitis_tarihi) : (q.tanzim_tarihi ? new Date(q.tanzim_tarihi) : new Date(q.tarih));
        const matchesMonth = !onlyThisMonth || (endDate && endDate >= monthStart);
        return matchesSearch && matchesMonth;
    });

    const exportToExcel = () => {
        const dataToExport = filteredQuotes.map(q => ({
            'AD SOYAD': q.ad_soyad || '-',
            'DOĞUM TARİHİ': q.dogum_tarihi ? format(new Date(q.dogum_tarihi), 'dd.MM.yyyy') : '-',
            'TARİH': format(new Date(q.tarih), 'dd.MM.yyyy HH:mm'),
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
            'DURUM': q.durum === 'bekliyor' ? 'Bekliyor' : 
                     q.durum === 'tamamlandi' ? 'Tamamlandı' : 
                     q.durum === 'iptal' ? 'İptal' : 
                     q.durum === 'policelesti' ? 'Poliçeleşti' : q.durum
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Teklifler");
        XLSX.writeFile(wb, `Tum_Teklifler_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Tüm Teklifler</h1>
                <div className="flex gap-2">
                    <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        <Download size={16} />
                        Excel İndir
                    </button>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Plaka veya Poliçe No Ara..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64"
                        />
                    </div>
                    <button
                        onClick={() => setOnlyThisMonth(v => !v)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                        {onlyThisMonth ? 'Bu Ay' : 'Tümü'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <div className="overflow-x-auto w-full">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 font-medium">
                        <tr>
                            <th className="px-6 py-3">Plaka</th>
                            <th className="px-6 py-3">Müşteri</th>
                            <th className="px-6 py-3">Tali Acente</th>
                            <th className="px-6 py-3">Kesen</th>
                            <th className="px-6 py-3">Tarih</th>
                            <th className="px-6 py-3">Poliçe No</th>
                            <th className="px-6 py-3">Brüt Prim</th>
                            <th className="px-6 py-3">Net Prim</th>
                            <th className="px-6 py-3">Komisyon</th>
                            <th className="px-6 py-3">Durum</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredQuotes.map((quote) => (
                            <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-medium sticky left-0 bg-white">{quote.plaka}</td>
                                <td className="px-6 py-4">{quote.ad_soyad || '-'}</td>
                                <td className="px-6 py-4">{quote.ilgili_kisi?.name || '-'}</td>
                                <td className="px-6 py-4">{quote.kesen_id ? (quote as any).kesen?.name : '-'}</td>
                                <td className="px-6 py-4 text-gray-500">
                                    {format(new Date(quote.tarih), 'd MMM yyyy', { locale: tr })}
                                </td>
                                <td className="px-6 py-4">{quote.police_no || '-'}</td>
                                <td className="px-6 py-4">{quote.brut_prim || '-'}</td>
                                <td className="px-6 py-4">{quote.net_prim || '-'}</td>
                                <td className="px-6 py-4">{quote.komisyon || '-'}</td>
                                <td className="px-6 py-4"><StatusBadge status={quote.durum} /></td>
                            </tr>
                        ))}
                        {filteredQuotes.length === 0 && (
                            <tr><td colSpan={10} className="text-center py-8 text-gray-500">Kayıt bulunamadı.</td></tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
}
