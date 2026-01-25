import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  User, Search, Phone, Mail, Calendar, 
  TrendingUp, DollarSign, FileText, PieChart as PieChartIcon,
  ChevronRight, Loader2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';

// --- Types ---
interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

interface Stats {
  totalPolicies: number;
  totalPremium: number;
  totalCommission: number;
  avgPremium: number;
  dailyTrend: any[];
  companyDist: any[];
  productDist: any[];
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date Filter
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [stats, setStats] = useState<Stats>({
    totalPolicies: 0,
    totalPremium: 0,
    totalCommission: 0,
    avgPremium: 0,
    dailyTrend: [],
    companyDist: [],
    productDist: []
  });

  // Fetch Employees List
  useEffect(() => {
    async function fetchEmployees() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .in('role', ['employee', 'sub_agent', 'admin'])
          .order('name');
        
        if (error) throw error;
        setEmployees(data || []);
        if (data && data.length > 0 && !selectedEmp) {
          setSelectedEmp(data[0]);
        }
      } catch (error) {
        console.error('Error fetching employees:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchEmployees();
  }, []);

  // Fetch Stats when Employee or Date changes
  useEffect(() => {
    if (!selectedEmp) return;
    
    async function fetchStats() {
      setStatsLoading(true);
      try {
        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 0); // Last day of month
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        // Fetch Policies
        const { data: policies, error } = await supabase
          .from('policeler')
          .select('id, net_prim, komisyon, sirket, tur, tarih')
          .eq('employee_id', selectedEmp.id)
          .gte('tarih', startStr)
          .lte('tarih', endStr);

        if (error) throw error;

        // Process Stats
        const totalPolicies = policies?.length || 0;
        const totalPremium = policies?.reduce((sum, p) => sum + (Number(p.net_prim) || 0), 0) || 0;
        const totalCommission = policies?.reduce((sum, p) => sum + (Number(p.komisyon) || 0), 0) || 0;
        const avgPremium = totalPolicies > 0 ? totalPremium / totalPolicies : 0;

        // Daily Trend
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        const dailyTrend = days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayPolicies = policies?.filter(p => p.tarih === dayStr) || [];
          return {
            date: format(day, 'd MMM', { locale: tr }),
            amount: dayPolicies.reduce((sum, p) => sum + (Number(p.net_prim) || 0), 0),
            count: dayPolicies.length
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
          .slice(0, 5); // Top 5

        // Product Distribution
        const productMap = new Map();
        policies?.forEach(p => {
          const name = p.tur || 'Diğer';
          productMap.set(name, (productMap.get(name) || 0) + 1);
        });
        const productDist = Array.from(productMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        setStats({
          totalPolicies,
          totalPremium,
          totalCommission,
          avgPremium,
          dailyTrend,
          companyDist,
          productDist
        });

      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setStatsLoading(false);
      }
    }

    fetchStats();
  }, [selectedEmp, selectedMonth, selectedYear]);

  const filteredEmployees = employees.filter(emp => 
    emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-6 p-1">
      
      {/* Sidebar List */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 mb-4">Çalışan Listesi</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Personel ara..." 
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredEmployees.map(emp => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmp(emp)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group
                ${selectedEmp?.id === emp.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-gray-50 border-transparent'}
                border
              `}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm
                ${selectedEmp?.id === emp.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}
              `}>
                {emp.name?.substring(0, 2).toUpperCase() || '??'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${selectedEmp?.id === emp.id ? 'text-blue-900' : 'text-gray-800'}`}>
                  {emp.name || 'İsimsiz'}
                </p>
                <p className="text-xs text-gray-500 truncate capitalize">{emp.role?.replace('_', ' ')}</p>
              </div>
              {selectedEmp?.id === emp.id && <ChevronRight size={16} className="text-blue-600" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {selectedEmp ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shadow-md">
                  {selectedEmp.name?.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{selectedEmp.name}</h1>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Mail size={14} /> {selectedEmp.email}</span>
                    {selectedEmp.phone && <span className="flex items-center gap-1"><Phone size={14} /> {selectedEmp.phone}</span>}
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold uppercase">{selectedEmp.role}</span>
                  </div>
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <Calendar size={16} className="text-gray-500 ml-2" />
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
              {statsLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-gray-300" size={48} />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      title="Poliçe Adedi" 
                      value={stats.totalPolicies} 
                      icon={FileText} 
                      colorClass="text-purple-600" 
                      bgClass="bg-purple-50" 
                    />
                    <StatCard 
                      title="Ort. Poliçe Primi" 
                      value={formatCurrency(stats.avgPremium)} 
                      icon={PieChartIcon} 
                      colorClass="text-orange-600" 
                      bgClass="bg-orange-50" 
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
                              formatter={(val: number) => formatCurrency(val)}
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            />
                            <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#colorTrend)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Product Distribution */}
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[350px] flex flex-col">
                      <h3 className="font-bold text-gray-800 mb-4">Ürün Dağılımı</h3>
                      <div className="flex-1 min-h-0 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.productDist}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {stats.productDist.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <span className="text-2xl font-bold text-gray-800">{stats.totalPolicies}</span>
                            <p className="text-xs text-gray-500">Toplam</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 justify-center">
                        {stats.productDist.slice(0, 4).map((entry, index) => (
                          <div key={index} className="flex items-center gap-1 text-xs text-gray-600">
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                            {entry.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Company Stats Table */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-50">
                      <h3 className="font-bold text-gray-800">Şirket Bazlı Dağılım</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
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
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <User size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Lütfen listeden bir çalışan seçin</p>
          </div>
        )}
      </div>
    </div>
  );
}
