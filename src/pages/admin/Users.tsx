import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Trash2, Plus, X, UserPlus, Check } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';

// Temporary client for creating users without logging out admin
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New User Form State
  const [newUser, setNewUser] = useState({
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
    if (!window.confirm('Bu kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;

    try {
      // 1. Delete from public.users
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      // Note: Auth user deletion usually requires Edge Function or Service Key.
      // Since we have service key now (for local dev), we could try deleting auth user too if needed.
      // But for now keeping it simple.
      
      setUsers(users.filter(u => u.id !== userId));
      toast.success('Kullanıcı silindi.');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Kullanıcı silinirken hata oluştu.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      // Create a temporary client with SERVICE ROLE key to bypass email confirmation
      // SECURITY NOTE: This exposes service key in client. Only for local/MVP use.
      const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // 1. Create user using Admin API (auto confirms email)
      // Note: If user exists in Auth but not in public.users, createUser will throw error.
      // We should check if user exists first or handle the error gracefully.
      
      let authUser = null;

      try {
          // 1. Try to create user
          const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
            email: newUser.email,
            password: newUser.password,
            email_confirm: true,
            user_metadata: {
                name: newUser.name
            }
          });
          
          if (authError) throw authError;
          authUser = authData.user;

      } catch (err: any) {
          // 2. If user already registered, try to find it
          if (err.message?.includes('already been registered')) {
              console.log('User already exists in Auth, trying to find ID...');
              
              // List users to find the UID by email
              // Note: listUsers requires service_role key which we have
              const { data: listData, error: listError } = await adminSupabase.auth.admin.listUsers();
              
              if (listError) {
                  console.error('List users error:', listError);
                  throw err; // Original error
              }

              const existingUser = listData.users.find(u => u.email === newUser.email);
              
              if (existingUser) {
                  authUser = existingUser;
                  toast.success('Kullanıcı Auth sisteminde bulundu, veritabanına ekleniyor...');
              } else {
                  throw new Error('Kullanıcı Auth sisteminde var deniyor ama listelenemedi.');
              }
          } else {
              throw err;
          }
      }

      if (authUser) {
        // 3. Insert/Update into public.users
        // We will upsert to be safe and set the role.
        const { error: dbError } = await supabase
          .from('users')
          .upsert({
            id: authUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
            updated_at: new Date().toISOString()
          });

        if (dbError) {
             console.error('DB Insert Error:', dbError);
             // If trigger already inserted, we update instead
             await supabase
                .from('users')
                .update({ role: newUser.role, name: newUser.name })
                .eq('id', authUser.id);
        }

        toast.success('Kullanıcı başarıyla oluşturuldu ve otomatik onaylandı!');
        setIsModalOpen(false);
        setNewUser({ email: '', password: '', name: '', role: 'sub_agent' });
        fetchUsers(); // Refresh list
      }

    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Kullanıcı oluşturulurken hata: ' + error.message);
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
          onClick={() => setIsModalOpen(true)}
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
                  {confirmDeleteId === user.id ? (
                    <div className="flex items-center justify-end space-x-2">
                        <span className="text-xs text-red-600 font-medium mr-2">Emin misiniz?</span>
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

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <UserPlus className="mr-2" size={24} />
                Yeni Kullanıcı Ekle
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  placeholder="Örn: Ahmet Yılmaz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="ornek@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="En az 6 karakter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
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
                  {creating ? 'Oluşturuluyor...' : (
                    <>
                      <Check size={18} className="mr-2" />
                      Kullanıcıyı Oluştur
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
