import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Users, UserPlus, Shield, X, Save, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

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

    useEffect(() => {
        checkStatusAndFetch();
    }, []);

    async function checkStatusAndFetch() {
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

        // 2. If connected, fetch groups
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

            const { data, error } = await supabase
                .from('chat_groups')
                .select('*, chat_group_members(count)')
                .eq('created_by', user.id) // Filter to only show groups owned/synced by this admin
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            setGroups(data?.map(g => ({
                ...g,
                member_count: g.chat_group_members?.[0]?.count || 0
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

            // 1. Call Backend API to Leave & Delete
            // If it's a real WA group and we have the JID, call the API
            if (group.is_whatsapp_group && group.group_jid) {
                const response = await fetch('http://localhost:3004/groups/leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        userId: user.id, 
                        groupJid: group.group_jid 
                    })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    console.warn('API delete failed, trying direct DB delete...', err);
                    // Fallback to direct DB delete if API fails (e.g. backend offline)
                    throw new Error(err.error || 'API Hatası');
                }
            } else {
                // If not a WA group or no JID, just delete from DB directly
                const { error } = await supabase
                    .from('chat_groups')
                    .delete()
                    .eq('id', groupToDelete);
                if (error) throw error;
            }

            // 2. Remove from UI
            setGroups(prev => prev.filter(g => g.id !== groupToDelete));
            if (selectedGroup?.id === groupToDelete) setSelectedGroup(null);
            
            toast.success('Grup başarıyla silindi.');

        } catch (error) {
            console.error('Error deleting group:', error);
            // Fallback: If API failed, try Force Delete from DB anyway
            try {
                 await supabase.from('chat_groups').delete().eq('id', groupToDelete);
                 setGroups(prev => prev.filter(g => g.id !== groupToDelete));
                 if (selectedGroup?.id === groupToDelete) setSelectedGroup(null);
                 toast.success('Grup veritabanından silindi (WhatsApp bağlantısı kontrol edilemedi).');
            } catch (dbError) {
                 toast.error('Silme işlemi başarısız.');
            }
        } finally {
            setIsDeleteModalOpen(false);
            setGroupToDelete(null);
        }
    }

    function handleDeleteClick(id: string) {
        setGroupToDelete(id);
        setIsDeleteModalOpen(true);
    }

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
                            <span className="text-xs text-red-500 mt-1 block font-medium">Dikkat: Bu işlem grubu panelden silecek ve bağlı WhatsApp hesabınız bu gruptan çıkacaktır.</span>
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
                         isWAConnected ? 'WhatsApp Senkronize Edildi' : 'WhatsApp Bağlantısı Bekleniyor'}
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
                    {groups.map(group => (
                        <div 
                            key={group.id} 
                            onClick={() => setSelectedGroup(group)}
                            className={`flex justify-between items-center p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer bg-white group ${group.is_whatsapp_group ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}
                        >
                            <div className="flex items-center space-x-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${group.is_whatsapp_group ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                    <Users size={20} />
                                </div>
                                <div>
                                    <span className="font-medium text-gray-800 block">{group.name}</span>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-xs text-gray-500">{group.member_count} Üye</span>
                                        {group.is_whatsapp_group && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">WA</span>}
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(group.id); }}
                                className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                    {groups.length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                            Henüz grup oluşturulmamış veya senkronize edilmemiş. <br/>
                            <span className="text-sm">"WhatsApp Bağla" menüsünden gruplarınızı içe aktarabilirsiniz.</span>
                        </div>
                    )}
                </div>
                </>
            )}

            {selectedGroup && (
                <GroupDetailModal 
                    group={selectedGroup} 
                    myPhone={myPhone}
                    onClose={() => { setSelectedGroup(null); fetchGroups(); }} 
                />
            )}
        </div>
    );
}

function GroupDetailModal({ group, myPhone, onClose }: { group: ChatGroup; myPhone: string | null; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'members' | 'permissions'>('members');
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg">{group.name} - Yönetim</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('members')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'members' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Üyeler (Telefonlar)
                    </button>
                    <button 
                        onClick={() => setActiveTab('permissions')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'permissions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Yetkiler (Çalışanlar)
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'members' ? <GroupMembers group={group} myPhone={myPhone} /> : <GroupPermissions group={group} onUpdate={() => {}} />}
                </div>
            </div>
        </div>
    );
}

function GroupMembers({ group, myPhone }: { group: ChatGroup; myPhone: string | null }) {
    const [members, setMembers] = useState<ChatMember[]>([]);
    const [newPhone, setNewPhone] = useState('');
    const [newName, setNewName] = useState('');

    useEffect(() => {
        fetchMembers();
    }, [group.id]);

    async function fetchMembers() {
        const { data } = await supabase.from('chat_group_members').select('*').eq('group_id', group.id);
        setMembers(data || []);
    }

    async function handleAddMember(e: React.FormEvent) {
        e.preventDefault();
        if (!newPhone.trim()) return;

        // Clean phone
        let cleanPhone = newPhone.replace(/\D/g, '');

        // Smart Format to 90xxxxxxxxxx
        if (cleanPhone.length === 10) { 
            cleanPhone = '90' + cleanPhone;
        } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) { 
            cleanPhone = '90' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 12 && cleanPhone.startsWith('90')) {
            // Correct
        } else if (cleanPhone.length > 10 && !cleanPhone.startsWith('90')) {
            // Maybe it has a different country code, let's keep it but it might fail
        }

        try {
            const { error } = await supabase.from('chat_group_members').insert({
                group_id: group.id,
                phone: cleanPhone,
                name: newName || null
            });
            
            if (error) {
                if (error.code === '23505') toast.error('Bu numara zaten grupta ekli.');
                else throw error;
            } else {
                setNewPhone('');
                setNewName('');
                fetchMembers();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    async function handleDeleteMember(id: string) {
        await supabase.from('chat_group_members').delete().eq('id', id);
        fetchMembers();
    }

    return (
        <div className="space-y-4">
            <form onSubmit={handleAddMember} className="flex gap-2">
                <input 
                    type="text" 
                    placeholder="Telefon (532...)" 
                    className="w-1/3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                />
                <input 
                    type="text" 
                    placeholder="İsim (Opsiyonel)" 
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700">
                    <Plus size={18} />
                </button>
            </form>

            <div className="space-y-2">
                {members.map(member => (
                    <div key={member.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div>
                            <p className="font-medium text-gray-800">{member.phone}</p>
                            {member.name && <p className="text-xs text-gray-500">{member.name}</p>}
                        </div>
                        {member.phone !== myPhone ? (
                            <button onClick={() => handleDeleteMember(member.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                <Trash2 size={16} />
                            </button>
                        ) : (
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold uppercase tracking-wider">Bot Sahibi</span>
                        )}
                    </div>
                ))}
                {members.length === 0 && <p className="text-center text-gray-500 text-sm">Grup boş.</p>}
            </div>
        </div>
    );
}

function GroupPermissions({ group, onUpdate }: { group: ChatGroup; onUpdate: () => void }) {
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(group.assigned_employee_group_id || null);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        const { data } = await supabase.from('employee_groups').select('id, name').order('name');
        setEmployeeGroups(data || []);
    }

    async function handleSave() {
        try {
            const { error } = await supabase
                .from('chat_groups')
                .update({ assigned_employee_group_id: selectedGroupId })
                .eq('id', group.id);

            if (error) throw error;
            // Alert removed as per request
            if (onUpdate) onUpdate(); // Refresh parent to get updated group data
            toast.success('Grup ataması güncellendi.');
        } catch (error) {
            console.error('Error updating group assignment:', error);
            toast.error('Hata oluştu.');
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm text-gray-500 mb-4">Bu sohbet grubunu hangi çalışan grubuna atamak istiyorsunuz?</p>
                
                <div className="space-y-3">
                    <div 
                        onClick={() => setSelectedGroupId(null)}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer ${selectedGroupId === null ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 ${selectedGroupId === null ? 'border-blue-600' : 'border-gray-400'}`}>
                            {selectedGroupId === null && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                        </div>
                        <span className="text-gray-700">Atama Yapılmasın (Sadece Yöneticiler)</span>
                    </div>

                    {employeeGroups.map(eg => (
                        <div 
                            key={eg.id}
                            onClick={() => setSelectedGroupId(eg.id)}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer ${selectedGroupId === eg.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 ${selectedGroupId === eg.id ? 'border-blue-600' : 'border-gray-400'}`}>
                                {selectedGroupId === eg.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                            </div>
                            <span className="text-gray-800 font-medium">{eg.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <button 
                onClick={handleSave}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
                Değişiklikleri Kaydet
            </button>
        </div>
    );
}