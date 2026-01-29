import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Clear session on mount to fix stuck states
  useEffect(() => {
    const clearSession = async () => {
        // Optional: clear session if we landed here to force fresh login
        // localStorage.removeItem('sb-aqubbkxsfwmhfbolkfah-auth-token'); 
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      if (!email || !password) {
          throw new Error('Lütfen e-posta ve şifrenizi giriniz.');
      }

      // Clear any stale session first to avoid conflicts
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        // Fetch user role to redirect
        const { data: userData, error: roleError } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.session.user.id)
          .single();
        
        if (roleError) {
            console.error('Role fetch error:', roleError);
            // Default to unauthorized or show error
            throw new Error('Kullanıcı rolü bulunamadı.');
        }

        if (userData) {
          const role = userData.role;
          if (role === 'admin') navigate('/admin/dashboard', { replace: true });
          else if (role === 'employee') navigate('/employee/dashboard', { replace: true });
          else if (role === 'sub_agent') navigate('/sub-agent/dashboard', { replace: true });
          else navigate('/unauthorized', { replace: true });
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMessage = 'Giriş yapılırken bir hata oluştu.';
      
      if (err.message === 'Invalid login credentials') {
        errorMessage = 'Hatalı e-posta veya şifre.';
      } else if (err.message.includes('Email not confirmed')) {
        errorMessage = 'E-posta adresi doğrulanmamış. Lütfen yöneticinizle iletişime geçin.';
      } else if (err.message.includes('Email logins are disabled')) {
        errorMessage = 'E-posta ile giriş sistemi kapalı.';
      } else {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <Shield size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Sigorta Acentesi</h1>
          <p className="text-gray-500">Hesabınıza giriş yapın</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-posta Adresi</label>
            <input
              type="email"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="ornek@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? (
                <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                    Giriş Yapılıyor...
                </>
            ) : 'Giriş Yap'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button onClick={() => toast.error('Yönetici ile iletişime geçiniz.')} className="text-gray-500 hover:text-blue-600 font-medium transition-colors">
            Şifremi Unuttum
          </button>
        </div>
      </div>
    </div>
  );
}
