import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FileText, Clock, AlertCircle, Plus, Calendar, TrendingUp, Users, DollarSign, Wallet, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalQuotes: 0,
    activePolicies: 0,
    expiringPolicies: 0,
    totalCommission: 0,
    monthlyCommission: 0,
    totalPremium: 0
  });
  
  // Date Filter State
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
    label: 'Bu Ay'
  });

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadStats = async () => {
      if (!user) return;
      
      try {
        await fetchStats(isMounted);
      } catch (err) {
        if (isMounted) console.error(err);
      }
    };

    loadStats();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [user, dateRange]);

  const fetchStats = async (isMounted: boolean) => {
    if (!user) return;

    try {
      const startStr = dateRange.from.toISOString();
      const endStr = dateRange.to.toISOString();

      // 1. Quotes (Teklifler) in range
      let quotesQuery = supabase
        .from('teklifler')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', user.id); 

      // Apply date filter ONLY if dates are valid
      if (startStr && endStr) {
          quotesQuery = quotesQuery
            .gte('tarih', startStr)
            .lte('tarih', endStr);
      }
      
      const { count: quotesCount, error: quotesError } = await quotesQuery;
      
      if (!isMounted) return;

      if (quotesError) {
          if (quotesError.message !== 'FetchError: The user aborted a request.') {
              console.error('Error fetching quotes stats:', quotesError);
          }
      }

      const adjustedEndStr = new Date(dateRange.to.setHours(23, 59, 59, 999)).toISOString();

      // Re-query with adjusted time
      let quotesFinalQuery = supabase
        .from('teklifler')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', user.id);
        
      if (startStr && adjustedEndStr) {
          quotesFinalQuery = quotesFinalQuery
            .gte('tarih', startStr)
            .lte('tarih', adjustedEndStr);
      }

      const { count: quotesCountFinal, error: quotesFinalError } = await quotesFinalQuery;
      
      if (!isMounted) return;

      if (quotesFinalError) {
           if (quotesFinalError.message !== 'FetchError: The user aborted a request.') {
               console.error('Error fetching quotes stats final:', quotesFinalError);
           }
      }

      // 2. Active Policies (Poliçeler) - Sales in range
      let policiesQuery = supabase
        .from('policeler')
        .select('net_prim, komisyon')
        .eq('employee_id', user.id);

      if (startStr && adjustedEndStr) {
          policiesQuery = policiesQuery
            .gte('tarih', startStr)
            .lte('tarih', adjustedEndStr);
      }

      const { data: policiesData, error: policiesError } = await policiesQuery;
      
      if (!isMounted) return;

      if (policiesError) {
           if (policiesError.message !== 'FetchError: The user aborted a request.') {
               console.error('Error fetching policies stats:', policiesError);
           }
      }

      const totalPrem = policiesData?.reduce((acc, curr) => acc + (curr.net_prim || 0), 0) || 0;
      const totalComm = policiesData?.reduce((acc, curr) => acc + (curr.komisyon || 0), 0) || 0;

      // 3. Expiring Soon (Always 14 days from now, unrelated to filter)
      const { count: expiringCount, error: expiringError } = await supabase
        .from('policeler')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', user.id)
        .gte('tarih', new Date().toISOString())
        .lte('tarih', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
        
      if (!isMounted) return;

      if (expiringError) {
           console.error('Error fetching expiring stats:', expiringError);
      }

      setStats({
        totalQuotes: quotesCountFinal || 0,
        activePolicies: policiesData?.length || 0,
        expiringPolicies: expiringCount || 0,
        totalCommission: totalComm,
        monthlyCommission: 0, 
        totalPremium: totalPrem
      });

    } catch (error) {
      if (isMounted) console.error('Error fetching dashboard stats:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hoş Geldin, {user?.name} 👋</h1>
          <p className="text-gray-500 text-sm">İşte performans özetin ve güncel durumun.</p>
        </div>
        
        <div className="flex items-center gap-2">
             <DateRangePicker 
                dateRange={dateRange}
                onChange={setDateRange}
             />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Quotes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Verilen Teklif</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-2">{stats.totalQuotes}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <FileText size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-400">
             <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium mr-2">Seçili Dönem</span>
          </div>
        </div>

        {/* Policies (Sales) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Kesilen Poliçe</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-2">{stats.activePolicies}</h3>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-green-600">
              <Users size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-400">
             <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium mr-2">Seçili Dönem</span>
          </div>
        </div>

        {/* Total Premium */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Toplam Prim</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-2">
                ₺{stats.totalPremium.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <Wallet size={24} />
            </div>
          </div>
           <div className="mt-4 flex items-center text-xs text-gray-400">
             <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium mr-2">Net Prim</span>
          </div>
        </div>
        
         {/* Commission (Earnings) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm font-medium">Kazanç (Komisyon)</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-2">
                 ₺{stats.totalCommission.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
              <DollarSign size={24} />
            </div>
          </div>
           <div className="mt-4 flex items-center text-xs text-gray-400">
             <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium mr-2">Tahmini</span>
          </div>
        </div>
      </div>
      
      {/* Action Banner & Expiring Soon */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between relative overflow-hidden">
             <div className="relative z-10">
                 <h2 className="text-xl font-bold mb-2">Teklifler Sayfası</h2>
                 <p className="text-blue-100 mb-6 max-w-md">Tekliflerinizi görüntülemek ve yönetmek için tıklayın.</p>
                 <Link 
                    to="/employee/quotes" 
                    className="bg-white text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
                 >
                    <FileText size={20} />
                    Teklifler
                 </Link>
             </div>
             <div className="hidden md:block relative z-10 opacity-90">
                <FileText size={100} className="text-white/20" />
             </div>
              {/* Abstract Circles */}
             <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
             <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-blue-400/20 rounded-full blur-2xl"></div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Yaklaşan Yenilemeler</h3>
                  <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">{stats.expiringPolicies}</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">Önümüzdeki 14 gün içinde süresi dolacak poliçeler.</p>
              
              <Link to="/employee/renewals" className="block w-full">
                <div className="flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors group">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="text-red-500" size={20} />
                        <span className="font-medium text-red-700">Yenilemeleri Gör</span>
                    </div>
                    <ArrowRight size={18} className="text-red-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
          </div>
      </div>
    </div>
  );
}
