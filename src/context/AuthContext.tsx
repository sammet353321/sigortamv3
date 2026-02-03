import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        // If there is an error (like invalid refresh token), we should clear the session
        supabase.auth.signOut();
        setLoading(false);
        return;
      }
      
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Unexpected error during session check:', err);
      setLoading(false);
      supabase.auth.signOut();
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Use maybeSingle to avoid PGRST116 if no row found
      
      if (error) throw error;
      
      if (data) {
        setUser(data);
      } else {
        // Force logout if public profile is missing to prevent stuck state
        console.warn('User profile not found in public table. Logging out.');
        await supabase.auth.signOut();
        setUser(null);
      }
    } catch (error) {
      console.warn('Error fetching profile:', error);
      // Don't sign out immediately on network error, just let it fail gracefully
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Error during sign out:', error);
      // Even if network fails, we should clear local state
    } finally {
      setUser(null);
      // Manually clear local storage if supabase fails to clean up due to network
      // This is a safety measure
      localStorage.removeItem('sb-aqubbkxsfwmhfbolkfah-auth-token');
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
