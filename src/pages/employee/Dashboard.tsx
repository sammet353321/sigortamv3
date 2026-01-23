import { useEffect, useState } from 'react';
import { 
  Clock, 
  FileText, 
  TrendingUp, 
  CreditCard,
  PlusCircle,
  FileCheck,
  MessageCircle,
  RefreshCw,
  BarChart2,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { startOfWeek, startOfMonth, startOfYear, format } from 'date-fns';

// Minimal optimized dashboard that reads from stats table
export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState({
      today: { quotes: 0, policies: 0, premium: 0, commission: 0 },
      month: { quotes: 0, policies: 0, premium: 0, commission: 0 },
      year: { quotes: 0, policies: 0, premium: 0, commission: 0 },
      pendingQuotes: 0,
      expiringPolicies: 0
  });

  useEffect(() => {
    if (user) fetchStats();
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
    const yearStart = startOfYear(new Date()).toISOString().split('T')[0];

    // 1. Fetch Aggregated Stats (Fast)
    // We fetch all records for this year to aggregate locally for month/year totals
    // Since it's one row per day, 365 rows is tiny payload (few KB)
    const { data: dailyStats, error } = await supabase
        .from('employee_stats_daily')
        .select('*')
        .eq('employee_id', user.id)
        .gte('date', yearStart);

    if (error) console.error('Stats fetch error:', error);

    const newStats = {
        today: { quotes: 0, policies: 0, premium: 0, commission: 0 },
        month: { quotes: 0, policies: 0, premium: 0, commission: 0 },
        year: { quotes: 0, policies: 0, premium: 0, commission: 0 },
        pendingQuotes: 0,
        expiringPolicies: 0
    };

    // Aggregate in memory (very fast for < 365 items)
    dailyStats?.forEach(day => {
        // Year totals
        newStats.year.quotes += day.quotes_count || 0;
        newStats.year.policies += day.policies_count || 0;
        newStats.year.premium += day.total_premium || 0;
        newStats.year.commission += day.total_commission || 0;

        // Month totals
        if (day.date >= monthStart) {
            newStats.month.quotes += day.quotes_count || 0;
            newStats.month.policies += day.policies_count || 0;
            newStats.month.premium += day.total_premium || 0;
            newStats.month.commission += day.total_commission || 0;
        }

        // Today totals
        if (day.date === today) {
            newStats.today.quotes += day.quotes_count || 0;
            newStats.today.policies += day.policies_count || 0;
            newStats.today.premium += day.total_premium || 0;
            newStats.today.commission += day.total_commission || 0;
        }
    });

    // 2. Fetch Pending Quotes Count (Live) - Still need live count for "Status"
    // This is indexed and fast
    const { count: pendingCount } = await supabase
        .from('teklifler')
        .select('id', { count: 'exact', head: true })
        .eq('kesen_id', user.id)
        .eq('durum', 'bekliyor');
    
    newStats.pendingQuotes = pendingCount || 0;

    setStats(newStats);
    setLoading(false);
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);

  if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Hoş Geldin, {user?.name} 👋</h1>
        <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
             Bugün: {new Date().toLocaleDateString('tr-TR')}
        </div>
      </div>
      
      {/* 1. Key Metrics Cards (Today & Month) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Daily Sales */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={48} className="text-blue-600" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Günlük Üretim</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(stats.today.premium)}</p>
              <div className="mt-2 flex items-center text-xs text-green-600 font-medium">
                  <span className="bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                    +{formatCurrency(stats.today.commission)} Kom.
                  </span>
              </div>
          </div>

          {/* Monthly Sales */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-purple-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <CreditCard size={48} className="text-purple-600" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Aylık Üretim</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(stats.month.premium)}</p>
              <div className="mt-2 flex items-center text-xs text-purple-600 font-medium">
                  <span>{stats.month.policies} Adet Poliçe</span>
              </div>
          </div>

          {/* Active Quotes */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText size={48} className="text-amber-600" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Bekleyen Teklif</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingQuotes}</p>
              <div className="mt-2 flex items-center text-xs text-gray-400 font-medium">
                  <span>Bugün {stats.today.quotes} yeni teklif</span>
              </div>
          </div>

          {/* Year Total */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <BarChart2 size={48} className="text-gray-600" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Yıllık Toplam</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{formatCurrency(stats.year.premium)}</p>
              <div className="mt-2 flex items-center text-xs text-gray-400 font-medium">
                  <span>{stats.year.policies} Poliçe</span>
              </div>
          </div>
      </div>

      {/* 2. Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => navigate('/employee/quotes/new')} className="p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl flex flex-col items-center gap-2 transition-all shadow-sm group">
            <PlusCircle className="text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Yeni Teklif</span>
        </button>
        <button onClick={() => navigate('/employee/policies')} className="p-4 bg-white border border-gray-200 hover:border-green-300 hover:bg-green-50 rounded-xl flex flex-col items-center gap-2 transition-all shadow-sm group">
            <FileCheck className="text-green-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-green-700">Poliçelerim</span>
        </button>
        <button onClick={() => navigate('/employee/messages')} className="p-4 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl flex flex-col items-center gap-2 transition-all shadow-sm group">
            <MessageCircle className="text-indigo-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-indigo-700">Mesajlar</span>
        </button>
        <button onClick={() => navigate('/employee/renewals')} className="p-4 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 rounded-xl flex flex-col items-center gap-2 transition-all shadow-sm group">
            <RefreshCw className="text-amber-500 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-amber-700">Yenilemeler</span>
        </button>
      </div>

    </div>
  );
}
