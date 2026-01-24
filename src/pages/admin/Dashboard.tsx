import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileText, Users, DollarSign, Activity, BarChart2, PieChart, Clock, ShieldCheck, 
  ArrowUpRight, ArrowDownRight, Briefcase, Calendar, CheckCircle, XCircle, TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, LineChart, Line
} from 'recharts';

// --- SUB-COMPONENTS ---

const StatBox = ({ label, value, subValue, icon: Icon, colorClass, bgClass }: any) => (
  <div className={`p-4 rounded-xl border border-gray-100 bg-white hover:shadow-md transition-shadow flex items-start justify-between group`}>
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <h4 className="text-xl font-bold text-gray-900">{value}</h4>
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
    <div className={`p-2 rounded-lg ${bgClass} ${colorClass} group-hover:scale-110 transition-transform`}>
      <Icon size={18} />
    </div>
  </div>
);

const PeriodSection = ({ title, data, icon: Icon }: any) => {
  if (!data) return null;
  
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Icon size={20} className="text-gray-500" />
        <h3 className="font-bold text-gray-800">{title}</h3>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Quote Count */}
        <StatBox 
          label="Teklif Sayısı" 
          value={data.quote_count} 
          icon={Users} 
          colorClass="text-blue-600" 
          bgClass="bg-blue-50" 
        />
        
        {/* Policy Count */}
        <StatBox 
          label="Toplam Poliçe" 
          value={data.policy_count} 
          icon={FileText} 
          colorClass="text-indigo-600" 
          bgClass="bg-indigo-50" 
        />
        
        {/* Net Premium & Commission */}
        <StatBox 
          label="Net Prim" 
          value={formatCurrency(data.net_premium)} 
          subValue={`+${formatCurrency(data.commission)} Komisyon`}
          icon={DollarSign} 
          colorClass="text-green-600" 
          bgClass="bg-green-50" 
        />
        
        {/* Active Policies */}
        <StatBox 
          label="Aktif Poliçe" 
          value={data.active_count} 
          icon={CheckCircle} 
          colorClass="text-emerald-600" 
          bgClass="bg-emerald-50" 
        />
        
        {/* Cancelled Policies */}
        <StatBox 
          label="İptal Edilen" 
          value={data.cancelled_count} 
          icon={XCircle} 
          colorClass="text-red-600" 
          bgClass="bg-red-50" 
        />
      </div>
    </div>
  );
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentYear = new Date().getFullYear();

  // Generate Year Options (Current Year and 3 years back)
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  useEffect(() => {
    fetchDashboardData(selectedYear);
    
    // Subscribe to realtime changes only if viewing current year
    let channel: any;
    
    if (selectedYear === currentYear) {
        channel = supabase.channel('dashboard-v3-live')
          .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'dashboard_stats', 
            filter: `type=eq.admin` // We will filter by period_date in fetch logic mostly
          }, 
            (payload) => {
                 // Check if the update is for the current year snapshot
                 const updatedData = payload.new;
                 if (updatedData && updatedData.period === 'year_snapshot' && new Date(updatedData.period_date).getFullYear() === selectedYear) {
                     setStats(updatedData.data);
                 }
            }
          )
          .subscribe();
    }

    return () => { 
        if (channel) supabase.removeChannel(channel); 
    };
  }, [selectedYear]);

  async function fetchDashboardData(year: number) {
    try {
      setLoading(true);
      const yearStartDate = `${year}-01-01`;
      
      const { data, error } = await supabase
        .from('dashboard_stats')
        .select('data')
        .eq('type', 'admin')
        .eq('period', 'year_snapshot')
        .eq('period_date', yearStartDate)
        .single();
      
      if (error && error.code === 'PGRST116') {
         // If data missing for this year, trigger calculation
         await supabase.rpc('refresh_admin_stats', { target_year: year });
         
         const retry = await supabase
            .from('dashboard_stats')
            .select('data')
            .eq('type', 'admin')
            .eq('period', 'year_snapshot')
            .eq('period_date', yearStartDate)
            .single();
            
         if (retry.data) setStats(retry.data.data);
         else setStats(null); // Should not happen
      } else if (data) {
        setStats(data.data);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);

  if (loading || !stats) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="text-gray-500 font-medium">Analizler Hazırlanıyor...</p>
    </div>
  );

  const totalCompanyPremium = stats.company_distribution.reduce((acc: number, curr: any) => acc + curr.value, 0);
  const totalProductPremium = stats.product_distribution?.reduce((acc: number, curr: any) => acc + curr.value, 0) || 0;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      
      {/* Header (Localized Date) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Yönetici Paneli</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <Calendar size={14} />
            {format(new Date(), 'dd MMMM yyyy, EEEE', { locale: tr })}
            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
            {selectedYear === currentYear ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Canlı Veri
                </span>
            ) : (
                <span className="text-gray-500 font-medium flex items-center gap-1">
                    <Clock size={14} />
                    Arşiv Modu ({selectedYear})
                </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
           {/* Year Selector */}
           <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                {years.map(year => (
                    <button
                        key={year}
                        onClick={() => setSelectedYear(year)}
                        className={`
                            px-3 py-1.5 text-sm font-medium rounded-md transition-all
                            ${selectedYear === year 
                                ? 'bg-blue-600 text-white shadow-sm' 
                                : 'text-gray-600 hover:bg-gray-50'}
                        `}
                    >
                        {year}
                    </button>
                ))}
           </div>
           
           <div className="text-right hidden md:block border-l pl-4 ml-2 border-gray-200">
              <p className="text-xs text-gray-400 uppercase font-semibold">Son Güncelleme</p>
              <p className="text-sm font-mono text-gray-700">{stats.last_updated ? format(new Date(stats.last_updated), 'HH:mm:ss') : '-'}</p>
           </div>
        </div>
      </div>

      {/* 1. Daily Stats Panel */}
      <PeriodSection 
        title="GÜNLÜK RAPOR" 
        data={stats.daily} 
        icon={Activity} 
      />

      {/* 2. Monthly Stats Panel */}
      <PeriodSection 
        title="AYLIK RAPOR" 
        data={stats.monthly} 
        icon={Calendar} 
      />

      {/* 3. Yearly Stats Panel */}
      <PeriodSection 
        title="YILLIK RAPOR" 
        data={stats.yearly} 
        icon={TrendingUp} 
      />

      {/* 4. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Row 1: Trend Chart (2 cols) + Company Dist (1 col) */}
        
        {/* Trend Chart (Localized) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">Yıllık Performans Analizi</h3>
              <p className="text-sm text-gray-400">Son 12 ay prim üretimi ve poliçe adetleri</p>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthly_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPremium" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#9ca3af', fontSize: 12}} 
                    dy={10} 
                    tickFormatter={(val) => {
                        const enToTr: any = { 'Jan': 'Oca', 'Feb': 'Şub', 'Mar': 'Mar', 'Apr': 'Nis', 'May': 'May', 'Jun': 'Haz', 'Jul': 'Tem', 'Aug': 'Ağu', 'Sep': 'Eyl', 'Oct': 'Eki', 'Nov': 'Kas', 'Dec': 'Ara' };
                        return enToTr[val] || val;
                    }}
                />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} tickFormatter={(val) => `${val/1000}K`} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#d1d5db', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(val: any, name: any) => [
                    name === 'amount' ? formatCurrency(val) : val, 
                    name === 'amount' ? 'Üretim' : 'Adet'
                  ]}
                  labelFormatter={(label) => {
                      const enToTr: any = { 'Jan': 'Ocak', 'Feb': 'Şubat', 'Mar': 'Mart', 'Apr': 'Nisan', 'May': 'Mayıs', 'Jun': 'Haziran', 'Jul': 'Temmuz', 'Aug': 'Ağustos', 'Sep': 'Eylül', 'Oct': 'Ekim', 'Nov': 'Kasım', 'Dec': 'Aralık' };
                      return enToTr[label] || label;
                  }}
                />
                <Area yAxisId="left" type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPremium)" />
                <Area yAxisId="right" type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Company Distribution (Updated: All + %) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
          <h3 className="font-bold text-gray-800 text-lg mb-1">Şirket Dağılımı</h3>
          <p className="text-sm text-gray-400 mb-4">Net prim üretimine göre pazar payları</p>
          
          <div className="flex-1 relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
               <div className="text-center">
                 <span className="text-xs text-gray-400">Toplam</span>
                 <p className="text-sm font-bold text-gray-800">
                    {stats.company_distribution.length} Şirket
                 </p>
               </div>
            </div>

            <ResponsiveContainer width="100%" height="100%" className="relative z-10">
              <RePieChart>
                <Pie
                  data={stats.company_distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {stats.company_distribution.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                    wrapperStyle={{ zIndex: 100 }}
                    formatter={(val: number, name: string, entry: any) => [
                        `${formatCurrency(val)} (%${((val / (totalCompanyPremium || 1)) * 100).toFixed(1)}) - ${entry.payload.count} Adet`,
                        name
                    ]} 
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 space-y-2 overflow-y-auto max-h-[120px] pr-2 custom-scrollbar">
             {stats.company_distribution.map((item: any, idx: number) => (
               <div key={idx} className="flex justify-between items-center text-xs">
                 <div className="flex items-center gap-2 min-w-0">
                   <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                   <span className="text-gray-600 truncate" title={item.name}>{item.name}</span>
                 </div>
                 <div className="flex gap-2 text-gray-500 font-mono">
                    <span>{item.count} Ad.</span>
                    <span className="font-bold text-gray-800 w-12 text-right">%{((item.value / (totalCompanyPremium || 1)) * 100).toFixed(0)}</span>
                 </div>
               </div>
             ))}
          </div>
        </div>

        {/* Row 2: Product Dist (1 col) + Commission Chart (2 cols) */}

        {/* Product Distribution (New) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
          <h3 className="font-bold text-gray-800 text-lg mb-1">Ürün Dağılımı</h3>
          <p className="text-sm text-gray-400 mb-4">Branş bazlı üretim analizi</p>
          
          {(!stats.product_distribution || stats.product_distribution.length === 0) ? (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <PieChart size={48} className="mb-2 opacity-50" />
                <p>Veri bulunamadı</p>
             </div>
          ) : (
          <>
            <div className="flex-1 relative">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <div className="text-center">
                    <span className="text-xs text-gray-400">Toplam</span>
                    <p className="text-sm font-bold text-gray-800">
                        {(stats.product_distribution || []).length} Ürün
                    </p>
                </div>
                </div>

                <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                <RePieChart>
                    <Pie
                  data={stats.product_distribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                    {(stats.product_distribution || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip 
                        wrapperStyle={{ zIndex: 100 }}
                        formatter={(val: number, name: string, entry: any) => [
                            `${formatCurrency(val)} (%${((val / (totalProductPremium || 1)) * 100).toFixed(1)}) - ${entry.payload.count} Adet`,
                            name
                        ]} 
                    />
                </RePieChart>
                </ResponsiveContainer>
            </div>
            
            <div className="mt-4 space-y-2 overflow-y-auto max-h-[120px] pr-2 custom-scrollbar">
                {(stats.product_distribution || []).map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[(idx + 3) % COLORS.length] }}></div>
                    <span className="text-gray-600 truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex gap-2 text-gray-500 font-mono">
                        <span>{item.count} Ad.</span>
                        <span className="font-bold text-gray-800 w-12 text-right">%{((item.value / (totalProductPremium || 1)) * 100).toFixed(0)}</span>
                    </div>
                </div>
                ))}
            </div>
          </>
          )}
        </div>

        {/* Commission Chart (New - Rectangular like Yearly Performance) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">Yıllık Komisyon Analizi</h3>
              <p className="text-sm text-gray-400">Aylık bazda elde edilen net komisyon gelirleri</p>
            </div>
            <div className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                Toplam: {formatCurrency(stats.monthly_trend.reduce((acc: number, curr: any) => acc + (curr.commission || 0), 0))}
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthly_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCommission" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#9ca3af', fontSize: 12}} 
                    dy={10} 
                    tickFormatter={(val) => {
                        const enToTr: any = { 'Jan': 'Oca', 'Feb': 'Şub', 'Mar': 'Mar', 'Apr': 'Nis', 'May': 'May', 'Jun': 'Haz', 'Jul': 'Tem', 'Aug': 'Ağu', 'Sep': 'Eyl', 'Oct': 'Eki', 'Nov': 'Kas', 'Dec': 'Ara' };
                        return enToTr[val] || val;
                    }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} tickFormatter={(val) => `${val/1000}K`} />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(val: any) => [formatCurrency(val), 'Komisyon']}
                  labelFormatter={(label) => {
                      const enToTr: any = { 'Jan': 'Ocak', 'Feb': 'Şubat', 'Mar': 'Mart', 'Apr': 'Nisan', 'May': 'Mayıs', 'Jun': 'Haziran', 'Jul': 'Temmuz', 'Aug': 'Ağustos', 'Sep': 'Eylül', 'Oct': 'Ekim', 'Nov': 'Kasım', 'Dec': 'Aralık' };
                      return enToTr[label] || label;
                  }}
                />
                <Area type="monotone" dataKey="commission" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCommission)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 5. Bottom Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Staff Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">Personel Performansı</h3>
              <p className="text-sm text-gray-400">Bu ayın en çok üretim yapan personelleri</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 text-xs text-gray-500 uppercase font-semibold tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-left">Personel</th>
                  <th className="px-6 py-4 text-center">Poliçe</th>
                  <th className="px-6 py-4 text-right">Prim</th>
                  <th className="px-6 py-4 text-right">Komisyon</th>
                  <th className="px-6 py-4 text-right">Verimlilik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.top_employees.map((emp: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {emp.name.substring(0,2).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {emp.policies}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">{formatCurrency(emp.premium)}</td>
                    <td className="px-6 py-4 text-right text-green-600 font-medium">+{formatCurrency(emp.commission)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="w-24 ml-auto h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (emp.premium / (stats.monthly?.net_premium || 1) * 100))}%` }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Clock size={18} className="text-gray-400" />
            Son İşlemler
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 max-h-[400px]">
            {stats.recent_activity.map((item: any, idx: number) => (
              <div key={idx} className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group">
                <div className="mt-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-50"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-bold text-gray-900 truncate">{item.customer}</p>
                    <span className="text-xs font-mono text-gray-400">{format(new Date(item.time), 'HH:mm')}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{item.company} • {item.police_no}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {item.employee || 'Sistem'}
                    </span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}