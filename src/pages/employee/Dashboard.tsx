import { useEffect, useState } from 'react';
import { 
  Clock, 
  CheckCircle, 
  FileText, 
  ArrowRight, 
  TrendingUp, 
  Wallet, 
  Award, 
  BarChart2,
  MessageCircle,
  AlertTriangle,
  PlusCircle,
  FileCheck,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Teklif } from '@/types';
import { useNotification } from '@/context/NotificationContext';
import { formatDistanceToNow, startOfWeek, startOfMonth } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import StatusBadge from '@/components/StatusBadge';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  // State for new dashboard widgets
  const [stats, setStats] = useState({
      dailySales: 0,
      monthlySales: 0,
      dailyCommission: 0,
      monthlyCommission: 0,
      activeQuotes: 0,
      monthlyQuotes: 0,
      expiringSoon: 0,
      productStats: {} as Record<string, { quote: number, policy: number }>
  });

  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
      // 1. Calculate Stats
      const today = new Date().toISOString().split('T')[0];
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const next3Days = new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0];

      // Fetch Policies for Sales Stats
      // We must explicitly select columns to avoid potential RLS or large data issues
      // But for now, select * is fine if data is small. 
      // Important: Ensure date format is handled correctly.
      const { data: policies, error: policyError } = await supabase
        .from('policeler')
        .select('*')
        .eq('kesen_id', user?.id)
        .order('created_at', { ascending: false });

      if (policyError) {
          console.error('Error fetching policies:', policyError);
      }

      // Fetch Active Quotes (Pending)
      const { count: pendingQuotesCount } = await supabase
        .from('teklifler')
        .select('*', { count: 'exact', head: true })
        .eq('kesen_id', user?.id)
        .eq('durum', 'bekliyor');
        
      // Fetch This Month's Quotes
      const { count: monthlyQuotesCount } = await supabase
        .from('teklifler')
        .select('*', { count: 'exact', head: true })
        .eq('kesen_id', user?.id)
        .gte('created_at', firstDayOfMonth);

      // Fetch Product Counts
      const productCounts: Record<string, { quote: number, policy: number }> = {};
      
      // Count Policies
      // IMPORTANT: policies are already fetched above.
      policies?.forEach(p => {
          const type = p.tur || 'Diğer';
          if (!productCounts[type]) productCounts[type] = { quote: 0, policy: 0 };
          productCounts[type].policy++;
      });
      
      // Count Quotes (All Time)
      // We fetched 'allQuotes' below, but it was declared after 'productCounts' usage in previous code.
      // Let's fix the order or fetch it here.
      
      const { data: allQuotes, error: quotesError } = await supabase
          .from('teklifler')
          .select('tur')
          .eq('kesen_id', user?.id);
          
      if (quotesError) console.error('Error fetching all quotes:', quotesError);
          
      allQuotes?.forEach(q => {
          const type = q.tur || 'Diğer';
          if (!productCounts[type]) productCounts[type] = { quote: 0, policy: 0 };
          productCounts[type].quote++;
      });

      let daily = 0;
      let monthly = 0;
      let dailyComm = 0;
      let monthlyComm = 0;
      let expiring = 0;

      // Debug log to check policies data
      console.log('Policies fetched for stats:', policies);

      policies?.forEach(p => {
          // Use 'tarih' column which holds the issue date
          // If 'tarih' is null, fallback to 'created_at'
          const pDateRaw = p.tarih || p.created_at;
          const pDate = pDateRaw ? pDateRaw.split('T')[0] : '';
          
          // Debug date comparison
          // console.log(`Policy ${p.id}: Date=${pDate}, Today=${today}, Net=${p.net_prim}`);

          // Helper to parse currency
          const parseCurrency = (val: any) => {
              if (typeof val === 'number') return val;
              if (!val) return 0;
              if (typeof val === 'string') {
                   // Remove all dots (thousands)
                   // Replace comma with dot (decimal)
                   const normalized = val.replace(/\./g, '').replace(',', '.');
                   const parsed = parseFloat(normalized);
                   return isNaN(parsed) ? 0 : parsed;
              }
              return 0;
          };

          const pNet = parseCurrency(p.net_prim);
          const pComm = parseCurrency(p.komisyon);
          
          if (pDate === today) {
              daily += pNet;
              dailyComm += pComm;
          }
          
          const monthStart = firstDayOfMonth.split('T')[0];
          if (pDate >= monthStart) {
              monthly += pNet;
              monthlyComm += pComm;
          }
          
          if (p.bitis_tarihi && p.bitis_tarihi >= today && p.bitis_tarihi <= next3Days) expiring++;
      });

      setStats({
          dailySales: daily,
          monthlySales: monthly,
          dailyCommission: dailyComm,
          monthlyCommission: monthlyComm,
          activeQuotes: pendingQuotesCount || 0,
          monthlyQuotes: monthlyQuotesCount || 0,
          expiringSoon: expiring,
          productStats: productCounts
      });

      if (policies) {
          setRecentSales(policies.slice(0, 5));
      }
      
      setLoading(false);
  };

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Hoş Geldin, {user?.name} 👋</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 flex items-center justify-between">
              <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Günlük Satış</p>
                  <p className="text-xl font-bold text-blue-600">₺{stats.dailySales.toLocaleString('tr-TR')}</p>
                  <p className="text-[10px] text-green-600 font-semibold mt-1">
                      Komisyon: ₺{stats.dailyCommission.toLocaleString('tr-TR')}
                  </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-full text-blue-600"><TrendingUp size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 flex items-center justify-between">
              <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Aylık Satış</p>
                  <p className="text-xl font-bold text-purple-600">₺{stats.monthlySales.toLocaleString('tr-TR')}</p>
                  <p className="text-[10px] text-green-600 font-semibold mt-1">
                      Komisyon: ₺{stats.monthlyCommission.toLocaleString('tr-TR')}
                  </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-full text-purple-600"><CreditCard size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-amber-100 flex items-center justify-between">
              <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Teklifler</p>
                  <div className="flex gap-2 items-baseline">
                      <span className="text-xl font-bold text-amber-600">{stats.activeQuotes}</span>
                      <span className="text-xs text-gray-400">Bekleyen</span>
                  </div>
                  <div className="flex gap-2 items-baseline">
                      <span className="text-sm font-bold text-gray-600">{stats.monthlyQuotes}</span>
                      <span className="text-[10px] text-gray-400">Bu Ay</span>
                  </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-full text-amber-600"><FileText size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100 flex items-center justify-between">
              <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Yaklaşan Yenileme</p>
                  <p className="text-xl font-bold text-red-600">{stats.expiringSoon}</p>
                  <span className="text-[10px] text-gray-400">Önümüzdeki 3 gün</span>
              </div>
              <div className="p-3 bg-red-50 rounded-full text-red-600"><Clock size={20} /></div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Actions & Recent Sales */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Hızlı İşlemler</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button onClick={() => navigate('/employee/quotes/new')} className="p-4 bg-blue-50 hover:bg-blue-100 rounded-xl flex flex-col items-center gap-2 transition-colors">
                        <PlusCircle className="text-blue-600" />
                        <span className="text-sm font-bold text-blue-700">Yeni Teklif</span>
                    </button>
                    <button onClick={() => navigate('/employee/policies')} className="p-4 bg-green-50 hover:bg-green-100 rounded-xl flex flex-col items-center gap-2 transition-colors">
                        <FileCheck className="text-green-600" />
                        <span className="text-sm font-bold text-green-700">Poliçelerim</span>
                    </button>
                    <button onClick={() => navigate('/employee/messages')} className="p-4 bg-indigo-50 hover:bg-indigo-100 rounded-xl flex flex-col items-center gap-2 transition-colors">
                        <MessageCircle className="text-indigo-600" />
                        <span className="text-sm font-bold text-indigo-700">Mesajlar</span>
                    </button>
                    <button onClick={() => navigate('/employee/renewals')} className="p-4 bg-amber-50 hover:bg-amber-100 rounded-xl flex flex-col items-center gap-2 transition-colors">
                        <RefreshCw className="text-amber-600" />
                        <span className="text-sm font-bold text-amber-700">Yenilemeler</span>
                    </button>
                </div>
            </div>

            {/* Recent Sales Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Son Satışlarım</h2>
                    <button onClick={() => navigate('/employee/policies')} className="text-sm text-blue-600 hover:underline">Tümünü Gör</button>
                </div>
                <div className="divide-y divide-gray-100">
                    {recentSales.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-sm">Henüz satış kaydı yok.</div>
                    ) : (
                        recentSales.map(policy => (
                             <div key={policy.id} className="p-4 hover:bg-gray-50 flex justify-between items-center cursor-pointer" onClick={() => navigate(`/employee/policies/${policy.id}`)}>
                                 <div className="flex items-center space-x-4">
                                     <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">
                                         {policy.plaka?.substring(0,2) || '🚗'}
                                     </div>
                                     <div>
                                         <p className="font-bold text-gray-800">{policy.plaka}</p>
                                         <p className="text-xs text-gray-500">{policy.ad_soyad} • {policy.sirket}</p>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <p className="font-bold text-gray-800">₺{policy.net_prim}</p>
                                     <p className="text-xs text-gray-400">{new Date(policy.created_at).toLocaleDateString('tr-TR')}</p>
                                 </div>
                             </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* Right Column: Notifications / Expiring Summary */}
        <div className="space-y-6">
             {/* Ürün Bazlı İstatistikler (Hedef Durumu Yerine) */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                 <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                     <BarChart2 size={20} className="mr-2 text-blue-600"/> 
                     Ürün Bazlı İşlemler
                 </h3>
                 <div className="space-y-4">
                    {Object.entries(stats.productStats).length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">Henüz işlem kaydı yok.</p>
                    ) : (
                        Object.entries(stats.productStats).map(([product, counts]) => (
                            <div key={product} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                                    <span className="text-sm font-medium text-gray-700">{product}</span>
                                </div>
                                <div className="flex gap-3 text-xs">
                                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-100">
                                        {counts.quote} Teklif
                                    </span>
                                    <span className="px-2 py-1 bg-green-50 text-green-700 rounded-md border border-green-100">
                                        {counts.policy} Poliçe
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                 </div>
             </div>
             
             {/* Mini Renewal List */}
             <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                 <h3 className="font-bold text-gray-800 mb-3 flex items-center"><AlertTriangle size={16} className="mr-2 text-red-500"/> Acil Yenilemeler (3 Gün)</h3>
                 <div className="space-y-2">
                     {stats.expiringSoon === 0 ? (
                         <p className="text-xs text-gray-500 text-center py-4">Yaklaşan yenileme yok.</p>
                     ) : (
                         <div className="p-3 bg-red-50 rounded-lg border border-red-100 text-center">
                             <p className="text-red-700 font-bold">{stats.expiringSoon} Adet Poliçe</p>
                             <p className="text-xs text-red-500">Süresi dolmak üzere!</p>
                         </div>
                     )}
                     <button onClick={() => navigate('/employee/renewals')} className="w-full text-center text-xs text-blue-500 hover:text-blue-700 mt-2 font-medium">Tüm Listeyi Gör</button>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
}
