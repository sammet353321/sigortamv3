import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Users, UserPlus, Shield, X, Save, RefreshCw, Edit2, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

interface ChatGroup {
    id: string;
    name: string;
    group_jid?: string; // WhatsApp Real ID
    member_count?: number;
    assigned_employee_group_id?: string;
    is_whatsapp_group?: boolean;
}

interface EmployeeGroup {
    id: string;
    name: string;
}

interface ChatMember {
    id: string;
    phone: string;
    name?: string;
}

interface Employee {
    id: string;
    name: string;
    email: string;
}

export default function ChatGroupsManagement() {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<ChatGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
    const [isWAConnected, setIsWAConnected] = useState(false);
    const [myPhone, setMyPhone] = useState<string | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(true);

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    useEffect(() => {
        // ONLY Check connection status on mount, DO NOT fetch groups automatically if already connected
        checkStatus();

        // Listen for Sync Completion (via Session Update)
        const setupRealtime = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const channel = supabase
               .channel(`chat-groups-sync-${user.id}`)
               .on('postgres_changes', {
                   event: 'UPDATE',
                   schema: 'public',
                   table: 'whatsapp_sessions',
                   filter: `user_id=eq.${user.id}`
               }, () => {
                   // When session updates (sync complete), refresh groups
                   console.log('Session updated, refreshing groups...');
                   fetchGroups();
                   toast.success('Senkronizasyon tamamlandı!');
               })
               .subscribe();

            return () => { supabase.removeChannel(channel); };
        };
        setupRealtime();
    }, []);

    async function checkStatus() {
        setCheckingStatus(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // 1. Check WA Status
        const { data } = await supabase
            .from('whatsapp_sessions')
            .select('status, phone_number')
            .eq('user_id', user.id)
            .single();
        
        const connected = data?.status === 'connected';
        setIsWAConnected(connected);
        if (data?.phone_number) setMyPhone(data.phone_number);

        // 2. If connected, fetch groups ONCE
        if (connected) {
             await fetchGroups();
        } else {
            setGroups([]); // Clear groups if not connected
            setLoading(false);
        }
        setCheckingStatus(false);
    }

    async function fetchGroups() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // assigned_employee_group removed from select as we don't need to assign anymore
            // But we keep member_count logic if possible, or just remove it.
            // Let's keep fetching assigned_employee_group to show the "Atanan Grup Sayısı" but read-only
            const { data, error } = await supabase
                .from('chat_groups')
                .select(`
                    *, 
                    assigned_employee_group:employee_groups (
                        id,
                        employee_group_members (count)
                    )
                `)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            setGroups(data?.map(g => ({
                ...g,
                member_count: g.assigned_employee_group?.employee_group_members?.[0]?.count || 0
            })) || []);
        } catch (error) {
            console.error('Error fetching groups:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddGroup(e: React.FormEvent) {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Mark as 'creating' so Backend picks it up
            const { error } = await supabase.from('chat_groups').insert([{ 
                name: newGroupName,
                is_whatsapp_group: true, // It is intended to be a WA group
                status: 'creating', // Trigger backend listener
                created_by: user?.id // Identify who created the group
            }]);
            
            if (error) throw error;
            setNewGroupName('');
            fetchGroups();
            toast.success('Grup oluşturma isteği gönderildi.');
        } catch (error) {
            console.error('Error adding group:', error);
            toast.error('Grup eklenirken hata oluştu.');
        }
    }

    // State for Custom Confirmation Modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

    async function confirmDeleteGroup() {
        if (!groupToDelete) return;

        // Find the group object to get group_jid
        const group = groups.find(g => g.id === groupToDelete);
        if (!group) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Oturum açılmamış.');

            // --- DISABLED WA GROUP DELETION ---
            if (group.is_whatsapp_group) {
                toast.error('WhatsApp grupları silinemez. Sadece panelden manuel eklenen gruplar silinebilir.');
                return;
            }

            // Only delete from DB directly for manual groups
            const { error } = await supabase
                .from('chat_groups')
                .delete()
                .eq('id', groupToDelete);
            if (error) throw error;

            // 2. Remove from UI
            setGroups(prev => prev.filter(g => g.id !== groupToDelete));
            if (selectedGroup?.id === groupToDelete) setSelectedGroup(null);
            
            toast.success('Grup başarıyla silindi.');

        } catch (error) {
            console.error('Error deleting group:', error);
            toast.error('Silme işlemi başarısız.');
        } finally {
            setIsDeleteModalOpen(false);
            setGroupToDelete(null);
        }
    }

    function handleDeleteClick(id: string) {
        setGroupToDelete(id);
        setIsDeleteModalOpen(true);
    }

    async function handleSyncGroups() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Call Backend API to Force Sync
            // Using hostname to support remote access if configured
            const response = await fetch(`http://${window.location.hostname}:3004/groups/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-secret': 'SigortaSecurev3_2026_Key' // MUST match backend config
                },
                body: JSON.stringify({ userId: user.id })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Senkronizasyon hatası');
            }

            const result = await response.json();
            toast.success(result.message || 'Senkronizasyon başladı.');
            
            // 2. Refresh UI immediately to show current state
            await fetchGroups();

        } catch (error: any) {
            console.error('Sync Error:', error);
            toast.error(error.message || 'Senkronizasyon başarısız oldu.');
        } finally {
            setLoading(false);
        }
    }

    // Filter Groups
    const filteredGroups = groups.filter(group => 
        group.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 relative">
            {/* Custom Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto text-red-600">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Grubu Sil</h3>
                        <p className="text-gray-600 text-center mb-6">
                            Bu grubu silmek istediğinize emin misiniz? <br/>
                            {groupToDelete && groups.find(g => g.id === groupToDelete)?.is_whatsapp_group ? (
                                <span className="text-xs text-blue-600 mt-2 block font-medium bg-blue-50 p-2 rounded">
                                    Güvenlik sebebiyle bu işlem grubu <b>sadece panelden siler</b>.<br/> 
                                    WhatsApp grubunuz ve üyeleriniz <b>silinmez</b>.<br/>
                                    İstediğiniz zaman tekrar senkronize edebilirsiniz.
                                </span>
                            ) : (
                                <span className="text-xs text-red-500 mt-1 block font-medium">Bu işlem geri alınamaz.</span>
                            )}
                        </p>
                        <div className="flex space-x-3">
                            <button 
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={confirmDeleteGroup}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                            >
                                Evet, Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">Sohbet Grupları</h3>
                <div className="flex items-center gap-2">
                    {isWAConnected && (
                        <button 
                            onClick={fetchGroups} 
                            disabled={loading}
                            className="text-gray-500 hover:text-blue-600 p-1 rounded-full hover:bg-gray-100" 
                            title="Yenile"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    )}
                    <div className="text-sm text-gray-500">
                        {checkingStatus ? 'Durum kontrol ediliyor...' : 
                         isWAConnected ? (
                            <div className="flex items-center gap-2">
                                <span className="text-green-600 font-medium flex items-center">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
                                    WhatsApp Bağlı
                                </span>
                                <div className="flex flex-col items-end">
                                    <button 
                                        onClick={handleSyncGroups}
                                        disabled={loading}
                                        className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1"
                                    >
                                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                                        Grupları Getir
                                    </button>
                                    <span className="text-[10px] text-gray-500 mt-1">
                                        Toplam: {groups.length} Grup
                                    </span>
                                </div>
                            </div>
                        ) : 'WhatsApp Bağlantısı Bekleniyor'}
                    </div>
                </div>
            </div>

            {checkingStatus ? (
                <div className="text-center py-10 text-gray-400">Yükleniyor...</div>
            ) : !isWAConnected ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 text-yellow-600">
                        <Shield size={24} /> 
                    </div>
                    <h4 className="text-lg font-bold text-yellow-800 mb-2">WhatsApp Bağlantısı Yok</h4>
                    <p className="text-gray-600 mb-4">Grup yönetimi yapabilmek için önce WhatsApp hesabınızı bağlamanız gerekmektedir.</p>
                    <button 
                        onClick={() => navigate('/admin/whatsapp-connection')}
                        className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors"
                    >
                        WhatsApp Bağla
                    </button>
                </div>
            ) : (
                <>
                {/* Search Bar */}
                <div className="relative mb-4">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Grup ara..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <form onSubmit={handleAddGroup} className="flex gap-4">
                    <input 
                        type="text" 
                        placeholder="Manuel Grup Adı (Örn: Dahili Personel)" 
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                    />
                    <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center">
                        <Plus size={18} className="mr-2" /> Ekle
                    </button>
                </form>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGroups.map(group => (
                        <div 
                            key={group.id} 
                            // Removed onClick to open modal on card click (except for specific elements if needed)
                            // Replaced with specific Edit button logic
                            className={`relative flex justify-between items-center p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all bg-white group overflow-hidden ${group.is_whatsapp_group ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}
                        >
                            <div className="flex items-center space-x-3 w-full min-w-0">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${group.is_whatsapp_group ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                    <Users size={20} />
                                </div>
                                <div className="min-w-0 flex-1 pr-6">
                                    <span className="font-medium text-gray-800 block truncate" title={group.name}>{group.name}</span>
                                    <div className="flex flex-col space-y-1 mt-1">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 whitespace-nowrap">Atanan Grup Sayısı:</span>
                                            <span className="text-sm font-semibold text-blue-600">
                                                {group.assigned_employee_group_id ? 1 : 0}
                                            </span>
                                        </div>
                                        {group.is_whatsapp_group && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded w-fit mt-1">WA</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col justify-between items-end h-full ml-2 space-y-2">
                                {/* Edit Button (Pencil) - Visible in "DP Mode" (Admin) */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 bg-white/50 hover:bg-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                    title="Grubu Düzenle"
                                >
                                    <Edit2 size={16} />
                                </button>

                                {!group.is_whatsapp_group ? (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(group.id); }}
                                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(group.id); }}
                                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                                        title="Panelden Kaldır"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredGroups.length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                            {searchTerm ? 'Aranan kriterlere uygun grup bulunamadı.' : 'Henüz grup oluşturulmamış veya senkronize edilmemiş.'} <br/>
                            {!searchTerm && <span className="text-sm">"WhatsApp Bağla" menüsünden gruplarınızı içe aktarabilirsiniz.</span>}
                        </div>
                    )}
                </div>
                </>
            )}

            {selectedGroup && (
                <EditGroupModal 
                    group={selectedGroup} 
                    onClose={() => { setSelectedGroup(null); fetchGroups(); }} 
                />
            )}
        </div>
    );
}

function EditGroupModal({ group, onClose }: { group: ChatGroup; onClose: () => void }) {
    const [name, setName] = useState(group.name);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('chat_groups')
                .update({ name: name.trim() })
                .eq('id', group.id);

            if (error) throw error;
            toast.success('Grup bilgileri güncellendi (Sadece Panelde).');
            onClose();
        } catch (error) {
            console.error('Error updating group:', error);
            toast.error('Güncelleme sırasında hata oluştu.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800">Grubu Düzenle</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 mb-4">
                        Bu işlem sadece paneldeki grup ismini değiştirir. WhatsApp'taki gerçek grup ismi değişmez.
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Grup Adı</label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition"
                    >
                        İptal
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Kaydediliyor...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Kaydet
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
