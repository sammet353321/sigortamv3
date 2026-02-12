import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Stale-While-Revalidate: Initialize from local storage if available
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('app_user_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  
  // Use Ref to track user state for event listeners (avoids stale closures)
  const userRef = useRef<User | null>(user);

  // Wrapper for setUser to sync Ref
  const setUser = (newUser: User | null) => {
      userRef.current = newUser;
      setUserState(newUser);
  };

  // If we have a cached user, we don't need to show loading initially (optimistic)
  const [loading, setLoading] = useState(() => !localStorage.getItem('app_user_cache'));

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        setUser(null);
        setLoading(false);
        localStorage.removeItem('app_user_cache'); // Clear invalid cache
        return;
      }
      
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
        if (userRef.current) {
            // If we had a cached user but no session, clear it
            setUser(null);
            localStorage.removeItem('app_user_cache');
        }
      }
    }).catch((err) => {
      // Ignore AbortError as it's likely due to component unmounting or race conditions
      if (err.name === 'AbortError' || err.message?.includes('AbortError') || err.message?.includes('signal is aborted')) {
        console.warn('Session check aborted, keeping previous state.');
        // Do NOT clear user on abort, might be a race condition during login
        setLoading(false);
        return;
      }
      console.error('Unexpected error during session check:', err);
      setLoading(false);
      setUser(null);
      localStorage.removeItem('app_user_cache');
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Sadece giriş yapıldığında loading'i aç, token yenilemede (alt-tab) açma
      if (event === 'SIGNED_IN') {
         // Only set loading if we don't have a user yet (to avoid flicker)
         // Check both Ref (current state) and LocalStorage (persistence)
         const hasUser = userRef.current || localStorage.getItem('app_user_cache');
         if (!hasUser) {
             setLoading(true);
         }
      } else if (event === 'SIGNED_OUT') {
         setUser(null);
         localStorage.removeItem('app_user_cache');
         setLoading(false);
      }
      
      // TOKEN_REFRESHED durumunda loading=true yapmıyoruz, arka planda profil güncellensin

      if (session?.user) {
        // If we are already loaded, this runs in background to update cache
        fetchProfile(session.user.id);
      } else if (event !== 'INITIAL_SESSION') { 
        // Don't clear user on INITIAL_SESSION null if we are waiting for getSession
        // But getSession handles the initial check.
        // If we explicitly get null session here (e.g. sign out), clear it.
        if (event === 'SIGNED_OUT') {
             // Already handled above
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, retryCount = 0) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); 
      
      if (error) throw error;
      
      if (data) {
        setUser(data);
        localStorage.setItem('app_user_cache', JSON.stringify(data));
        setLoading(false); // Success! Stop loading immediately
      } else {
        console.warn('User profile not found in public table. Logging out.');
        await signOut(); 
      }
    } catch (error: any) {
      console.warn('Error fetching profile:', error);
      
      // Retry on AbortError or Network Error
      if (retryCount < 3 && (error?.name === 'AbortError' || error?.message?.includes('AbortError') || error?.message?.includes('signal is aborted') || error?.message?.includes('fetch failed'))) {
          console.log(`Retrying profile fetch... (${retryCount + 1}/3)`);
          setTimeout(() => fetchProfile(userId, retryCount + 1), 1000);
          return; // Don't set loading false yet
      }
      
      // Profil çekilemezse oturumu kapatma, belki geçici bir ağ sorunudur
      // Sadece loading'i kapat
    } finally {
      if (retryCount >= 3 || !loading) {
         setLoading(false);
      }
    }
  }

  async function signOut() {
    try {
      // Önce yerel state'i temizle ki arayüz hemen tepki versin
      setUser(null);
      localStorage.removeItem('app_user_cache');
      
      // Sonra Supabase'den çıkış yapmayı dene
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.warn('Error during sign out (network or api):', error);
    } finally {
      // Her durumda yerel temizliği garantiye al
      setUser(null);
      localStorage.removeItem('app_user_cache');
      // Supabase'in localStorage key'ini temizle (proje ID'ye göre)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      try {
          const projectId = supabaseUrl.split('//')[1].split('.')[0];
          if (projectId) {
              localStorage.removeItem(`sb-${projectId}-auth-token`);
          }
      } catch (e) {
          console.warn('Could not parse project ID for cleanup', e);
          // Fallback to hardcoded if parse fails
          localStorage.removeItem('sb-aqubbkxsfwmhfbolkfah-auth-token');
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
