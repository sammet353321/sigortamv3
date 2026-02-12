import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Search, Filter, RefreshCw, FileText, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ExpiredPolicies() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchExpiredPolicies();
  }, [user]);

  const fetchExpiredPolicies = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch directly from 'policeler' where end date is in the past
      const today = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('policeler')
        .select('*')
        .eq('employee_id', user.id)
        .lt('bitis_tarihi', today) // Expired
        //.neq('durum', 'Yenilendi') // Optional: Exclude already renewed if status is tracked
        .order('bitis_tarihi', { ascending: false });

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error('Error fetching expired policies:', error);
      toast.error('Geçen poliçeler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPolicies = policies.filter(policy => 
    policy.musteri_adi?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.plaka?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    policy.police_no?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <AlertCircle className="text-red-500" />
            Geçen Poliçeler (Yenilenmeyen)
          </h1>
          <p className="text-gray-500 mt-1">Süresi dolmuş ve henüz yenilenmemiş poliçelerin listesi.</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Müşteri, Plaka, Poliçe No..." 
              className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchExpiredPolicies} 
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            title="Listeyi Yenile"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-bold">Müşteri</th>
                <th className="px-6 py-4 font-bold">Plaka / Belge</th>
                <th className="px-6 py-4 font-bold">Ürün / Şirket</th>
                <th className="px-6 py-4 font-bold">Bitiş Tarihi</th>
                <th className="px-6 py-4 font-bold">Prim</th>
                <th className="px-6 py-4 font-bold text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Geçen poliçe bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredPolicies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {policy.musteri_adi || policy.ad_soyad}
                      <div className="text-xs text-gray-400 mt-0.5">{policy.tc_vkn}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-bold">
                        {policy.plaka}
                      </span>
                      <div className="text-xs text-gray-400 mt-1">{policy.belge_no}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="font-medium text-gray-800">{policy.urun_adi}</div>
                      <div className="text-xs text-gray-500">{policy.sirket_adi || policy.sirket}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-red-600 font-bold">
                        <CalendarX size={16} />
                        {format(new Date(policy.bitis_tarihi), 'dd.MM.yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {policy.net_prim?.toLocaleString('tr-TR')} ₺
                    </td>
                    <td className="px-6 py-4 text-right">
                       <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                         Süresi Doldu
                       </span>
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
