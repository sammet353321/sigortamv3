import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Users, UserPlus, X, Briefcase, MessageSquare, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface EmployeeGroup {
    id: string;
    name: string;
    member_count?: number;
}

interface Employee {
    id: string;
    name: string;
    email: string;
}

export default function EmployeeGroupsManagement() {
    const [groups, setGroups] = useState<EmployeeGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<EmployeeGroup | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // Added missing state

    useEffect(() => {
        fetchGroups();
    }, []);

    async function fetchGroups() {
        try {
            const { data, error } = await supabase
                .from('employee_groups')
                .select('*, employee_group_members(count)');
            
            if (error) throw error;
            
            setGroups(data?.map(g => ({
                ...g,
                member_count: g.employee_group_members?.[0]?.count || 0
            })) || []);
        } catch (error) {
            console.error('Error fetching employee groups:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddGroup(e: React.FormEvent) {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        try {
            const { error } = await supabase.from('employee_groups').insert([{ name: newGroupName }]);
            if (error) throw error;
            setNewGroupName('');
            fetchGroups();
        } catch (error) {
            console.error('Error adding group:', error);
            alert('Grup eklenirken hata oluştu.');
        }
    }

    async function handleDeleteGroup(id: string) {
        if (!confirm('Bu grubu ve tüm üyelerini silmek istediğinize emin misiniz?')) return;

        try {
            const { error } = await supabase.from('employee_groups').delete().eq('id', id);
            if (error) throw error;
            fetchGroups();
            if (selectedGroup?.id === id) setSelectedGroup(null);
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">Çalışan Grupları</h3>
            </div>

            <form onSubmit={handleAddGroup} className="flex gap-4">
                <input 
                    type="text" 
                    placeholder="Grup Adı (Örn: A Grubu, B Grubu)" 
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
                        className="flex justify-between items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer bg-white group"
                    >
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                                <Briefcase size={20} />
                            </div>
                            <div>
                                <span className="font-medium text-gray-800 block">{group.name}</span>
                                <span className="text-xs text-gray-500">{group.member_count} Çalışan</span>
                            </div>
                        </div>
                        {confirmDeleteId === group.id ? (
                            <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={() => handleDeleteGroup(group.id)}
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
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(group.id); }}
                                className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                ))}
                {groups.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                        Henüz çalışan grubu oluşturulmamış.
                    </div>
                )}
            </div>

            {selectedGroup && (
                <GroupMembersModal 
                    group={selectedGroup} 
                    onClose={() => { setSelectedGroup(null); fetchGroups(); }} 
                />
            )}
        </div>
    );
}

