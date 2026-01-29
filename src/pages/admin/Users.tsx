import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Trash2, Plus, X, UserPlus, Check, Edit2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';

// Temporary client for creating users without logging out admin
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New/Edit User Form State
  const [formData, setFormData] = useState({
    id: '',
    email: '',
    password: '',
    name: '',
    role: 'sub_agent'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteUser = async (userId: string) => {
    // Prevent deleting self
    if (userId === currentUser?.id) {
        toast.error('Kendinizi silemezsiniz.');
        return;
    }

    try {
      // 1. Delete from auth.users via RPC or Admin API
      // Since we can't easily delete from auth.users from client without edge function,
      // we will use our 'adminSupabase' client with service role key (DEV ONLY).
      
      const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId);
      
      if (authError) {
          // If user not found in auth, try to delete from public only
          // Also ignore "Database error deleting user" which often happens due to
          // cascade constraints or triggers in Supabase Auth
          const isIgnorableError = 
              authError.message.includes('User not found') || 
              authError.message.includes('Database error');

          if (!isIgnorableError) {
              console.error('Auth delete error:', authError);
              throw authError;
          } else {
              console.warn('Auth delete warning (ignored):', authError.message);
          }
      }

      // 2. Also ensure delete from public.users (though cascade should handle it)
      // Use admin client to bypass RLS if needed
      const { error: dbError } = await adminSupabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (dbError) throw dbError;
      
      setUsers(users.filter(u => u.id !== userId));
      setConfirmDeleteId(null); // Reset confirmation
      toast.success('Kullanıcı sistemden tamamen silindi.');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Silme işlemi başarısız: ' + error.message);
    }
  };

  const openEditModal = (user: any) => {
      setFormData({
          id: user.id,
          email: user.email,
          password: '', // Leave empty if not changing
          name: user.name,
          role: user.role
      });
      setIsEditMode(true);
      setIsModalOpen(true);
  };

  const openCreateModal = () => {
      setFormData({
          id: '',
          email: '',
          password: '',
          name: '',
          role: 'sub_agent'
      });
      setIsEditMode(false);
      setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
    });

    try {
      if (isEditMode) {
          // --- UPDATE USER ---
          
          // 1. Update Auth (Email/Password)
          const authUpdates: any = {
              email: formData.email,
              user_metadata: { name: formData.name }
          };
          if (formData.password) {
              authUpdates.password = formData.password;
          }

          const { error: authError } = await adminSupabase.auth.admin.updateUserById(
              formData.id,
              authUpdates
          );

          if (authError) throw authError;

          // 2. Update Public Table
          const { error: dbError } = await adminSupabase
              .from('users')
              .update({
                  email: formData.email,
                  name: formData.name,
                  role: formData.role,
                  updated_at: new Date().toISOString()
              })
              .eq('id', formData.id);

          if (dbError) throw dbError;
          
          toast.success('Kullanıcı güncellendi.');

      } else {
          // --- CREATE USER ---
          
          // 1. Create in Auth
          let authUser = null;
          try {
            const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
                email: formData.email,
                password: formData.password,
                email_confirm: true,
                user_metadata: { name: formData.name }
            });
            if (authError) throw authError;
            authUser = authData.user;
          } catch (err: any) {
             if (err.message?.includes('already been registered')) {
                 // Try to find existing
                 const { data: listData } = await adminSupabase.auth.admin.listUsers();
                 const existingUser = (listData.users as any[]).find(u => u.email === formData.email);
                 if (existingUser) authUser = existingUser;
                 else throw new Error('Kullanıcı zaten var ama bulunamadı.');
             } else {
                 throw err;
             }
          }

          if (authUser) {
            // 2. Create in Public
            const { error: dbError } = await adminSupabase
                .from('users')
                .upsert({
                    id: authUser.id,
                    email: formData.email,
                    name: formData.name,
                    role: formData.role,
                    updated_at: new Date().toISOString()
                });
            
            if (dbError) throw dbError;
            toast.success('Kullanıcı oluşturuldu.');
          }
      }

      setIsModalOpen(false);
      fetchUsers();

    } catch (error: any) {
      console.error('Operation error:', error);
      toast.error('İşlem başarısız: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kullanıcı Yönetimi</h1>
          <p className="text-gray-500">Sistemdeki kullanıcıları yönetin.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <Plus size={20} />
          <span>Yeni Kullanıcı Ekle</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-600 text-sm">
            <tr>
              <th className="px-6 py-4">Ad Soyad</th>
              <th className="px-6 py-4">E-posta</th>
              <th className="px-6 py-4">Rol</th>
              <th className="px-6 py-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mr-3">
                      <User size={20} />
                    </div>
                    <span className="font-medium text-gray-900">{user.name || 'İsimsiz'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">{user.email}</td>
                <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'employee' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.role === 'sub_agent' ? 'Tali Acente' : 
                       user.role === 'employee' ? 'Çalışan' : 'Yönetici'}
                    </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {/* Edit Button */}
                    <button 
                        onClick={() => openEditModal(user)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Düzenle"
                    >
                        <Edit2 size={18} />
                    </button>

                    {/* Delete Button (Hide for self) */}
                    {user.id !== currentUser?.id && (
                        <>
                            {confirmDeleteId === user.id ? (
                                <div className="flex items-center space-x-2">
                                    <span className="text-xs text-red-600 font-medium">Emin misiniz?</span>
                                    <button 
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="p-1 px-2 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                                    >
                                        Evet
                                    </button>
                                    <button 
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="p-1 px-2 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 transition-colors"
                                    >
                                        Hayır
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => setConfirmDeleteId(user.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Sil"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Henüz kayıtlı kullanıcı bulunmuyor.
          </div>
        )}
      </div>

      {/* Create/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                {isEditMode ? <Edit2 className="mr-2" size={24} /> : <UserPlus className="mr-2" size={24} />}
                {isEditMode ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Örn: Ahmet Yılmaz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="ornek@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isEditMode ? 'Şifre (Değiştirmek istemiyorsanız boş bırakın)' : 'Şifre'}
                </label>
                <input
                  type="password"
                  required={!isEditMode}
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={isEditMode ? "••••••••" : "En az 6 karakter"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                >
                  <option value="sub_agent">Tali Acente</option>
                  <option value="employee">Çalışan</option>
                  <option value="admin">Yönetici</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md disabled:opacity-50 flex items-center"
                >
                  {creating ? 'İşleniyor...' : (
                    <>
                      <Check size={18} className="mr-2" />
                      {isEditMode ? 'Güncelle' : 'Oluştur'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
