import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Users, DollarSign, TrendingUp, Download, PieChart, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { startOfMonth, startOfYear, subDays } from 'date-fns';
import * as XLSX from 'xlsx';

const StatCard = ({ title, value, subValue, icon: Icon, colorClass, iconBgClass }: any) => (
  <div className={`p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden bg-white transition-all hover:shadow-md group`}>
    <div className="flex justify-between items-start z-10 relative">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
        {subValue && <p className="text-xs text-green-600 mt-1 font-medium bg-green-50 inline-block px-1.5 py-0.5 rounded border border-green-100">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-lg ${iconBgClass} group-hover:scale-110 transition-transform`}>
        <Icon size={24} className={colorClass} />
      </div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState({
    today: { quotes: 0, policies: 0, premium: 0, commission: 0 },
    month: { quotes: 0, policies: 0, premium: 0, commission: 0 },
    year: { quotes: 0, policies: 0, premium: 0, commission: 0 },
    total: { quotes: 0, policies: 0, premium: 0, commission: 0 },
    employees: [] as any[]
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
        const yearStart = startOfYear(new Date()).toISOString().split('T')[0];

        // 1. Fetch Aggregated Stats for ALL Employees (Fast)
        // Managers see everyone's data. 
        // We fetch current year data to build all views.
        const { data: allStats, error } = await supabase
            .from('employee_stats_daily')
            .select('*, employee:users!employee_id(name)')
            .gte('date', yearStart);

        if (error) throw error;

        const newStats = {
            today: { quotes: 0, policies: 0, premium: 0, commission: 0 },
            month: { quotes: 0, policies: 0, premium: 0, commission: 0 },
            year: { quotes: 0, policies: 0, premium: 0, commission: 0 },
            total: { quotes: 0, policies: 0, premium: 0, commission: 0 },
            employees: [] as any[]
        };

        const empMap: Record<string, any> = {};

        allStats?.forEach(day => {
            // Global Aggregations
            newStats.year.quotes += day.quotes_count || 0;
            newStats.year.policies += day.policies_count || 0;
            newStats.year.premium += day.total_premium || 0;
            newStats.year.commission += day.total_commission || 0;

            if (day.date >= monthStart) {
                newStats.month.quotes += day.quotes_count || 0;
                newStats.month.policies += day.policies_count || 0;
                newStats.month.premium += day.total_premium || 0;
                newStats.month.commission += day.total_commission || 0;
            }

            if (day.date === today) {
                newStats.today.quotes += day.quotes_count || 0;
                newStats.today.policies += day.policies_count || 0;
                newStats.today.premium += day.total_premium || 0;
                newStats.today.commission += day.total_commission || 0;
            }

            // Employee Aggregations (For Ranking Table)
            // We focus on "This Month" for the table usually
            if (!empMap[day.employee_id]) {
                empMap[day.employee_id] = {
                    id: day.employee_id,
                    name: (day as any).employee?.name || 'Bilinmeyen',
                    monthPremium: 0,
                    monthPolicies: 0,
                    todayPremium: 0
                };
            }

            if (day.date >= monthStart) {
                empMap[day.employee_id].monthPremium += day.total_premium || 0;
                empMap[day.employee_id].monthPolicies += day.policies_count || 0;
            }
            if (day.date === today) {
                empMap[day.employee_id].todayPremium += day.total_premium || 0;
            }
        });

        // Convert Map to Array & Sort by Premium
        newStats.employees = Object.values(empMap).sort((a, b) => b.monthPremium - a.monthPremium);

        setStats(newStats);
    } catch (err) {
        console.error('Dashboard error:', err);
    } finally {
        setLoading(false);
    }
  }

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M ₺';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K ₺';
    return val.toLocaleString('tr-TR') + ' ₺';
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(stats.employees.map(emp => ({
        'Personel': emp.name,
        'Bugün Üretim': emp.todayPremium,
        'Bu Ay Poliçe': emp.monthPolicies,
        'Bu Ay Üretim': emp.monthPremium
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Personel Performansı");
    XLSX.writeFile(wb, "personel_performansi.xlsx");
  };

  if (loading) return <div className="p-10 text-center">Yükleniyor...</div>;

  return (
    <div className="space-y-8 pb-10">
      
      {/* Row 1: Today's Snapshot */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Activity size={16} /> Bugünün Özeti
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard 
            title="Günlük Üretim" 
            value={formatCurrency(stats.today.premium)} 
            subValue={`+${formatCurrency(stats.today.commission)} Komisyon`}
            icon={DollarSign} 
            colorClass="text-green-600" 
            iconBgClass="bg-green-100"
          />
          <StatCard 
            title="Kesilen Poliçe" 
            value={stats.today.policies} 
            icon={FileText} 
            colorClass="text-blue-600" 
            iconBgClass="bg-blue-100"
          />
          <StatCard 
            title="Verilen Teklif" 
            value={stats.today.quotes} 
            icon={FileText} 
            colorClass="text-amber-600" 
            iconBgClass="bg-amber-100"
          />
          <StatCard 
            title="Aktif Personel" 
            value={stats.employees.length} 
            icon={Users} 
            colorClass="text-purple-600" 
            iconBgClass="bg-purple-100"
          />
        </div>
      </div>

      {/* Row 2: Monthly Performance */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={16} /> Aylık Performans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard 
            title="Aylık Toplam Prim" 
            value={formatCurrency(stats.month.premium)} 
            icon={DollarSign} 
            colorClass="text-green-600" 
            iconBgClass="bg-green-50"
          />
          <StatCard 
            title="Aylık Toplam Komisyon" 
            value={formatCurrency(stats.month.commission)} 
            icon={TrendingUp} 
            colorClass="text-purple-600" 
            iconBgClass="bg-purple-50"
          />
          <StatCard 
            title="Aylık Poliçe Adedi" 
            value={stats.month.policies} 
            icon={FileText} 
            colorClass="text-blue-600" 
            iconBgClass="bg-blue-50"
          />
           <StatCard 
            title="Yıllık Toplam Prim" 
            value={formatCurrency(stats.year.premium)} 
            icon={PieChart} 
            colorClass="text-indigo-600" 
            iconBgClass="bg-indigo-50"
          />
        </div>
      </div>

      {/* Row 3: Staff Ranking Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800">Personel Sıralaması (Bu Ay)</h3>
            <button 
                onClick={handleExportExcel}
                className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1 rounded flex items-center transition-colors"
            >
                <Download size={12} className="mr-1" /> Excel İndir
            </button>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="text-gray-500 border-b border-gray-100 bg-gray-50/50">
                    <tr>
                        <th className="px-4 py-3 font-medium">Sıra</th>
                        <th className="px-4 py-3 font-medium">Personel</th>
                        <th className="px-4 py-3 font-medium text-right">Bugün Üretim</th>
                        <th className="px-4 py-3 font-medium text-center">Bu Ay Poliçe</th>
                        <th className="px-4 py-3 font-medium text-right">Bu Ay Üretim</th>
                        <th className="px-4 py-3 font-medium text-right">Performans</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {stats.employees.map((emp, index) => (
                        <tr key={emp.id} className="group hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-400 font-mono w-12">#{index + 1}</td>
                            <td className="px-4 py-3 font-bold text-gray-800">{emp.name}</td>
                            <td className="px-4 py-3 text-right text-gray-600">
                                {emp.todayPremium > 0 ? formatCurrency(emp.todayPremium) : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                                    {emp.monthPolicies}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-800">
                                {formatCurrency(emp.monthPremium)}
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="w-24 h-1.5 bg-gray-100 rounded-full ml-auto overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 rounded-full" 
                                        style={{ width: `${stats.employees[0].monthPremium ? (emp.monthPremium / stats.employees[0].monthPremium) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {stats.employees.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-6 text-gray-400">Veri bulunamadı.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

    </div>
  );
}
