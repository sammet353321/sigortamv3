import { useAuth } from '@/context/AuthContext';
import { useNotification } from '@/context/NotificationContext';
import { LogOut, Bell, Shield, User, Users, FileText, BarChart3, Menu, X, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import GeminiTestModal from './GeminiTestModal';
import QuickQuotePanel from './QuickQuotePanel'; // Import the new component

export default function Layout() {
  const { user } = useAuth();
  // Don't destructure signOut from useAuth if we implement custom handleSignOut calling supabase directly or verify useAuth implementation
  const { playNotification, unreadCount, notifications, markAllAsRead } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // New State for Quick Quote Panel
  const [isQuickQuoteOpen, setIsQuickQuoteOpen] = useState(false);

  // Brand Name State
  const [brandName, setBrandName] = useState('SİGORTAM');

  // Notification State (Now managed by Context, local state removed/minimized)
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  // const [recentNotifications, setRecentNotifications] = useState<any[]>([]); // Derived from context now


  // Real-time Notification Listener
  useEffect(() => {
    if (!user) return;

    // Fetch Brand Name
    const fetchBrandName = async () => {
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'brand_name')
                .single();
            
            if (data?.value) {
                setBrandName(data.value);
            }
        } catch (error) {
            console.error('Error fetching brand name:', error);
        }
    };
    fetchBrandName();

    return () => {};
  }, [user]);

  const handleSignOut = async () => {
    try {
        // Attempt Supabase signOut but force navigation even if it fails
        const { error } = await supabase.auth.signOut();
        if (error) {
             if (error.code !== '20' && !error.message?.includes('aborted')) {
                 console.error('SignOut error:', error);
             }
        }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (!user) return null;

  // We use notifications from context for the panel list
  const recentNotifications = notifications.slice(0, 5);
  
  const navItems = [
    { label: 'Panel', path: `/${user.role.replace('_', '-')}/dashboard`, icon: BarChart3, roles: ['admin', 'employee', 'sub_agent'] },
    // Admin Routes
    { label: 'Teklifler', path: '/admin/quotes', icon: FileText, roles: ['admin'] },
    { label: 'Poliçeler', path: '/admin/policies', icon: Shield, roles: ['admin'] },
    { label: 'Taliler', path: '/admin/sub-agents', icon: Users, roles: ['admin'] },
    { label: 'WhatsApp Bağla', path: '/admin/whatsapp-connection', icon: Smartphone, roles: ['admin'] },
    { label: 'Yönetim', path: '/admin/management', icon: Users, roles: ['admin'] },
    
    // Employee Routes
    { label: 'Mesajlar', path: '/employee/messages', icon: MessageCircle, roles: ['employee'] },
    { label: 'WhatsApp Bağla', path: '/employee/whatsapp-connection', icon: Smartphone, roles: ['employee'] }, // New Link
    { label: 'Teklifler', path: '/employee/quotes', icon: FileText, roles: ['employee'] },
    { label: 'Poliçeler', path: '/employee/policies', icon: Shield, roles: ['employee'] },
    
    // Sub-Agent Routes
    { label: 'Teklifler', path: '/sub-agent/quotes', icon: FileText, roles: ['sub_agent'] },
    { label: 'Poliçeler', path: '/sub-agent/policies', icon: Shield, roles: ['sub_agent'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Test Modal */}
      <GeminiTestModal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} />
      
      {/* Quick Quote Panel */}
      <QuickQuotePanel isOpen={isQuickQuoteOpen} onClose={() => setIsQuickQuoteOpen(false)} />

      {/* Main Container */}
      <div className="flex h-screen overflow-hidden w-full">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:flex md:flex-col w-64 bg-slate-900 text-white relative z-20">
            {/* Header */}
            <div className="p-4 flex items-center space-x-2 border-b border-blue-800/50">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                <ShieldCheck className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200 truncate max-w-[180px]">
                {brandName}
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                    location.pathname.startsWith(item.path) 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <item.icon size={20} className="group-hover:scale-110 transition-transform duration-200" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* User Profile & Quick Action */}
            <div className="p-4 border-t border-blue-800 hidden md:block">
                  {user.role === 'employee' && (
                      <button 
                        onClick={() => setIsQuickQuoteOpen(true)}
                        className="flex items-center space-x-2 text-white bg-blue-600 hover:bg-blue-500 w-full px-4 py-2 rounded-lg mb-2 shadow-sm transition-all"
                      >
                        <FileText size={18} />
                        <span className="font-bold">TEKLİF OLUŞTUR</span>
                      </button>
                  )}

              <div className="flex items-center space-x-3 mb-4">
                 <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center">
                    <span className="font-bold text-sm text-blue-100">
                      {user.email?.substring(0, 2).toUpperCase()}
                    </span>
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user.name || 'Kullanıcı'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {user.role === 'admin' ? 'Yönetici' : user.role === 'employee' ? 'Personel' : 'Acente'}
                    </p>
                 </div>
              </div>
              
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 text-slate-400 hover:text-red-400 transition-colors w-full px-2 py-1"
              >
                <LogOut size={18} />
                <span className="text-sm font-medium">Çıkış Yap</span>
              </button>
            </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
            {/* Mobile Header */}
            <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center z-20 relative shadow-md">
                <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <ShieldCheck className="text-white" size={20} />
                </div>
                <span className="font-bold text-lg truncate max-w-[150px]">{brandName}</span>
                </div>
                <div className="flex items-center space-x-4">
                    {/* Mobile Notification Bell */}
                    <button 
                        onClick={() => setIsNotificationPanelOpen(!isNotificationPanelOpen)} 
                        className="relative text-gray-300 hover:text-white"
                    >
                        <Bell size={24} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center border-2 border-slate-900">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900 text-white md:hidden flex flex-col">
                    <div className="p-4 flex justify-between items-center border-b border-blue-800">
                        <span className="font-bold text-xl">MENÜ</span>
                        <button onClick={() => setIsMobileMenuOpen(false)}>
                            <X size={24} />
                        </button>
                    </div>
                    <nav className="flex-1 p-4 space-y-2">
                        {filteredNavItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-800"
                            >
                                <item.icon size={20} />
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </nav>
                    <div className="p-4 border-t border-blue-800">
                         {user.role === 'employee' && (
                            <button 
                                onClick={() => { setIsQuickQuoteOpen(true); setIsMobileMenuOpen(false); }}
                                className="flex items-center space-x-2 text-white bg-blue-600 w-full px-4 py-3 rounded-lg mb-4 justify-center"
                            >
                                <FileText size={18} />
                                <span className="font-bold">TEKLİF OLUŞTUR</span>
                            </button>
                         )}
                        <button onClick={handleSignOut} className="flex items-center space-x-2 text-red-300 w-full px-4 py-2">
                            <LogOut size={18} />
                            <span>Çıkış Yap</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Desktop Header & Content */}
            <main className={clsx(
                "flex-1 min-w-0",
                location.pathname === '/employee/messages' 
                    ? 'overflow-hidden flex flex-col' 
                    : 'overflow-y-auto p-4 md:p-8'
            )}>
                <div className={clsx(
                    location.pathname === '/employee/messages' ? 'h-full' : 'max-w-7xl mx-auto'
                )}>
                    {location.pathname !== '/employee/messages' && (
                    <header className="hidden md:flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-bold text-gray-800">
                        {navItems.find(i => location.pathname.startsWith(i.path))?.label || 'Panel'}
                        </h2>
                        <div className="flex items-center space-x-4">
                            <div className="relative">
                                <button 
                                    onClick={() => {
                                        setIsNotificationPanelOpen(!isNotificationPanelOpen);
                                        if (!isNotificationPanelOpen) {
                                            // setUnreadCount(0);
                                        }
                                    }} 
                                    className="p-2 text-gray-500 hover:text-amber-500 transition-colors relative"
                                >
                                    <Bell size={24} />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center border-2 border-white">
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                    )}
                                </button>
                                
                                {isNotificationPanelOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                                            <h3 className="font-bold text-gray-800 text-sm">Bildirimler</h3>
                                            {unreadCount > 0 && (
                                                <button onClick={() => markAllAsRead()} className="text-xs text-blue-600 hover:underline">Tümünü Okundu Say</button>
                                            )}
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {recentNotifications.length === 0 ? (
                                                <div className="p-8 text-center text-gray-400 text-sm">Yeni bildirim yok.</div>
                                            ) : (
                                                <div className="divide-y divide-gray-100">
                                                    {recentNotifications.map((notif) => (
                                                        <div key={notif.id} className={`p-3 hover:bg-blue-50 transition-colors cursor-pointer flex items-start space-x-3 ${!notif.is_read ? 'bg-blue-50/50' : ''}`}>
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                notif.type === 'success' ? 'bg-green-100 text-green-600' :
                                                                notif.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                                                notif.type === 'error' ? 'bg-red-100 text-red-600' :
                                                                'bg-blue-100 text-blue-600'
                                                            }`}>
                                                                <MessageCircle size={14} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-gray-800 truncate">{notif.content}</p>
                                                                <p className="text-[10px] text-gray-400 mt-1">{new Date(notif.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2 border-t border-gray-100 bg-gray-50 text-center">
                                            <Link to="/employee/messages" onClick={() => setIsNotificationPanelOpen(false)} className="text-xs font-bold text-blue-600 hover:text-blue-800 block w-full py-1">
                                                Tüm Mesajları Gör
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>
                    )}
                    <Outlet />
                </div>
            </main>
        </div>
      </div>
    </div>
  );
}
