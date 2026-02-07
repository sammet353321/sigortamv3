import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Users, Search, TrendingUp, FileText, CheckCircle, Clock, ArrowRight, Shield, Calendar } from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { format, eachMonthOfInterval, startOfYear, endOfYear, eachDayOfInterval } from 'date-fns';
import { tr } from 'date-fns/locale';

interface ChatGroup {
    id: string;
    name: string;
    group_jid: string;
    created_at: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

export default function SubAgentsPage() {
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Date Filters
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedWeek, setSelectedWeek] = useState<number | 'all'>('all');

    // 1. Fetch All WhatsApp Groups
    const { data: groups = [], isLoading: loadingGroups } = useQuery({
        queryKey: ['sub-agents-groups'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('chat_groups')
                .select('*')
                .eq('is_whatsapp_group', true)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data as ChatGroup[];
        }
    });

    // 2. Fetch Detailed Stats for Selected Group
    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['group-stats', selectedGroupId, selectedMonth, selectedYear, selectedWeek],
        enabled: !!selectedGroupId,
        queryFn: async () => {
            if (!selectedGroupId) return null;

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

            // Fetch Quotes
            const { data: quotes } = await supabase
                .from('teklifler')
                .select('*')
                .eq('group_id', selectedGroupId)
                .gte('tarih', startStr)
                .lte('tarih', endStr);
            
            // Fetch Policies
            const { data: policies } = await supabase
                .from('policeler')
                .select('*')
                .eq('group_id', selectedGroupId)
                .gte('tarih', startStr)
                .lte('tarih', endStr);

            const allQuotes = quotes || [];
            const allPolicies = policies || [];

            // Metrics
            const totalQuotes = allQuotes.length;
            const totalPolicies = allPolicies.length;
            const conversionRate = totalQuotes > 0 ? (totalPolicies / totalQuotes) * 100 : 0;
            
            // Product Distribution (Quotes vs Policies)
            const productStats = new Map();
            
            allQuotes.forEach(q => {
                const type = q.tur || 'Diğer';
                if (!productStats.has(type)) productStats.set(type, { name: type, quotes: 0, policies: 0 });
                productStats.get(type).quotes++;
            });

            allPolicies.forEach(p => {
                const type = p.tur || 'Diğer';
                if (!productStats.has(type)) productStats.set(type, { name: type, quotes: 0, policies: 0 });
                productStats.get(type).policies++;
            });

            const productDistribution = Array.from(productStats.values());

            // Trend Chart Data (Daily or Monthly based on filter?)
            // If Week is selected, show Daily trend for that week
            // If Month is selected, show Daily trend for that month
            // If we want to keep it simple and consistent with other pages, let's show Daily Trend for the selected period.
            const days = eachDayOfInterval({ start: startDate, end: endDate });
            
            const trend = days.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const mQuotes = allQuotes.filter(q => q.tarih === dayStr).length;
                const mPolicies = allPolicies.filter(p => p.tarih === dayStr).length;
                return {
                    name: format(day, 'd MMM', { locale: tr }),
                    quotes: mQuotes,
                    policies: mPolicies
                };
            });

            // Trailer Chart Data (Overview)
            let trafficCount = 0;
            let kaskoCount = 0;
            let otherCount = 0;

            allPolicies.forEach(p => {
                const t = p.tur?.toLowerCase() || '';
                if (t.includes('trafik')) trafficCount++;
                else if (t.includes('kasko')) kaskoCount++;
                else otherCount++;
            });

            const trailerData = [
                { name: 'Trafik', value: trafficCount },
                { name: 'Kasko', value: kaskoCount },
                { name: 'Diğer', value: otherCount }
            ].filter(d => d.value > 0);

            return {
                totalQuotes,
                totalPolicies,
                conversionRate,
                productDistribution,
                trend,
                trailerData
            };
        }
    });

    const filteredGroups = groups.filter(g => 
        g.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    return (
        <div className="flex h-[calc(100vh-2rem)] gap-6 p-1">
            {/* LEFT: Group List */}
            <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800 mb-4">Taliler (WP Grupları)</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Grup ara..." 
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {loadingGroups ? (
                         <div className="text-center py-10 text-gray-400">Yükleniyor...</div>
                    ) : (
                        filteredGroups.map(group => (
                            <button
                                key={group.id}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group
                                    ${selectedGroupId === group.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-gray-50 border-transparent'}
                                    border
                                `}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm
                                    ${selectedGroupId === group.id ? 'bg-green-600 text-white' : 'bg-green-100 text-green-600 group-hover:bg-green-200'}
                                `}>
                                    <Users size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-medium truncate ${selectedGroupId === group.id ? 'text-blue-900' : 'text-gray-800'}`}>
                                        {group.name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        WhatsApp Grubu
                                    </p>
                                </div>
                                {selectedGroupId === group.id && <ArrowRight size={16} className="text-blue-600" />}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* RIGHT: Dashboard */}
            <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {selectedGroup ? (
                    <div className="flex flex-col h-full overflow-y-auto">
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center shadow-lg">
                                    <Users size={32} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900">{selectedGroup.name}</h1>
                                    <p className="text-gray-500 text-sm">Tali Acente Performans Analizi</p>
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

                        {loadingStats || !stats ? (
                             <div className="flex-1 flex items-center justify-center">
                                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                             </div>
                        ) : (
                            <div className="p-6 space-y-8">
                                {/* Top Stats Row */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 relative overflow-hidden group">
                                        <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
                                            <FileText size={100} />
                                        </div>
                                        <p className="text-blue-600 font-medium mb-1">Toplam Teklif</p>
                                        <h3 className="text-3xl font-bold text-blue-900">{stats.totalQuotes}</h3>
                                    </div>
                                    <div className="bg-green-50 rounded-xl p-5 border border-green-100 relative overflow-hidden">
                                        <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
                                            <Shield size={100} />
                                        </div>
                                        <p className="text-green-600 font-medium mb-1">Kesilen Poliçe</p>
                                        <h3 className="text-3xl font-bold text-green-900">{stats.totalPolicies}</h3>
                                    </div>
                                    <div className="bg-purple-50 rounded-xl p-5 border border-purple-100 relative overflow-hidden">
                                        <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
                                            <TrendingUp size={100} />
                                        </div>
                                        <p className="text-purple-600 font-medium mb-1">Poliçeleşme Oranı</p>
                                        <h3 className="text-3xl font-bold text-purple-900">% {stats.conversionRate.toFixed(1)}</h3>
                                        <div className="w-full bg-purple-200 h-1.5 rounded-full mt-3 overflow-hidden">
                                            <div className="bg-purple-600 h-full" style={{width: `${Math.min(stats.conversionRate, 100)}%`}}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Trailer Chart & Trend */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Trailer Chart (Product Split) */}
                                    <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-6 flex flex-col items-center justify-center relative">
                                        <h3 className="font-bold text-gray-800 mb-2 w-full text-left">Ürün Dağılımı (Poliçe)</h3>
                                        <div className="w-full h-[250px] relative">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={stats.trailerData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {stats.trailerData.map((entry: any, index: number) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend verticalAlign="bottom" height={36}/>
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                                                <div className="text-center">
                                                    <span className="text-xl font-bold text-gray-800">{stats.totalPolicies}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Monthly Trend Chart */}
                                    <div className="lg:col-span-2 bg-white border border-gray-100 shadow-sm rounded-xl p-6">
                                        <h3 className="font-bold text-gray-800 mb-4">Üretim Trendi</h3>
                                        <div className="h-[250px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={stats.trend}>
                                                    <defs>
                                                        <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                        </linearGradient>
                                                        <linearGradient id="colorPolicies" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                                                    <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                                    <Area type="monotone" dataKey="quotes" name="Teklif" stroke="#3b82f6" fillOpacity={1} fill="url(#colorQuotes)" strokeWidth={2} />
                                                    <Area type="monotone" dataKey="policies" name="Poliçe" stroke="#10b981" fillOpacity={1} fill="url(#colorPolicies)" strokeWidth={2} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Product Breakdown Table */}
                                <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                                    <div className="p-4 bg-gray-50 border-b border-gray-100">
                                        <h3 className="font-bold text-gray-800">Ürün Bazlı Detaylar</h3>
                                    </div>
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium">
                                            <tr>
                                                <th className="p-4">Ürün Adı</th>
                                                <th className="p-4 text-center">Teklif Sayısı</th>
                                                <th className="p-4 text-center">Poliçe Sayısı</th>
                                                <th className="p-4 text-right">Başarı Oranı</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {stats.productDistribution.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="p-4 font-medium text-gray-800">{item.name}</td>
                                                    <td className="p-4 text-center text-blue-600 font-medium">{item.quotes}</td>
                                                    <td className="p-4 text-center text-green-600 font-bold">{item.policies}</td>
                                                    <td className="p-4 text-right">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                            (item.policies / item.quotes) > 0.3 ? 'bg-green-100 text-green-700' : 
                                                            (item.policies / item.quotes) > 0.1 ? 'bg-yellow-100 text-yellow-700' : 
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                            {item.quotes > 0 ? `%${((item.policies / item.quotes) * 100).toFixed(0)}` : '-'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {stats.productDistribution.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-gray-400">Veri bulunamadı</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <Users size={48} className="text-gray-300" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Tali Acente Seçin</h3>
                        <p className="max-w-md text-gray-500">
                            Performans istatistiklerini, ürün dağılımını ve üretim trendlerini görüntülemek için sol taraftaki listeden bir WhatsApp grubu seçin.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
