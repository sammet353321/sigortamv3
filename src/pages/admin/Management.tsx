import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Plus, Trash2, X, Settings } from 'lucide-react';
import UsersPage from './Users';
import ChatGroupsManagement from './ChatGroups';
import EmployeeGroupsManagement from './EmployeeGroups';
import { toast } from 'react-hot-toast';

interface Company {
    id: string;
    name: string;
    is_active: boolean;
}

export default function ManagementPage() {
    const [activeTab, setActiveTab] = useState<'users' | 'chat-groups' | 'employee-groups' | 'settings' | 'companies'>('users');

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Yönetim Paneli</h1>
            
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap gap-y-1">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Kullanıcılar
                </button>
                <button
                    onClick={() => setActiveTab('employee-groups')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'employee-groups' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Çalışan Grupları
                </button>
                <button
                    onClick={() => setActiveTab('chat-groups')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'chat-groups' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Sohbet Grupları
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Genel Ayarlar
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                {activeTab === 'companies' && <CompanyManagement />}
                {activeTab === 'users' && <UsersPage />}
                {activeTab === 'employee-groups' && <EmployeeGroupsManagement />}
                {activeTab === 'chat-groups' && <ChatGroupsManagement />}
                {activeTab === 'settings' && <GeneralSettings />}
            </div>
        </div>
    );
}

function GeneralSettings() {
    const [brandName, setBrandName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'brand_name')
                .single();
            
            if (data) {
                setBrandName(data.value);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'brand_name', value: brandName }, { onConflict: 'key' });

            if (error) throw error;
            toast.success('Ayarlar kaydedildi. Sayfa yenilendiğinde geçerli olacaktır.');
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error('Error saving settings:', error);
            toast.error('Hata oluştu.');
        }
    }

    if (loading) return <div>Yükleniyor...</div>;

    return (
        <div className="max-w-md space-y-6">
            <h3 className="text-lg font-bold text-gray-800">Genel Ayarlar</h3>
            
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Marka / Şirket Adı</label>
                <input 
                    type="text" 
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Örn: KOÇ SİGORTA"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500">Bu isim sol üst köşedeki logo alanında görünecektir.</p>
            </div>

            <button 
                onClick={handleSave}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
                Kaydet
            </button>
        </div>
    );
}

function CompanyManagement() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCompany, setNewCompany] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        fetchCompanies();
    }, []);

    async function fetchCompanies() {
        try {
            const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setCompanies(data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddCompany(e: React.FormEvent) {
        e.preventDefault();
        if (!newCompany.trim()) return;

        try {
            const { error } = await supabase.from('companies').insert([{ name: newCompany }]);
            if (error) throw error;
            setNewCompany('');
            fetchCompanies();
        } catch (error) {
            console.error('Error adding company:', error);
            alert('Şirket eklenirken hata oluştu.');
        }
    }

    async function handleDeleteCompany(id: string) {
        if (!confirm('Bu şirketi silmek istediğinize emin misiniz?')) return;

        try {
            const { error } = await supabase.from('companies').delete().eq('id', id);
            if (error) throw error;
            setCompanies(companies.filter(c => c.id !== id));
            toast.success('Şirket silindi.');
        } catch (error) {
            console.error('Error deleting company:', error);
            toast.error('Şirket silinirken hata oluştu.');
        }
    }

    if (loading) return <div>Yükleniyor...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">Sigorta Şirketleri</h3>
            </div>

            <form onSubmit={handleAddCompany} className="flex gap-4">
                <input 
                    type="text" 
                    placeholder="Şirket Adı (Örn: Allianz, Axa)" 
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                />
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center">
                    <Plus size={18} className="mr-2" /> Ekle
                </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map(company => (
                    <div key={company.id} className="flex justify-between items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors group bg-gray-50">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200 text-gray-400">
                                <Building2 size={20} />
                            </div>
                            <span className="font-medium text-gray-800">{company.name}</span>
                        </div>
                        {confirmDeleteId === company.id ? (
                            <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={() => handleDeleteCompany(company.id)}
                                    className="p-1 px-2 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                >
                                    Sil
                                </button>
                                <button 
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="p-1 px-2 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                                >
                                    İptal
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setConfirmDeleteId(company.id)}
                                className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                ))}
                {companies.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                        Henüz şirket eklenmemiş.
                    </div>
                )}
            </div>
        </div>
    );
}
