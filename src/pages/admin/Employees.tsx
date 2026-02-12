import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  User, Search, Phone, Mail, Calendar, 
  TrendingUp, DollarSign, FileText, PieChart as PieChartIcon,
  ChevronRight, Loader2, ArrowUpRight, Users, Briefcase
} from 'lucide-react';
import { format, eachDayOfInterval } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { useQuery } from '@tanstack/react-query';

// --- Types ---
interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

interface EmployeeGroup {
  id: string;
  name: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

// --- Helper Components ---
const StatCard = ({ title, value, subValue, icon: Icon, colorClass, bgClass }: any) => (
  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
    <div className={`p-3 rounded-lg ${bgClass} ${colorClass}`}>
      <Icon size={20} />
    </div>
  </div>
);

export default function EmployeesPage() {
  const [activeTab, setActiveTab] = useState<'employees' | 'groups'>('employees');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date Filter
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number | 'all'>('all');

  // 1. Fetch Employees
  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('role', ['employee', 'sub_agent'])
        .order('name');
      if (error) throw error;
      return data as Employee[];
    }
  });

  // 2. Fetch Employee Groups
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['employee_groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_groups')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as EmployeeGroup[];
    }
  });

  // Default Selection Logic
  if (!selectedId) {
      if (activeTab === 'employees' && employees.length > 0) setSelectedId(employees[0].id);
      else if (activeTab === 'groups' && groups.length > 0) setSelectedId(groups[0].id);
  }

  const selectedItem = activeTab === 'employees' 
    ? employees.find(e => e.id === selectedId)
    : groups.find(g => g.id === selectedId);

  // 3. Fetch Stats Data (Unified for both Employee and Group)
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['unifiedStats', activeTab, selectedId, selectedMonth, selectedYear, selectedWeek],
    enabled: !!selectedId,
    queryFn: async () => {
        // Calculate Date Range
        let startDate = new Date(selectedYear, selectedMonth, 1);
        let endDate = new Date(selectedYear, selectedMonth + 1, 0);

        if (selectedWeek !== 'all') {
             const startDay = (selectedWeek - 1) * 7 + 1;
             const endDay = Math.min(startDay + 6, endDate.getDate());
             startDate = new Date(selectedYear, selectedMonth, startDay);
             endDate = new Date(selectedYear, selectedMonth, endDay);
        }

        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        let policiesQuery = supabase.from('policeler').select('id, net_prim, komisyon, sirket, tur, tarih');
        let quotesQuery = supabase.from('teklifler').select('id, sirket, tur, tarih, durum');

        if (activeTab === 'employees') {
            policiesQuery = policiesQuery.eq('employee_id', selectedId);
            quotesQuery = quotesQuery.eq('employee_id', selectedId);
        } else {
            // Group Logic: First get all members of the group
            const { data: members } = await supabase
                .from('employee_group_members')
                .select('user_id')
                .eq('group_id', selectedId);
            
            const memberIds = members?.map(m => m.user_id) || [];
            
            if (memberIds.length === 0) {
                // Return empty if no members
                 return { policies: [], quotes: [], startDate, endDate };
            }

            policiesQuery = policiesQuery.in('employee_id', memberIds);
            quotesQuery = quotesQuery.in('employee_id', memberIds);
        }

        // Apply Date Filters - Use created_at for performance stats instead of tarih (Expiry)
        policiesQuery = policiesQuery.gte('created_at', startStr + 'T00:00:00').lte('created_at', endStr + 'T23:59:59');
        quotesQuery = quotesQuery.gte('created_at', startStr + 'T00:00:00').lte('created_at', endStr + 'T23:59:59');

        const [policiesRes, quotesRes] = await Promise.all([policiesQuery, quotesQuery]);

        if (policiesRes.error) throw policiesRes.error;
        if (quotesRes.error) throw quotesRes.error;

        return { policies: policiesRes.data, quotes: quotesRes.data, startDate, endDate };
    }
  });

  // 4. Process Data (Memoized)
  const stats = useMemo(() => {
      if (!statsData) return null;
      const { policies, quotes, startDate, endDate } = statsData;

      const totalPolicies = policies?.length || 0;
      const totalQuotes = quotes?.length || 0;
      const totalPremium = policies?.reduce((sum, p) => sum + (Number(p.net_prim) || 0), 0) || 0;
      const totalCommission = policies?.reduce((sum, p) => sum + (Number(p.komisyon) || 0), 0) || 0;
      const conversionRate = totalQuotes > 0 ? (totalPolicies / totalQuotes) * 100 : 0;

      // Daily Trend
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyTrend = days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayPolicies = policies?.filter(p => p.tarih === dayStr) || [];
        const dayQuotes = quotes?.filter(q => q.tarih === dayStr) || [];
        return {
          date: format(day, 'd MMM', { locale: tr }),
          amount: dayPolicies.reduce((sum, p) => sum + (Number(p.net_prim) || 0), 0),
          policyCount: dayPolicies.length,
          quoteCount: dayQuotes.length
        };
      });

      // Company Distribution
      const companyMap = new Map();
      policies?.forEach(p => {
        const name = p.sirket || 'Diğer';
        companyMap.set(name, (companyMap.get(name) || 0) + 1);
      });
      const companyDist = Array.from(companyMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Product Distribution (Policies)
      const productPolicyMap = new Map();
      policies?.forEach(p => {
          const name = p.tur || 'Diğer';
          productPolicyMap.set(name, (productPolicyMap.get(name) || 0) + 1);
      });
      const productPolicyDist = Array.from(productPolicyMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Product Distribution (Quotes)
      const productQuoteMap = new Map();
      quotes?.forEach(q => {
          const name = q.tur || 'Diğer';
          productQuoteMap.set(name, (productQuoteMap.get(name) || 0) + 1);
      });
      const productQuoteDist = Array.from(productQuoteMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

      return {
          totalPolicies,
          totalQuotes,
          totalPremium,
          totalCommission,
          conversionRate,
          dailyTrend,
          companyDist,
          productPolicyDist,
          productQuoteDist
      };
  }, [statsData]);

  const filteredList = activeTab === 'employees'
    ? employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : groups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);

  if (loadingEmployees || loadingGroups) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-6 p-1">
      
      {/* Sidebar List */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
              <button 
                onClick={() => { setActiveTab('employees'); setSelectedId(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'employees' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <User size={16} />
                  Çalışanlar
              </button>
              <button 
                onClick={() => { setActiveTab('groups'); setSelectedId(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'groups' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Briefcase size={16} />
                  Gruplar
              </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder={activeTab === 'employees' ? "Personel ara..." : "Grup ara..."}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredList.map((item: any) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group
                ${selectedId === item.id 
                    ? (activeTab === 'employees' ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-purple-50 border-purple-200 shadow-sm') 
                    : 'hover:bg-gray-50 border-transparent'}
                border
              `}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm
                ${selectedId === item.id 
                    ? (activeTab === 'employees' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white') 
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}
              `}>
                {activeTab === 'employees' ? (item.name?.substring(0, 2).toUpperCase() || '??') : <Briefcase size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${selectedId === item.id ? (activeTab === 'employees' ? 'text-blue-900' : 'text-purple-900') : 'text-gray-800'}`}>
                  {item.name || 'İsimsiz'}
                </p>
                <p className="text-xs text-gray-500 truncate capitalize">
                  {activeTab === 'employees' ? (item.role === 'employee' ? 'Çalışan' : item.role?.replace('_', ' ')) : 'Çalışan Grubu'}
                </p>
              </div>
              {selectedId === item.id && <ChevronRight size={16} className={activeTab === 'employees' ? 'text-blue-600' : 'text-purple-600'} />}
            </button>
          ))}
          {filteredList.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">Kayıt bulunamadı.</p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {selectedItem ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full text-white flex items-center justify-center text-2xl font-bold shadow-md ${activeTab === 'employees' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                   {activeTab === 'employees' ? selectedItem.name?.substring(0, 2).toUpperCase() : <Briefcase size={32} />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{selectedItem.name}</h1>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    {activeTab === 'employees' ? (
                        <>
                            <span className="flex items-center gap-1"><Mail size={14} /> {selectedItem.email}</span>
                            {selectedItem.phone && <span className="flex items-center gap-1"><Phone size={14} /> {selectedItem.phone}</span>}
                        </>
                    ) : (
                        <span className="flex items-center gap-1"><Users size={14} /> Grup Performans Analizi</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <Calendar size={16} className="text-gray-500 ml-2" />
                
                {/* Week Selector */}
                <select 
                  className="bg-transparent text-sm font-medium text-gray-700 p-2 outline-none cursor-pointer border-r"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">Tüm Ay</option>
                  <option value={1}>1. Hafta</option>
                  <option value={2}>2. Hafta</option>
                  <option value={3}>3. Hafta</option>
                  <option value={4}>4. Hafta</option>
                  <option value={5}>5. Hafta</option>
                </select>

                <select 
                  className="bg-transparent text-sm font-medium text-gray-700 p-2 outline-none cursor-pointer"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'].map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <select 
                  className="bg-transparent text-sm font-medium text-gray-700 p-2 border-l outline-none cursor-pointer"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Scrollable Stats Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {statsLoading || !stats ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-gray-300" size={48} />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard 
                      title="Net Üretim" 
                      value={formatCurrency(stats.totalPremium)} 
                      icon={DollarSign} 
                      colorClass="text-green-600" 
                      bgClass="bg-green-50" 
                    />
                    <StatCard 
                      title="Toplam Komisyon" 
                      value={formatCurrency(stats.totalCommission)} 
                      icon={TrendingUp} 
                      colorClass="text-blue-600" 
                      bgClass="bg-blue-50" 
                    />
                    <StatCard 
                      title="Poliçeleşme Oranı" 
                      value={`%${stats.conversionRate.toFixed(1)}`}
                      subValue={`${stats.totalQuotes} Teklif / ${stats.totalPolicies} Poliçe`}
                      icon={FileText} 
                      colorClass="text-purple-600" 
                      bgClass="bg-purple-50" 
                    />
                  </div>

                  {/* Charts Row 1 */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Daily Trend */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[350px] flex flex-col">
                      <h3 className="font-bold text-gray-800 mb-4">Günlük Üretim Trendi</h3>
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats.dailyTrend}>
                            <defs>
                              <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} tickFormatter={(v) => `${v/1000}k`} />
                            <Tooltip 
                              formatter={(val: number, name: string) => [
                                  name === 'amount' ? formatCurrency(val) : val, 
                                  name === 'amount' ? 'Üretim' : (name === 'policyCount' ? 'Poliçe' : 'Teklif')
                              ]}
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            />
                            <Area type="monotone" dataKey="amount" name="amount" stroke="#3b82f6" fill="url(#colorTrend)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Product Policy Distribution */}
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[350px] flex flex-col">
                      <h3 className="font-bold text-gray-800 mb-4">Ürün Dağılımı (Poliçe)</h3>
                      <div className="flex-1 min-h-0 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.productPolicyDist}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {stats.productPolicyDist.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <span className="text-2xl font-bold text-gray-800">{stats.totalPolicies}</span>
                            <p className="text-xs text-gray-500">Poliçe</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500 justify-center">
                        {stats.productPolicyDist.slice(0, 3).map((e, i) => (
                            <span key={i} className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full" style={{background: COLORS[i]}}></span>
                                {e.name}
                            </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Charts Row 2 - More Charts */}
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                       {/* Product Quote Distribution */}
                       <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[350px] flex flex-col">
                          <h3 className="font-bold text-gray-800 mb-4">Teklif Dağılımı (Ürün Bazlı)</h3>
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={stats.productQuoteDist.slice(0, 7)} layout="vertical">
                                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                  <Tooltip />
                                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Teklif Sayısı" />
                              </BarChart>
                          </ResponsiveContainer>
                       </div>

                       {/* Company Stats Table */}
                       <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-[350px] flex flex-col">
                            <div className="p-4 border-b border-gray-50">
                            <h3 className="font-bold text-gray-800">Şirket Bazlı Dağılım</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {stats.companyDist.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-gray-700 shadow-sm border border-gray-100">
                                    {idx + 1}
                                    </div>
                                    <span className="font-medium text-gray-700">{item.name}</span>
                                </div>
                                <span className="font-bold text-gray-900">{item.value} Adet</span>
                                </div>
                            ))}
                            {stats.companyDist.length === 0 && <p className="text-gray-500 text-sm p-2">Veri bulunamadı.</p>}
                            </div>
                       </div>
                   </div>

                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <User size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Lütfen soldan seçim yapın</p>
          </div>
        )}
      </div>
    </div>
  );
}