function GroupMembersModal({ group, onClose }: { group: EmployeeGroup; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'members' | 'whatsapp'>('members');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [chatGroups, setChatGroups] = useState<any[]>([]);
    const [assignedChatGroupIds, setAssignedChatGroupIds] = useState<string[]>([]);
    const [initialAssignedChatGroupIds, setInitialAssignedChatGroupIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, [group.id]);

    async function fetchData() {
        try {
            // Fetch all employees
            const { data: users } = await supabase
                .from('users')
                .select('id, name, email')
                .eq('role', 'employee')
                .order('name');
            setEmployees(users || []);

            // Fetch current members
            const { data: members } = await supabase
                .from('employee_group_members')
                .select('user_id')
                .eq('group_id', group.id);
            setMemberIds(members?.map(m => m.user_id) || []);

            // Fetch chat groups
            const { data: chats } = await supabase
                .from('chat_groups')
                .select('id, name, assigned_employee_group_id')
                .order('name');
            setChatGroups(chats || []);
            
            const assigned = chats?.filter(c => c.assigned_employee_group_id === group.id).map(c => c.id) || [];
            setAssignedChatGroupIds(assigned);
            setInitialAssignedChatGroupIds(assigned);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    async function toggleMember(userId: string) {
        const isMember = memberIds.includes(userId);

        try {
            if (isMember) {
                await supabase
                    .from('employee_group_members')
                    .delete()
                    .match({ group_id: group.id, user_id: userId });
                setMemberIds(prev => prev.filter(id => id !== userId));
            } else {
                await supabase
                    .from('employee_group_members')
                    .insert({ group_id: group.id, user_id: userId });
                setMemberIds(prev => [...prev, userId]);
            }
        } catch (error) {
            console.error('Error toggling member:', error);
            toast.error('İşlem sırasında hata oluştu.');
        }
    }

    const toggleChatGroup = (chatGroupId: string) => {
        if (assignedChatGroupIds.includes(chatGroupId)) {
            setAssignedChatGroupIds(prev => prev.filter(id => id !== chatGroupId));
        } else {
            setAssignedChatGroupIds(prev => [...prev, chatGroupId]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Find groups to add (in assigned but not in initial)
            const toAdd = assignedChatGroupIds.filter(id => !initialAssignedChatGroupIds.includes(id));
            
            // Find groups to remove (in initial but not in assigned)
            const toRemove = initialAssignedChatGroupIds.filter(id => !assignedChatGroupIds.includes(id));

            if (toAdd.length > 0) {
                const { error: addError } = await supabase
                    .from('chat_groups')
                    .update({ assigned_employee_group_id: group.id })
                    .in('id', toAdd);
                if (addError) throw addError;
            }

            if (toRemove.length > 0) {
                const { error: removeError } = await supabase
                    .from('chat_groups')
                    .update({ assigned_employee_group_id: null })
                    .in('id', toRemove);
                if (removeError) throw removeError;
            }

            toast.success('Değişiklikler başarıyla kaydedildi.');
            onClose();
        } catch (error) {
            console.error('Error saving changes:', error);
            toast.error('Kaydederken bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800">{group.name}</h3>
                        <p className="text-sm text-gray-500">Grup Yönetimi</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-200 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('members')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'members' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Users size={18} />
                        Çalışanlar
                    </button>
                    <button 
                        onClick={() => setActiveTab('whatsapp')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'whatsapp' ? 'border-green-600 text-green-600 bg-green-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <MessageSquare size={18} />
                        WhatsApp Grupları
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                            <span className="text-gray-500">Yükleniyor...</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'members' && (
                                <div className="space-y-2">
                                    {employees.map(emp => (
                                        <div 
                                            key={emp.id} 
                                            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer bg-white transition-all group" 
                                            onClick={() => toggleMember(emp.id)}
                                        >
                                            <div className="flex items-center space-x-3">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${memberIds.includes(emp.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                                    {memberIds.includes(emp.id) && <span className="text-white text-xs">✓</span>}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-800">{emp.name}</p>
                                                    <p className="text-xs text-gray-500">{emp.email}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {employees.length === 0 && <p className="text-center text-gray-500 py-8">Sistemde kayıtlı çalışan bulunamadı.</p>}
                                </div>
                            )}

                            {activeTab === 'whatsapp' && (
                                <div className="space-y-2">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                                        <p>Seçilen WhatsApp grupları bu çalışan grubuna atanacaktır. Bir grup başka bir yere atanmışsa buraya taşınır.</p>
                                    </div>
                                    {chatGroups.map(chat => {
                                        const isAssignedToOthers = chat.assigned_employee_group_id && chat.assigned_employee_group_id !== group.id;
                                        const isSelected = assignedChatGroupIds.includes(chat.id);
                                        
                                        return (
                                            <div 
                                                key={chat.id} 
                                                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer bg-white transition-all ${isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-green-50'}`}
                                                onClick={() => toggleChatGroup(chat.id)}
                                            >
                                                <div className="flex items-center space-x-3 flex-1">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'}`}>
                                                        {isSelected && <span className="text-white text-xs">✓</span>}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-800">{chat.name}</p>
                                                        {isAssignedToOthers && !isSelected && (
                                                            <p className="text-xs text-orange-500 flex items-center mt-0.5">
                                                                Başka bir gruba atanmış
                                                            </p>
                                                        )}
                                                        {isSelected && isAssignedToOthers && (
                                                            <p className="text-xs text-green-600 font-medium mt-0.5">
                                                                Buraya taşınacak
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {chatGroups.length === 0 && <p className="text-center text-gray-500 py-8">Sistemde WhatsApp grubu bulunamadı.</p>}
                                </div>
                            )}
                        </>
                    )}
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
                                Değişiklikleri Kaydet
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
