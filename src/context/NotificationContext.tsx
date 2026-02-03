import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

// Short beep sound (base64)
const BEEP_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'; 

interface Notification {
    id: string;
    type: 'info' | 'warning' | 'success' | 'error';
    content: string;
    is_read: boolean;
    created_at: string;
    metadata?: any;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    clearNotifications: () => Promise<void>;
    playNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [audio] = useState(new Audio(BEEP_SOUND));

    useEffect(() => {
        if (!user) {
            setNotifications([]);
            return;
        }

        fetchNotifications();

        // Subscribe to NEW notifications (inserted by DB triggers)
        const channel = supabase
            .channel('realtime-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    setNotifications(prev => [newNotif, ...prev]);
                    playNotification();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    async function fetchNotifications() {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) {
                console.warn('Failed to fetch notifications:', error.message);
                return;
            }
            setNotifications(data || []);
        } catch (err) {
            console.warn('Error fetching notifications:', err);
        }
    }

    // Helper to manually create notification (if needed by client-side logic, e.g. error alerts)
    async function createNotification(notif: Partial<Notification>) {
        const { error } = await supabase.from('notifications').insert([notif]);
        if (error) console.error('Failed to create notification', error);
    }

    const playNotification = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    };

    const markAsRead = async (id: string) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const markAllAsRead = async () => {
        if (!user) return;
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    const clearNotifications = async () => {
        if (!user) return;
        await supabase.from('notifications').delete().eq('user_id', user.id);
        setNotifications([]);
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <NotificationContext.Provider value={{ 
            notifications, 
            unreadCount, 
            markAsRead, 
            markAllAsRead, 
            clearNotifications,
            playNotification 
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
