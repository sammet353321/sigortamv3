import { useAuth } from '@/context/AuthContext';
import { useNotification } from '@/context/NotificationContext';
import { LogOut, Bell, Shield, User, Users, FileText, BarChart3, Menu, X, MessageCircle, ShieldCheck, Smartphone, RefreshCw, Minus, CalendarX } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import GeminiTestModal from './GeminiTestModal';
import QuickQuotePanel from './QuickQuotePanel'; // Import the new component
import EmployeeNewQuote from '@/pages/employee/NewQuote'; // Import NewQuote directly
import WhatsAppMessages from '@/pages/employee/WhatsAppMessages'; // Import WhatsAppMessages

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
  
  // Chat Sidebar State
  const [isChatOpen, setIsChatOpen] = useState(false); // Initially closed
  const [isChatConnected, setIsChatConnected] = useState(false);

  // Check WhatsApp Connection Status
  useEffect(() => {
    if (!user) return;

    const checkConnection = async () => {
        const { data } = await supabase
            .from('whatsapp_sessions')
            .select('status')
            .eq('user_id', user.id)
            .single();
        
        if (data?.status === 'connected') {
            setIsChatConnected(true);
            // setIsChatOpen(true); // Auto open disabled by user request
        } else {
            setIsChatConnected(false);
        }
    };

    checkConnection();

    // Listen for status changes
    const channel = supabase
        .channel('whatsapp_status_layout')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_sessions', filter: `user_id=eq.${user.id}` }, 
        (payload) => {
            if (payload.new.status === 'connected') {
                setIsChatConnected(true);
                // setIsChatOpen(true); // Auto open disabled by user request
            } else {
                setIsChatConnected(false);
            }
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [user]);

  // Brand Name State
  const [brandName, setBrandName] = useState('SİGORTAM');

  // Notification State (Now managed by Context, local state removed/minimized)
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  // const [recentNotifications, setRecentNotifications] = useState<any[]>([]); // Derived from context now

  // New State for Full Screen Quote Modal (Employee)
  const [isEmployeeQuoteModalOpen, setIsEmployeeQuoteModalOpen] = useState(false);

  // Resizable Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(50); // Default 50%
  const [isResizing, setIsResizing] = useState(false);
  
  // Left Sidebar State (New)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false); // Default hidden ("gizliyelim")

  const startResizing = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
  };

  useEffect(() => {
      const stopResizing = () => setIsResizing(false);
      
      const resize = (e: MouseEvent) => {
          if (isResizing) {
              const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
              // Min 20%, Max 80%
              if (newWidth >= 20 && newWidth <= 80) {
                  setSidebarWidth(newWidth);
              }
          }
      };

      if (isResizing) {
          window.addEventListener('mousemove', resize);
          window.addEventListener('mouseup', stopResizing);
      }

      return () => {
          window.removeEventListener('mousemove', resize);
          window.removeEventListener('mouseup', stopResizing);
      };
  }, [isResizing]);

  const handleSync = async () => {
      try {
          if (!user) return;
          // Step 1: Set to disconnected to stop session
          await supabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('user_id', user.id);
          
          // Wait 2 seconds
          setTimeout(async () => {
              // Step 2: Set to connected to force restart/reload
              // We set qr_code to null to ensure it tries to load existing session
              await supabase.from('whatsapp_sessions').update({ status: 'connected', qr_code: null }).eq('user_id', user.id);
          }, 2000);

      } catch (error) {
          console.error('Sync error:', error);
      }
  };


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
        // Attempt Supabase signOut
        const { error } = await supabase.auth.signOut();
        if (error) {
             // Ignore network abort errors which happen if page navigates away immediately
             if (error.code !== '20' && !error.message?.includes('aborted') && !error.message?.includes('Failed to fetch')) {
                 console.error('SignOut error:', error);
             }
        }
    } catch (error: any) {
        // Ignore aborts
        if (!error.message?.includes('aborted')) {
            console.error('Logout error:', error);
        }
    } finally {
        // Soft redirect to login page (SPA navigation)
        navigate('/login');
    }
  };

  const handleOpenQuoteModal = () => {
      // Use Query Parameter to force the quote panel to open
      navigate('/employee/messages?open_quote=true');
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
    { label: 'Çalışanlar', path: '/admin/employees', icon: BarChart3, roles: ['admin'] },
    { label: 'WhatsApp Bağla', path: '/admin/whatsapp-connection', icon: Smartphone, roles: ['admin'] },
    { label: 'Yönetim', path: '/admin/management', icon: Users, roles: ['admin'] },
    
    // Employee Routes
    { label: 'Mesajlar', path: '/employee/messages', icon: MessageCircle, roles: ['employee'] },
    { label: 'WhatsApp Bağla', path: '/employee/whatsapp-connection', icon: Smartphone, roles: ['employee'] }, // New Link
    { label: 'Teklifler', path: '/employee/quotes', icon: FileText, roles: ['employee'] },
    { label: 'Yenilemeler', path: '/employee/renewals', icon: RefreshCw, roles: ['employee'] },
    { label: 'Geçenler', path: '/employee/expired-policies', icon: CalendarX, roles: ['employee'] },
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
      
      {/* Quick Quote Panel (Legacy/Alternative) */}
      <QuickQuotePanel isOpen={isQuickQuoteOpen} onClose={() => setIsQuickQuoteOpen(false)} />

      {/* Main Container */}
      <div className="flex h-screen overflow-hidden w-full relative">
        {/* Sidebar - Desktop */}
        {/* Hide sidebar if on Quote Detail page (Policy Finalization) */}
        {!location.pathname.match(/\/employee\/quotes\/[^/]+$/) && (
        <aside 
            className={clsx(
                "md:flex-col w-64 bg-slate-900 text-white relative z-20 h-full transition-all duration-300 ease-in-out absolute md:static left-0 top-0 bottom-0 shadow-2xl md:shadow-none",
                isLeftSidebarOpen ? "flex" : "hidden"
            )}
        >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-blue-800/50">
              <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <ShieldCheck className="text-white" size={20} />
                  </div>
                  <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200 truncate max-w-[140px]">
                    {brandName}
                  </span>
              </div>
              {/* Close Button for Sidebar */}
              <button 
                onClick={() => setIsLeftSidebarOpen(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              >
                  <X size={20} />
              </button>
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
                        onClick={handleOpenQuoteModal}
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
        )}

        {/* Main Content + Right Sidebar Container */}
        <div className="flex-1 flex min-w-0 bg-gray-50 overflow-hidden relative">
            
            {/* Main Page Content */}
            <div className="flex-1 flex flex-col min-w-0 relative h-full">
            
                {/* Mobile Header */}
                <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center z-20 relative shadow-md">
                    <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <ShieldCheck className="text-white" size={20} />
                    </div>
                    <span className="font-bold text-lg truncate max-w-[150px]">{brandName}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Mobile Notification Bell Removed */}
                        
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
                                    onClick={() => { handleOpenQuoteModal(); setIsMobileMenuOpen(false); }}
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
                    "flex-1 min-w-0 flex flex-col h-full",
                    // Remove specific conditions, make it generic for better layout handling
                    (location.pathname === '/employee/messages' || location.pathname.includes('/policies') || location.pathname.includes('/quotes'))
                        ? 'overflow-hidden' 
                        : 'overflow-y-auto p-4 md:p-8'
                )}>
                    {/* Persistent Toggle Button for Desktop when Sidebar is closed */}
                    {!isLeftSidebarOpen && (
                        <div className="absolute top-4 left-4 z-50 animate-in fade-in duration-300">
                             <button 
                                onClick={() => setIsLeftSidebarOpen(true)}
                                className="p-2 bg-slate-900 text-white rounded-lg shadow-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
                             >
                                 <ShieldCheck size={20} className="text-blue-400" />
                                 <span className="font-bold text-sm hidden sm:inline">{brandName}</span>
                                 <Menu size={18} className="ml-1 text-gray-400" />
                             </button>
                        </div>
                    )}

                    <div className={clsx(
                        "flex-1 flex flex-col min-h-0", // Ensure flex container handles height correctly
                        (location.pathname === '/employee/messages' || location.pathname.includes('/policies') || location.pathname.includes('/quotes')) ? 'h-full' : 'max-w-7xl mx-auto w-full'
                    )}>
                        {location.pathname !== '/employee/messages' && !location.pathname.includes('/policies') && !location.pathname.includes('/quotes') && (
                        <header className="hidden md:flex justify-between items-center mb-8 shrink-0">
                            <h2 className="text-2xl font-bold text-gray-800">
                            {navItems.find(i => location.pathname.startsWith(i.path))?.label || 'Panel'}
                            </h2>
                            <div className="flex items-center space-x-4">
                                <div className="relative">
                                    {/* Notification Panel Removed */}
                                </div>
                            </div>
                        </header>
                        )}
                        <div className="flex-1 min-h-0 flex flex-col">
                            <Outlet />
                        </div>
                    </div>
                </main>

                {/* Toggle Button (Floating) */}
                {!isChatOpen && user.role === 'employee' && location.pathname !== '/employee/messages' && (
                  <button 
                      onClick={() => setIsChatOpen(true)}
                      className={clsx(
                          "absolute bottom-6 right-6 p-4 rounded-full shadow-lg z-40 transition-all flex items-center gap-2",
                          isChatConnected 
                            ? "bg-green-500 text-white hover:bg-green-600 hover:scale-110" 
                            : "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                      )}
                      title={isChatConnected ? "Mesajları Göster" : "WhatsApp Bağlı Değil"}
                  >
                      <MessageCircle size={28} />
                      {!isChatConnected && (
                          <span className="text-sm font-bold whitespace-nowrap pr-1">Bağlı Değil</span>
                      )}
                  </button>
                )}
            </div>

            {/* Right Sidebar (Chat) */}
            {user.role === 'employee' && location.pathname !== '/employee/messages' && (
                <div 
                    className={clsx(
                        "border-l border-gray-200 bg-white flex flex-col h-full relative z-30 shadow-xl",
                        // Only animate if NOT resizing to prevent lag
                        !isResizing && "transition-all duration-300 ease-in-out"
                    )}
                    style={{
                        width: isChatOpen ? `${sidebarWidth}%` : '0px',
                        minWidth: isChatOpen ? '350px' : '0px'
                    }}
                >
                    {/* Resize Handle (Invisible Splitter) */}
                    {isChatOpen && (
                        <div 
                            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-50 hover:bg-blue-400/50 transition-colors"
                            onMouseDown={startResizing}
                        />
                    )}

                    {isChatOpen && (
                        <>
                            <div className="flex justify-between items-center p-3 border-b bg-gray-50 shrink-0 select-none">
                                  <span className="font-bold text-gray-700 flex items-center gap-2">
                                      <MessageCircle size={18} className="text-green-600"/>
                                      WhatsApp
                                  </span>
                                  <div className="flex items-center gap-1">
                                      <button 
                                          onClick={handleSync} 
                                          className="p-1 hover:bg-gray-200 rounded text-blue-600 transition-colors"
                                          title="Bağlantıyı Yenile ve Mesajları İndir"
                                      >
                                          <RefreshCw size={18} />
                                      </button>
                                      <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors">
                                          <Minus size={20} />
                                      </button>
                                  </div>
                            </div>
                            <div className="flex-1 overflow-hidden h-full">
                                <WhatsAppMessages embedded={true} hideSidebar={false} /> 
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
