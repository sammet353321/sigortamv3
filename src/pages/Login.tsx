import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login() {
  const isMounted = useRef(true);
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // Redirect if user is already logged in or just logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'admin') navigate('/admin/dashboard', { replace: true });
      else if (user.role === 'employee') navigate('/employee/dashboard', { replace: true });
      else if (user.role === 'sub_agent') navigate('/sub-agent/dashboard', { replace: true });
      else navigate('/unauthorized', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (loading) return;

    setLoading(true);
    setError(null);

    // Global Safety Timeout
    const safetyTimeout = setTimeout(() => {
        if (isMounted.current && loading) {
             console.warn('Login process timed out (safety trigger)');
             setLoading(false);
             toast.error('İşlem zaman aşımına uğradı.');
        }
    }, 15000); // 15 seconds

    try {
      if (!email || !password) {
          throw new Error('Lütfen e-posta ve şifrenizi giriniz.');
      }

      // Wrap signIn in a race with timeout
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      const timeoutPromise = new Promise<{ data: { user: null; session: null }; error: any }>((_, reject) => 
          setTimeout(() => reject(new Error('Supabase request timed out')), 10000)
      );

      const { data, error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) throw error;

      await checkRoleAndRedirect(data.session.user.id);

    } catch (err: any) {
      console.error('Login error:', err);
      
      // Handle AbortError specifically
      if (err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('signal is aborted')) {
        console.warn('Login request aborted, checking session status...');
        
        try {
            // Check if we actually have a session despite the abort
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                console.log('Session active despite abort, proceeding with redirect logic...');
                try {
                    await checkRoleAndRedirect(session.user.id);
                } catch (recoveryErr) {
                    console.error('Recovery redirect failed:', recoveryErr);
                    setLoading(false);
                    toast.error('Giriş işlemi tamamlanamadı (kurtarma hatası).');
                }
                return;
            }
        } catch (sessionCheckErr) {
            console.warn('Session check after abort failed:', sessionCheckErr);
        }
        
        setLoading(false);
        // Optional: toast.error('Bağlantı kesildi, lütfen tekrar deneyin.');
        return;
      }

      setLoading(false); // Only stop loading on error

      let errorMessage = 'Giriş yapılırken bir hata oluştu.';
      
      if (err?.message === 'Invalid login credentials') {
        errorMessage = 'Hatalı e-posta veya şifre.';
      } else if (err?.message?.includes('Email not confirmed')) {
        errorMessage = 'E-posta adresi doğrulanmamış. Lütfen yöneticinizle iletişime geçin.';
      } else if (err?.message?.includes('Email logins are disabled')) {
        errorMessage = 'E-posta ile giriş sistemi kapalı.';
      } else if (err?.message === 'Supabase request timed out') {
        errorMessage = 'Sunucu yanıt vermedi, lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
      } else {
        errorMessage = err?.message || 'Bilinmeyen bir hata oluştu.';
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
        clearTimeout(safetyTimeout);
    }
  };

  const checkRoleAndRedirect = async (userId: string) => {
      // Manual Role Check with Retry Strategy
      let retries = 3;
      let userData = null;
      
      while (retries > 0 && !userData) {
          try {
              if (!isMounted.current) break;
              
              const { data, error: roleError } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();
                
              if (roleError) {
                  if (roleError?.message?.includes('AbortError') || roleError?.message?.includes('signal is aborted')) {
                      console.warn(`Role fetch aborted, retrying... (${retries} left)`);
                      retries--;
                      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
                      continue;
                  }
                  throw roleError;
              }
              
              userData = data;
          } catch (err) {
              console.error('Role fetch attempt failed:', err);
              retries--;
              if (retries === 0) throw err; // Throw on last failure
              await new Promise(resolve => setTimeout(resolve, 500));
          }
      }

      if (userData && isMounted.current) {
          const role = userData.role;
          if (role === 'admin') navigate('/admin/dashboard', { replace: true });
          else if (role === 'employee') navigate('/employee/dashboard', { replace: true });
          else if (role === 'sub_agent') navigate('/sub-agent/dashboard', { replace: true });
          else navigate('/unauthorized', { replace: true });
          return;
      }
      
      // If we fall through here, wait for AuthContext or Timeout
      
      // Safety timeout: If redirect doesn't happen within 3 seconds (reduced from 5), try manual force
      setTimeout(async () => {
          if (isMounted.current) {
               // Last ditch effort: check session and user state
               const { data: { session } } = await supabase.auth.getSession();
               if (session) {
                   // If we have a session but stuck, maybe user cache is empty?
                   // Try to force navigation if we know the role (impossible without DB, but let's try reading from cache)
                   const cached = localStorage.getItem('app_user_cache');
                   if (cached) {
                       const u = JSON.parse(cached);
                       if (u.role === 'employee') {
                           navigate('/employee/dashboard', { replace: true });
                           return;
                       }
                   }
                   
                   setLoading(false);
                   toast.error('Giriş başarılı ancak yönlendirme yapılamadı. Sayfayı yenileyiniz.');
               } else {
                   setLoading(false);
                   toast.error('Giriş işlemi zaman aşımına uğradı.');
               }
          }
      }, 3000);
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
