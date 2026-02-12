import { LogOut, Bell, Shield, User, Users, FileText, BarChart3, Menu, X, MessageCircle, ShieldCheck, TrendingUp, Calendar, Wallet, DollarSign } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import RequestsPanel from '@/components/RequestsPanel'; // Import RequestsPanel
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import trLocale from 'date-fns/locale/tr';

registerLocale('tr', trLocale);

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalQuotes: 0,
    activePolicies: 0,
    expiringPolicies: 0,
    totalCommission: 0,
    totalPremium: 0,
    conversionRate: 0
  });

  // Chart Data State
  const [productBreakdown, setProductBreakdown] = useState<any[]>([]);
  const [companyBreakdown, setCompanyBreakdown] = useState<any[]>([]);
  const [monthlyProduction, setMonthlyProduction] = useState<any[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<any[]>([]);

  // Filter State
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([new Date(), new Date()]);
  const [startDate, endDate] = dateRange;
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      if (!user) return;
      try {
        await fetchStats(isMounted);
      } catch (err) {
        if (isMounted) console.error(err);
      }
    };
    loadStats();
    return () => { isMounted = false; };
  }, [user?.id, startDate, endDate, selectedMonth, selectedYear]);

  const fetchStats = async (isMounted: boolean) => {
    if (!user) return;

    try {
      // 1. Calculate Date Range based on Filters
      let queryStartDate = startDate || new Date();
      let queryEndDate = endDate || new Date();
      
      const startStr = format(queryStartDate, 'yyyy-MM-dd');
      const endStr = format(queryEndDate, 'yyyy-MM-dd');

      // 2. Fetch Stats via Backend Proxy (Bypasses RLS)
      // We use the local backend which has Service Role access
      const response = await fetch('http://localhost:3004/dashboard/stats', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'x-api-secret': 'SigortaSecurev3_2026_Key'
          },
          body: JSON.stringify({
              employeeId: user.id,
              startDate: startStr,
              endDate: endStr,
              year: selectedYear
          })
      });

      if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
      }

      const { kpi, yearStats, quoteBreakdownRaw, policyBreakdownRaw, renewals } = await response.json();

      if (!isMounted) return;

      // --- Process Data ---
      const quotesData = quoteBreakdownRaw || [];
      const policiesData = policyBreakdownRaw || [];
      
      // KPI directly from backend aggregation (fast table)
      const quotesCount = kpi.totalQuotes;
      const policiesCount = kpi.totalPolicies;
      const totalPrem = kpi.totalPremium;
      const totalComm = kpi.totalCommission;
      
      const conversion = quotesCount > 0 ? ((policiesCount / quotesCount) * 100).toFixed(1) : 0;

      // Product Breakdown (Quotes vs Policies)
      const productStats: Record<string, { quotes: number, policies: number }> = {};
      
      // Handle Quotes Breakdown
      quotesData.forEach((q: any) => {
        let prod = (q.tur || 'Diğer').trim().toUpperCase();
        if (!productStats[prod]) productStats[prod] = { quotes: 0, policies: 0 };
        productStats[prod].quotes++;
      });

      // Handle Policies Breakdown
      policiesData.forEach((p: any) => {
        let prod = (p.tur || 'Diğer').trim().toUpperCase();
        if (!productStats[prod]) productStats[prod] = { quotes: 0, policies: 0 };
        productStats[prod].policies++;
      });
      
      const prodChartData = Object.keys(productStats).map(key => ({
          name: key, 
          shortName: key.length > 10 ? key.substring(0, 10) + '...' : key,
          Teklif: productStats[key].quotes,
          Poliçe: productStats[key].policies
      }));

      // Company Breakdown (Policies)
      const companyStats: Record<string, number> = {};
      policiesData.forEach((p: any) => {
        let comp = (p.sirket || 'Diğer').trim().toUpperCase();
        companyStats[comp] = (companyStats[comp] || 0) + 1;
      });
      
      const companyChartData = Object.keys(companyStats).map(key => ({
          name: key,
          value: companyStats[key]
      }));

      // Monthly Production (Full Year) - From Optimized Year Stats
      const monthlyData = Array.from({ length: 12 }, (_, i) => {
          const monthName = format(new Date(selectedYear, i, 1), 'MMMM', { locale: tr });
          
          // Filter yearStats for this month
          const monthStats = yearStats?.filter((s: any) => s.date && new Date(s.date).getMonth() === i) || [];
          
          const qCount = monthStats.reduce((acc: number, curr: any) => acc + (curr.quote_count || 0), 0);
          const pCount = monthStats.reduce((acc: number, curr: any) => acc + (curr.policy_count || 0), 0);
          
          return {
              name: monthName,
              Teklif: qCount,
              Poliçe: pCount,
              Oran: qCount > 0 ? Math.round((pCount / qCount) * 100) : 0
          };
      });

      setStats({
        totalQuotes: quotesCount,
        activePolicies: policiesCount,
        expiringPolicies: renewals?.length || 0,
        totalCommission: totalComm,
        totalPremium: totalPrem,
        conversionRate: Number(conversion)
      });
      
      setProductBreakdown(prodChartData);
      setCompanyBreakdown(companyChartData);
      setMonthlyProduction(monthlyData);
      setUpcomingRenewals(renewals?.map((r: any) => ({
        ...r,
        urun_adi: r.tur // Map tur to urun_adi for compatibility
      })) || []);

    } catch (error) {
      if (isMounted) console.error('Error fetching dashboard stats:', error);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

  return (
    <div className="space-y-6 pb-10">
      {/* Welcome & Stats */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Hoş Geldin, {user?.email?.split('@')[0].toUpperCase()} 👋
          </h1>
          <p className="text-gray-500 mt-1">Performans durumun ve üretim analizlerin.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          {/* Year Selector */}
          <div className="flex flex-col items-end gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">YILLIK GRAFİK İÇİN</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-24 p-2 shadow-sm font-medium hover:border-blue-300 transition-colors cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="flex flex-col items-end gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">TARİH ARALIĞI SEÇİNİZ</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10">
                <Calendar className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => {
                  setDateRange(update);
                }}
                isClearable={true}
                locale="tr"
                dateFormat="dd MMMM yyyy"
                placeholderText="Tarih Aralığı Seçin"
                className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-64 pl-10 p-2 shadow-sm font-medium hover:border-blue-300 transition-colors cursor-pointer"
                wrapperClassName="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Quotes */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Verilen Teklif</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.totalQuotes}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <FileText size={20} />
            </div>
          </div>
        </div>

        {/* Policies (Sales) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Kesilen Poliçe</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.activePolicies}</h3>
            </div>
            <div className="p-2 bg-green-50 rounded-lg text-green-600">
              <Users size={20} />
            </div>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Poliçeleştirme Oranı</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">%{stats.conversionRate}</h3>
            </div>
            <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>

        {/* Total Premium */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Toplam Prim</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">
                ₺{stats.totalPremium.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <Wallet size={20} />
            </div>
          </div>
        </div>
        
         {/* Commission */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Kazanç</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">
                 ₺{stats.totalCommission.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <DollarSign size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Charts */}
          <div className="lg:col-span-2 space-y-6">
              {/* Product Breakdown Chart */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-6">Ürün Bazlı Performans (Teklif vs Poliçe)</h3>
                  <div className="h-80 flex items-center justify-center">
                    {productBreakdown.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productBreakdown} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{fontSize: 10}} interval={0} angle={-30} textAnchor="end" height={50} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend />
                                <Bar dataKey="Teklif" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Poliçe" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-gray-400">Veri bulunamadı.</p>
                    )}
                  </div>
              </div>

              {/* Company Breakdown */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">Şirket Bazlı Satış Dağılımı</h2>
                  <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                              <Pie
                                  data={companyBreakdown}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="value"
                              >
                                  {companyBreakdown.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => [value + ' Adet', 'Satış']} />
                              <Legend 
                                  layout="vertical" 
                                  verticalAlign="middle" 
                                  align="right"
                                  formatter={(value, entry: any) => {
                                      const { payload } = entry;
                                      const total = companyBreakdown.reduce((acc, curr) => acc + curr.value, 0);
                                      const percent = total > 0 ? ((payload.value / total) * 100).toFixed(1) : 0;
                                      return <span className="text-gray-600 font-medium ml-2">{value}: {payload.value} Adet ({percent}%)</span>;
                                  }}
                              />
                          </RechartsPieChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>

          {/* Right Column: Requests & Renewals */}
          <div className="space-y-6 flex flex-col">
              {/* Requests Panel */}
              <div className="h-[400px]">
                  <RequestsPanel />
              </div>

              {/* Renewals */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-1 min-h-[400px]">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold text-gray-800">Yaklaşan Yenilemeler</h3>
                      <Link to="/employee/renewals" className="text-sm text-blue-600 hover:text-blue-700 font-bold">Tümü</Link>
                  </div>
                  
                  <div className="space-y-4">
                      {upcomingRenewals.length === 0 ? (
                          <div className="text-center text-gray-400 py-8">Yaklaşan yenileme yok.</div>
                      ) : (
                          upcomingRenewals.map((renewal) => (
                              <div key={renewal.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                                  <div className="flex justify-between items-start mb-2">
                                      <h4 className="font-bold text-gray-800 text-sm truncate w-32" title={renewal.musteri_adi}>{renewal.musteri_adi}</h4>
                                      <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">{renewal.plaka}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-xs">
                                      <span className="text-gray-500">{renewal.urun_adi}</span>
                                      <span className={`font-bold ${
                                          new Date(renewal.bitis_tarihi) < new Date() ? 'text-red-600' : 'text-orange-600'
                                      }`}>
                                          {format(new Date(renewal.bitis_tarihi), 'dd.MM.yyyy')}
                                      </span>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Bottom Panel: Annual Production Chart */}
      <div className="bg-slate-900 p-8 rounded-2xl shadow-xl text-white mt-8">
          <div className="flex justify-between items-center mb-8">
              <div>
                  <h3 className="text-2xl font-bold mb-1">Yıllık Üretim Çizelgesi ({selectedYear})</h3>
                  <p className="text-slate-400 text-sm">Aylık bazda teklif ve poliçe performans analizi.</p>
              </div>
              <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                       <span className="text-sm text-slate-300">Teklif</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                       <span className="text-sm text-slate-300">Poliçe</span>
                   </div>
              </div>
          </div>
          
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyProduction} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 12 }} 
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                        cursor={{ fill: '#334155', opacity: 0.4 }}
                    />
                    <Bar dataKey="Teklif" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="Poliçe" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
}
