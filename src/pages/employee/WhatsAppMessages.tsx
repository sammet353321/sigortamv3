import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Search, Send, Paperclip, FileText, User, Users, ChevronDown, X, ZoomIn, ZoomOut, RotateCcw, Filter, Car, Ban, RefreshCw, CheckCircle, Download, MoreVertical } from 'lucide-react';
import { format, isToday, subDays } from 'date-fns';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import EmployeeNewQuote from './NewQuote';

interface ChatGroup {
    id: string;
    name: string;
    assigned_employee_group_id?: string;
    is_whatsapp_group?: boolean;
    group_jid?: string;
    created_by?: string;
}

interface ChatGroupMember {
    id: string;
    phone: string;
    name: string | null;
    group_id?: string;
}

interface Message {
    id: string;
    whatsapp_message_id?: string;
    quoted_message_id?: string;
    sender_phone: string;
    sender_name?: string;
    direction: 'inbound' | 'outbound';
    type: 'text' | 'image' | 'document' | 'video' | 'audio';
    content: string;
    media_url: string | null;
    created_at: string;
    group_id?: string;
    user_id?: string;
}

interface EmployeeGroup {
    id: string;
    name: string;
}

// Helper Component for Individual Messages - Optimized with Memo
const MessageItem = React.memo(({ 
    msg, 
    member, 
    user, 
    messages,
    myPhone, 
    activeSessionPhone,
    onContextMenu, 
    onOpenViewer, 
    onSetQuotePanel, 
    onDownload,
    onToast
}: {
    msg: Message,
    member?: ChatGroupMember,
    user: any,
    messages: Message[],
    myPhone: string | null,
    activeSessionPhone?: string | null,
    onContextMenu: (e: React.MouseEvent, msg: Message) => void,
    onOpenViewer: (url: string) => void,
    onSetQuotePanel: (data: any) => void,
    onDownload: (url: string, filename: string) => void,
    onToast: (msg: string) => void
}) => {
    const [imageLoaded, setImageLoaded] = useState(false);

    // Helper to format sender name (Local version)
    const getSenderLabel = () => {
         // Enhanced Check: Normalize phones to last 10 digits for comparison
         const cleanSender = msg.sender_phone ? msg.sender_phone.replace(/\D/g, '').slice(-10) : '';
         const cleanMyPhone = myPhone ? myPhone.replace(/\D/g, '').slice(-10) : (user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '');
         const cleanActiveSession = activeSessionPhone ? activeSessionPhone.replace(/\D/g, '').slice(-10) : '';
         
         // Check if message is effectively from me
         const isMe = msg.direction === 'outbound' || 
                      (cleanSender && cleanMyPhone && cleanSender === cleanMyPhone) ||
                      (cleanSender && cleanActiveSession && cleanSender === cleanActiveSession) ||
                      (msg.whatsapp_message_id?.startsWith('true_') && msg.direction === 'inbound' && cleanSender === cleanActiveSession) ||
                      (msg.sender_phone === '264467191431322') || // Explicit LID Fix for "koc sigorta samet"
                      (msg.sender_name?.toLowerCase().includes('koc sigorta') && msg.sender_phone?.length > 12); // Heuristic Fix for LIDs
         
         if (isMe) {
             return user?.name || 'Ben';
         }
         
         if (member?.name && member.name !== member.phone) return member.name;
         if (msg.sender_name) return msg.sender_name;
         let phone = msg.sender_phone || '';
         if (phone.includes(':')) phone = phone.split(':')[0];
         if (phone.length > 15) return 'WhatsApp Kullanıcısı';
         return phone; 
    };
    
    // Determine alignment based on direction OR phone match
    const cleanSender = msg.sender_phone ? msg.sender_phone.replace(/\D/g, '').slice(-10) : '';
    const cleanMyPhone = myPhone ? myPhone.replace(/\D/g, '').slice(-10) : (user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '');
    const cleanActiveSession = activeSessionPhone ? activeSessionPhone.replace(/\D/g, '').slice(-10) : '';

    // Logic Fix: Check if message is outbound OR if sender is ME (regardless of direction flag in DB)
    const isOutbound = msg.direction === 'outbound' || 
                       (cleanSender && cleanMyPhone && cleanSender === cleanMyPhone) ||
                       (cleanSender && cleanActiveSession && cleanSender === cleanActiveSession) ||
                       (msg.sender_phone === '264467191431322') || // Explicit LID Fix
                       (msg.sender_name?.toLowerCase().includes('koc sigorta') && msg.sender_phone?.length > 12);

    // Color Generation for Members - More Vibrant
    const getMemberColor = (phone: string) => {
        const colors = [
            'text-red-700', 'text-orange-700', 'text-amber-700', 'text-green-700', 
            'text-emerald-700', 'text-teal-700', 'text-cyan-700', 'text-blue-700', 
            'text-indigo-700', 'text-violet-700', 'text-purple-700', 'text-fuchsia-700', 'text-pink-700',
            'text-rose-700', 'text-lime-700'
        ];
        let hash = 0;
        for (let i = 0; i < phone.length; i++) {
            hash = phone.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    // Handle Protocol/Deleted Messages
    if (msg.content && (msg.content.includes('[Desteklenmeyen Mesaj Tipi: protocolMessage]') || msg.type === 'revoked' as any)) {
         return (
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} opacity-60`}>
                 <div className={`max-w-[70%] rounded-lg p-2 shadow-sm italic text-xs bg-gray-100 text-gray-500 border border-gray-200 flex items-center gap-1`}>
                     <Ban size={12} />
                     Mesaj silindi
                 </div>
            </div>
         );
    }

    return (
        <div 
            id={`msg-${msg.id}`}
            className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} mb-2`}
        >
            <span className={`text-[11px] mb-0.5 px-1 font-extrabold tracking-wide ${isOutbound ? 'text-gray-600' : getMemberColor(msg.sender_phone)}`}>
                {getSenderLabel()}
            </span>
            <div 
                className={`max-w-[85%] sm:max-w-[70%] rounded-xl p-3 shadow-sm relative text-sm ${
                    isOutbound 
                        ? 'bg-[#d9fdd3] rounded-tr-none text-gray-900' 
                        : 'bg-white rounded-tl-none text-gray-900'
                }`}
                onContextMenu={(e) => onContextMenu(e, msg)}
            >
                {/* Quoted Message Display */}
                {msg.quoted_message_id && (
                    <div className={`mb-2 p-2 rounded text-xs border-l-4 bg-opacity-50 ${
                        isOutbound 
                            ? 'bg-green-100 border-green-600 text-gray-700' 
                            : 'bg-gray-100 border-gray-400 text-gray-700'
                    }`}>
                        {(() => {
                            const quoted = messages.find(m => m.whatsapp_message_id === msg.quoted_message_id || m.id === msg.quoted_message_id);
                            return quoted ? (
                                <div className="cursor-pointer" onClick={(e) => {
                                    e.stopPropagation();
                                    const el = document.getElementById(`msg-${quoted.id}`);
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}>
                                    <span className="font-bold block mb-0.5 text-[10px] text-blue-600">{quoted.sender_name || quoted.sender_phone}</span>
                                    <span className="line-clamp-2">{quoted.content || (quoted.type === 'image' ? '📷 Görsel' : '...')}</span>
                                </div>
                            ) : (
                                <span className="italic">Alıntılanan mesaj yüklenemedi</span>
                            );
                        })()}
                    </div>
                )}

                {msg.type === 'image' && msg.media_url && (
                    <div className="mb-2 flex flex-col">
                        <img 
                            src={msg.media_url} 
                            alt="Görsel" 
                            onLoad={() => setImageLoaded(true)}
                            onClick={() => onOpenViewer(msg.media_url!)}
                            className={`rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity ${imageLoaded ? 'block' : 'hidden'}`}
                            title="Büyütmek için sol tık, Menü için sağ tık"
                        />
                        {!imageLoaded && (
                            <div className="h-40 w-40 bg-gray-100 rounded-lg flex items-center justify-center animate-pulse">
                                <span className="text-gray-400 text-xs">Yükleniyor...</span>
                            </div>
                        )}
                        
                        {/* Buttons - Only show when image is loaded */}
                        {imageLoaded && !isOutbound && (
                            <div className="flex gap-1 mt-2 animate-in fade-in duration-300">
                                <button 
                                    onClick={() => {
                                        onSetQuotePanel({
                                            isOpen: true,
                                            data: {
                                                source: 'whatsapp',
                                                imageUrl: msg.media_url!,
                                                customerPhone: msg.sender_phone,
                                                quoteType: 'TRAFİK',
                                                autoScan: true
                                            }
                                        });
                                    }}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] py-1.5 rounded flex items-center justify-center transition-colors font-medium shadow-sm"
                                >
                                    <FileText size={12} className="mr-1" />
                                    TRAFİK
                                </button>
                                <button 
                                    onClick={() => {
                                        onSetQuotePanel({
                                            isOpen: true,
                                            data: {
                                                source: 'whatsapp',
                                                imageUrl: msg.media_url!,
                                                customerPhone: msg.sender_phone,
                                                quoteType: 'KASKO',
                                                autoScan: true
                                            }
                                        });
                                    }}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] py-1.5 rounded flex items-center justify-center transition-colors font-medium shadow-sm"
                                >
                                    <Car size={12} className="mr-1" />
                                    KASKO
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Document Display */}
                {msg.type === 'document' && (
                    <div 
                        className="mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3 min-w-[220px] cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => {
                            // If PDF, open viewer
                            if (msg.content.toLowerCase().endsWith('.pdf') || msg.media_url?.toLowerCase().endsWith('.pdf')) {
                                onOpenViewer(msg.media_url || '');
                            } else {
                                msg.media_url && onDownload(msg.media_url, msg.content || 'belge');
                            }
                        }}
                        title="Görüntüle / İndir"
                    >
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600 shrink-0">
                            <FileText size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate" title={msg.content}>
                                {msg.content || 'Belge'}
                            </div>
                            <div className="text-xs text-gray-500">PDF / Belge</div>
                        </div>
                        <Download size={16} className="text-gray-400" />
                    </div>
                )}

                {/* Fallback for broken images or text messages */}
                {msg.content && !msg.content.includes('[Desteklenmeyen Mesaj Tipi:') && (
                    <p className="text-[15px] text-gray-900 whitespace-pre-wrap font-semibold leading-relaxed">{msg.content}</p>
                )}
                
                {/* Unsupported Message Fallback */}
                {msg.content && msg.content.includes('[Desteklenmeyen Mesaj Tipi: documentWithCaptionMessage]') && (
                     <div className="text-xs italic text-gray-500 bg-yellow-50 p-2 rounded border border-yellow-200">
                        <FileText size={12} className="inline mr-1"/>
                        Belge (İşlenemedi)
                     </div>
                )}
                
                <span className="text-[10px] text-gray-500 block text-right mt-1">
                    {isToday(new Date(msg.created_at)) 
                        ? format(new Date(msg.created_at), 'HH:mm')
                        : format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm')
                    }
                </span>
            </div>
        </div>
    );
});

export default function WhatsAppMessages({ embedded, initialGroupId, hideSidebar }: { embedded?: boolean, initialGroupId?: string | null, hideSidebar?: boolean }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<ChatGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId || null);
    const [groupMembers, setGroupMembers] = useState<ChatGroupMember[]>([]);
    const [selectedTargetMember, setSelectedTargetMember] = useState<ChatGroupMember | null>(null);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Group Filter State
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
    const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);

    // Image/PDF Viewer State
    const [viewerUrl, setViewerUrl] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Split Screen Quote Panel State
    const [quotePanel, setQuotePanel] = useState<{ isOpen: boolean; data: any }>({ isOpen: false, data: null });

    // Current Group Details State
    const [currentGroup, setCurrentGroup] = useState<ChatGroup | null>(null);

    // Reply & Context Menu State
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, msg: Message } | null>(null);

    // Caches and Preload State
    const messagesCache = useRef<Record<string, Message[]>>({});
    const membersCache = useRef<Record<string, ChatGroupMember[]>>({});
    const allMessagesLoaded = useRef(false);
    const isPreloading = useRef(false);

    // WhatsApp Connection State
    const [isWhatsAppConnected, setIsWhatsAppConnected] = useState<boolean | null>(null);
    const [myPhone, setMyPhone] = useState<string | null>(null);
    const [activeSessionPhone, setActiveSessionPhone] = useState<string | null>(null);

    // Close context menu on click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // Sync initialGroupId if provided
    useEffect(() => {
        if (initialGroupId) setSelectedGroupId(initialGroupId);
    }, [initialGroupId]);

    // Check for openQuotePanel in navigation state or query params
    useEffect(() => {
        const state = location.state as any;
        const openQuoteQuery = searchParams.get('open_quote') === 'true';

        if ((state?.openQuotePanel || openQuoteQuery) && !quotePanel.isOpen) {
             setQuotePanel({
                 isOpen: true,
                 data: {
                     quoteType: 'TRAFİK', 
                     groupId: selectedGroupId 
                 }
             });
        }
    }, [location.state, searchParams]);
    
    // ESC to close viewer
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setViewerUrl(null);
        };
        if (viewerUrl) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewerUrl]);

    // Check WhatsApp Connection Status
    const checkConnection = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('whatsapp_sessions')
                .select('status, phone_number')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Connection check error:', error);
                return;
            }

            const isConnected = data?.status === 'connected';
            setIsWhatsAppConnected(isConnected);
            if (data?.phone_number) setMyPhone(data.phone_number);
        } catch (err) {
            console.error('Connection check failed:', err);
        }
    };

    useEffect(() => {
        checkConnection();
        
        const channel = supabase
            .channel(`session-status-${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'whatsapp_sessions',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                const newStatus = payload.new.status;
                setIsWhatsAppConnected(newStatus === 'connected');
                if (payload.new.phone_number) setMyPhone(payload.new.phone_number);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user]);

    // Mark All as Read Function (Global)
    async function markAllAsRead() {
        try {
            setGroupsMetadata(prev => {
                const newState = { ...prev };
                Object.keys(newState).forEach(key => {
                    if (newState[key]) {
                        newState[key] = { ...newState[key], unreadCount: 0 };
                    }
                });
                return newState;
            });

            const { error } = await supabase
                .from('messages')
                .update({ status: 'read' })
                .eq('direction', 'inbound')
                .neq('status', 'read');
            
            if (error) throw error;
            showToast('Tüm mesajlar okundu olarak işaretlendi.');
        } catch (error) {
            console.error('Mark all read error:', error);
            showToast('İşlem başarısız.');
        }
    }

    const handleSync = async () => {
        try {
            if (!user) return;
            await supabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('user_id', user.id);
            showToast('Bağlantı yenileniyor...');

            setTimeout(async () => {
                await supabase.from('whatsapp_sessions').update({ status: 'connected', qr_code: null }).eq('user_id', user.id);
                setTimeout(() => {
                    checkConnection();
                    fetchChatGroups();
                }, 1500);
            }, 2000);
        } catch (error) {
            console.error('Sync error:', error);
            showToast('Yenileme başarısız.');
        }
    };

    // 1. Fetch Initial Data (Groups)
    useEffect(() => {
        if (user && isWhatsAppConnected) fetchInitialData();
    }, [user, isWhatsAppConnected]);

    async function fetchInitialData() {
        try {
            const { data: allGroups } = await supabase.from('employee_groups').select('id, name').order('name');
            setEmployeeGroups(allGroups || []);

            if (user?.role === 'employee') {
                const { data: myMemberships } = await supabase
                    .from('employee_group_members')
                    .select('group_id')
                    .eq('user_id', user.id);
                
                const ids = myMemberships?.map(m => m.group_id) || [];
                setMyGroupIds(ids);
                
                if (ids.length > 0) {
                    setActiveFilter('my_groups');
                } else {
                    setActiveFilter('all');
                }
            } else {
                setActiveFilter('all');
            }
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    }

    // 2. Fetch Chat Groups based on Filter
    useEffect(() => {
        if (activeFilter) {
            fetchChatGroups();
        }
    }, [activeFilter, myGroupIds]); 
    
    // Metadata State
    const [groupsMetadata, setGroupsMetadata] = useState<Record<string, { unreadCount: number, lastMessageTime: string }>>({});

    // Global Message Listener (For Sorting & Caching)
    useEffect(() => {
        const channel = supabase
            .channel('global-messages-listener')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                 const newMsg = payload.new as any;
                 
                 // Update metadata for this group
                 setGroupsMetadata(prev => {
                     const current = prev[newMsg.group_id] || { unreadCount: 0, lastMessageTime: '' };
                     return {
                         ...prev,
                         [newMsg.group_id]: {
                             unreadCount: newMsg.direction === 'inbound' ? current.unreadCount + 1 : current.unreadCount,
                             lastMessageTime: newMsg.created_at
                         }
                     };
                 });

                 // Update CACHE directly
                 if (newMsg.group_id) {
                     const currentCache = messagesCache.current[newMsg.group_id] || [];
                     const exists = currentCache.some(m => m.id === newMsg.id);
                     if (!exists) {
                         messagesCache.current[newMsg.group_id] = [...currentCache, newMsg];
                         // FIX: Do NOT update UI here if this group is selected. 
                         // The dedicated group listener handles UI updates and optimistic UI (deduplication).
                         // Updating here causes double messages because this listener doesn't know about temp messages.
                         /* 
                         if (selectedGroupId === newMsg.group_id) {
                             setMessages(prev => [...prev, newMsg]);
                         }
                         */
                     }
                 }
                 
                 if (!groups.some(g => g.id === newMsg.group_id)) {
                     fetchChatGroups();
                 }
            })
            .subscribe();
        
        return () => { supabase.removeChannel(channel); };
    }, [groups, selectedGroupId]);

    useEffect(() => {
        if (groups.length === 0) return;

        const fetchMetadata = async () => {
            const groupIds = groups.map(g => g.id);
            if (groupIds.length === 0) return;

            const { data: unreadData } = await supabase
                .from('messages')
                .select('group_id, created_at')
                .in('group_id', groupIds)
                .eq('direction', 'inbound')
                .neq('status', 'read')
                .order('created_at', { ascending: false });
                
            const { data: lastMsgData } = await supabase
                .from('messages')
                .select('group_id, created_at')
                .in('group_id', groupIds)
                .order('group_id')
                .order('created_at', { ascending: false });
            
            const meta: Record<string, { unreadCount: number, lastMessageTime: string }> = {};
            
            unreadData?.forEach(m => {
                if (!meta[m.group_id!]) meta[m.group_id!] = { unreadCount: 0, lastMessageTime: '' };
                meta[m.group_id!].unreadCount++;
            });

            const seenGroups = new Set();
            lastMsgData?.forEach(m => {
                if (!seenGroups.has(m.group_id)) {
                    seenGroups.add(m.group_id);
                    if (!meta[m.group_id!]) meta[m.group_id!] = { unreadCount: 0, lastMessageTime: '' };
                    meta[m.group_id!].lastMessageTime = m.created_at;
                }
            });

            setGroupsMetadata(meta);
        };

        fetchMetadata();
        const interval = setInterval(fetchMetadata, 60000);
        return () => clearInterval(interval);
    }, [groups]);

    // NEW: PRELOAD LOGIC (Phased & Newest First)
    useEffect(() => {
        if (groups.length > 0 && !allMessagesLoaded.current && !isPreloading.current) {
            preloadRecentData();
        }
    }, [groups]);

    const updateCache = (newMsgs: Message[]) => {
        const tempCache: Record<string, Message[]> = {};
        
        // Update Metadata for Sorting (Fix for initial sort)
        setGroupsMetadata(prev => {
            const next = { ...prev };
            let hasChanges = false;
            
            newMsgs.forEach(msg => {
                 if (!msg.group_id) return;
                 const current = next[msg.group_id] || { unreadCount: 0, lastMessageTime: '' };
                 
                 // Update time if newer
                 const msgTime = new Date(msg.created_at).getTime();
                 const currentTime = current.lastMessageTime ? new Date(current.lastMessageTime).getTime() : 0;
                 
                 if (msgTime > currentTime) {
                     next[msg.group_id] = { ...current, lastMessageTime: msg.created_at };
                     hasChanges = true;
                 }
            });
            return hasChanges ? next : prev;
        });

        newMsgs.forEach(msg => {
            if (!msg.group_id) return;
            if (!tempCache[msg.group_id]) tempCache[msg.group_id] = [];
            tempCache[msg.group_id].push(msg);
        });
        
        // Merge into existing cache
        Object.keys(tempCache).forEach(gid => {
            const existing = messagesCache.current[gid] || [];
            // Merge arrays
            const merged = [...existing, ...tempCache[gid]];
            // Deduplicate based on ID
            const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
            // Sort by time ASCENDING for display (Oldest -> Newest)
            unique.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            
            messagesCache.current[gid] = unique;
        });
        
        // If currently selected group has new data in cache, update it immediately
        if (selectedGroupId && messagesCache.current[selectedGroupId]) {
            setMessages(messagesCache.current[selectedGroupId]);
            setMessagesLoading(false);
        }
    };

    const preloadRecentData = async () => {
        isPreloading.current = true;
        try {
            // PHASE 1: INSTANT LATEST (Global latest 200 messages)
            // This guarantees the most recent active chats get their data FIRST (e.g. 21:25 message).
            const { data: latestMsgs } = await supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            if (latestMsgs && latestMsgs.length > 0) {
                updateCache(latestMsgs);
            }

            // PHASE 2: Fetch ALL Group Members (Parallel)
            // We fetch all members for known groups early so names appear correctly
            const groupIds = groups.map(g => g.id);
            if (groupIds.length > 0) {
                const { data: allMembers } = await supabase
                    .from('chat_group_members')
                    .select('*')
                    .in('group_id', groupIds);
                    
                if (allMembers) {
                    const tempMemCache: Record<string, ChatGroupMember[]> = {};
                    allMembers.forEach(m => {
                        if (!m.group_id) return;
                        if (!tempMemCache[m.group_id]) tempMemCache[m.group_id] = [];
                        tempMemCache[m.group_id].push(m);
                    });
                    membersCache.current = tempMemCache;
                    
                    if (selectedGroupId && membersCache.current[selectedGroupId]) {
                        setGroupMembers(membersCache.current[selectedGroupId]);
                    }
                }
            }

            // PHASE 3: Last 24 Hours (Gap fill)
            // Fetches the rest of today's messages that weren't in the top 200
            const oneDayAgo = subDays(new Date(), 1).toISOString();
            const { data: dayMsgs } = await supabase
                .from('messages')
                .select('*')
                .gte('created_at', oneDayAgo)
                .order('created_at', { ascending: false }); // Newest first!
                
            if (dayMsgs && dayMsgs.length > 0) {
                updateCache(dayMsgs);
            }

            // PHASE 4: Fetch Older History (Last 3 Days) - Background Priority
            const threeDaysAgo = subDays(new Date(), 3).toISOString();
            const { data: olderMsgs } = await supabase
                .from('messages')
                .select('*')
                .gte('created_at', threeDaysAgo)
                .lt('created_at', oneDayAgo)
                .order('created_at', { ascending: false }); // Newest of the old ones first

            if (olderMsgs && olderMsgs.length > 0) {
                updateCache(olderMsgs);
            }

            allMessagesLoaded.current = true;
        } catch (err) {
            console.error("Preload error:", err);
        } finally {
            isPreloading.current = false;
        }
    };

    const sortedGroups = useMemo(() => {
        let result = [...groups];

        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(g => g.name.toLowerCase().includes(lowerTerm));
        }

        return result.sort((a, b) => {
            const metaA = groupsMetadata[a.id] || { unreadCount: 0, lastMessageTime: '' };
            const metaB = groupsMetadata[b.id] || { unreadCount: 0, lastMessageTime: '' };

            if (metaA.unreadCount > 0 && metaB.unreadCount === 0) return -1;
            if (metaA.unreadCount === 0 && metaB.unreadCount > 0) return 1;

            const timeA = metaA.lastMessageTime ? new Date(metaA.lastMessageTime).getTime() : 0;
            const timeB = metaB.lastMessageTime ? new Date(metaB.lastMessageTime).getTime() : 0;

            if (timeA !== timeB) return timeB - timeA;

            return a.name.localeCompare(b.name);
        });
    }, [groups, groupsMetadata, searchTerm]);

    async function fetchChatGroups() {
        try {
            let query = supabase.from('chat_groups').select('*').order('name');

            if (user?.role !== 'admin') {
                if (activeFilter === 'private') {
                    query = query.eq('is_whatsapp_group', false);
                } else {
                    if (myGroupIds.length === 0) {
                         query = query.in('id', []);
                    } else {
                         query = query.in('assigned_employee_group_id', myGroupIds);
                         query = query.eq('is_whatsapp_group', true);
                    }
                }
            } else {
                if (activeFilter === 'private') {
                     query = query.eq('is_whatsapp_group', false);
                } else if (activeFilter === 'my_groups') {
                     query = query.in('assigned_employee_group_id', []); 
                } else if (activeFilter === 'all') {
                    query = query.eq('is_whatsapp_group', true);
                } else {
                    query = query.eq('assigned_employee_group_id', activeFilter);
                    query = query.eq('is_whatsapp_group', true);
                }
            }

            const { data } = await query;
            setGroups(data || []);
            
            const lastId = localStorage.getItem('lastOpenedGroupId');
            const lastGroupExists = data?.find(g => g.id === lastId);

            if (!initialGroupId) {
                if (lastId && lastGroupExists) {
                    setSelectedGroupId(lastId);
                } else if (data && data.length === 1 && !selectedGroupId) {
                    setSelectedGroupId(data[0].id);
                }
            }

        } catch (error) {
            console.error('Error fetching chat groups:', error);
        }
    }

    // Realtime Listener for Group Deletions
    useEffect(() => {
        const channel = supabase
            .channel('chat-groups-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups' }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    setGroups(prev => prev.filter(g => g.id !== payload.old.id));
                    if (selectedGroupId === payload.old.id) setSelectedGroupId(null);
                } else if (payload.eventType === 'INSERT') {
                     fetchChatGroups();
                } else if (payload.eventType === 'UPDATE') {
                     fetchChatGroups();
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [activeFilter, myGroupIds]);

    // 3. Fetch Group Details (Members & Messages) when group selected
    useEffect(() => {
        if (selectedGroupId) {
            localStorage.setItem('lastOpenedGroupId', selectedGroupId);
            if (quotePanel.isOpen) {
                 setQuotePanel(prev => ({
                     ...prev,
                     data: { ...prev.data, groupId: selectedGroupId }
                 }));
            }
            
            // --- OPTIMIZED LOADING STRATEGY ---
            
            // 1. Messages: Check cache first
            if (messagesCache.current[selectedGroupId]) {
                setMessages(messagesCache.current[selectedGroupId]);
                setMessagesLoading(false);
            } else {
                setMessagesLoading(true);
                setMessages([]);
                // Fallback fetch if not preloaded yet
                fetchMessages([], selectedGroupId); 
            }

            // 2. Members: Check cache first
            if (membersCache.current[selectedGroupId]) {
                const cachedMembers = membersCache.current[selectedGroupId];
                setGroupMembers(cachedMembers);
                
                // Logic to set target member from cache
                const group = groups.find(g => g.id === selectedGroupId);
                if (group?.group_jid) {
                    setSelectedTargetMember({
                        id: 'group',
                        phone: group.group_jid, 
                        name: group.name
                    });
                } else if (cachedMembers.length > 0) {
                    setSelectedTargetMember(cachedMembers[0]);
                } else {
                    setSelectedTargetMember(null);
                }
                
                // Clear unread
                setGroupsMetadata(prev => ({
                    ...prev,
                    [selectedGroupId]: { ...(prev[selectedGroupId] || { unreadCount: 0, lastMessageTime: '' }), unreadCount: 0 }
                }));

            } else {
                // Only fetch if not in cache
                fetchGroupMembers();
            }
        }
    }, [selectedGroupId]);

    async function fetchGroupMembers() {
        if (!selectedGroupId) return;
        
        // Optimistic UI: Clear unread badge locally
        setGroupsMetadata(prev => ({
            ...prev,
            [selectedGroupId]: { ...(prev[selectedGroupId] || { unreadCount: 0, lastMessageTime: '' }), unreadCount: 0 }
        }));

        const { data: group } = await supabase
            .from('chat_groups')
            .select('id, name, group_jid, created_by')
            .eq('id', selectedGroupId)
            .single();

        if (group?.created_by) {
            const { data: sessionData } = await supabase
                .from('whatsapp_sessions')
                .select('phone_number')
                .eq('user_id', group.created_by)
                .single();
            if (sessionData?.phone_number) {
                setActiveSessionPhone(sessionData.phone_number);
            }
        }

        const { data: members } = await supabase
            .from('chat_group_members')
            .select('id, phone, name, group_id')
            .eq('group_id', selectedGroupId);
        
        const validMembers = members || [];
        setGroupMembers(validMembers);
        
        // Update Cache
        if (selectedGroupId) {
            membersCache.current[selectedGroupId] = validMembers;
        }
        
        if (group?.group_jid) {
            setSelectedTargetMember({
                id: 'group',
                phone: group.group_jid, 
                name: group.name
            });
        } else {
            if (validMembers.length > 0) {
                setSelectedTargetMember(validMembers[0]);
            } else {
                setSelectedTargetMember(null);
            }
        }

        // If messages were NOT in cache, fetch them now
        if (!messagesCache.current[selectedGroupId]) {
            if (validMembers.length > 0) {
                const phones = validMembers.map(m => m.phone);
                if (group?.group_jid) phones.push(group.group_jid);
                fetchMessages(phones, selectedGroupId);
            } else if (group?.group_jid) {
                 fetchMessages([group.group_jid], selectedGroupId);
            } else {
                setMessages([]);
                setMessagesLoading(false);
            }
        }
    }

    async function fetchMessages(phones: string[], groupId?: string) {
        let query = supabase
            .from('messages')
            .select('id, whatsapp_message_id, quoted_message_id, sender_phone, sender_name, direction, type, content, media_url, created_at, group_id, user_id')
            .order('created_at', { ascending: false })
            .limit(50); 

        if (groupId) {
            query = query.eq('group_id', groupId);
        } else {
            if (phones.length === 0) return;
            query = query.in('sender_phone', phones);
        }

        const { data, error } = await query;
        
        if (error) {
            console.error('Messages fetch error:', error);
            return;
        }
       
        const sortedData = (data || []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(sortedData);
        setMessagesLoading(false);

        // Update Cache
        if (groupId) {
            messagesCache.current[groupId] = sortedData;
        }
        
        if (data && data.length > 0) {
            markMessagesAsRead(data);
        }
    }

    async function markMessagesAsRead(msgs: Message[]) {
        const unreadIds = msgs
            .filter(m => m.direction === 'inbound' && (m as any).status !== 'read')
            .map(m => m.id);

        if (unreadIds.length > 0) {
            await supabase
                .from('messages')
                .update({ status: 'read' })
                .in('id', unreadIds);
        }
    }

    // Realtime Listener
    useEffect(() => {
        if (!selectedGroupId) return;

        const channel = supabase
            .channel(`group-messages-${selectedGroupId}`) 
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `group_id=eq.${selectedGroupId}` 
            }, (payload) => {
                const newMsg = payload.new as any;
                
                setMessages(prev => {
                    // 1. Strict ID Check (Prevent duplicate keys)
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    if (newMsg.whatsapp_message_id && prev.some(m => m.whatsapp_message_id === newMsg.whatsapp_message_id)) return prev;

                    // 2. Deduplication for "Pending" messages (Fix double message issue)
                    // If we have a pending message with same content, replace it with the real one
                    // We check if content is same AND time is close (within 10 seconds)
                    const existingTempIndex = prev.findIndex(m => 
                        m.id.startsWith('temp-') && 
                        (
                            (m.content?.trim() === newMsg.content?.trim()) || 
                            (m.media_url && m.media_url === newMsg.media_url)
                        ) &&
                        // Ensure it's a recent message to avoid false positives with old messages
                        (Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000)
                    );

                    if (existingTempIndex !== -1) {
                        const newMessages = [...prev];
                        newMessages[existingTempIndex] = newMsg; // Replace temp with real
                        return newMessages;
                    }

                    return [...prev, newMsg];
                });
                
                if (newMsg.direction === 'inbound') {
                    markMessagesAsRead([newMsg]);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedGroupId, user?.id, myPhone]);

    useLayoutEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [messages]);

    const filteredMessages = useMemo(() => {
        return messages; 
    }, [messages]);

    const isMemberOfCurrentGroup = true;

    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    };

    const handleSendMessage = async (e: React.FormEvent | React.KeyboardEvent) => {
        if (e.type === 'submit') e.preventDefault();
        
        if (!newMessage.trim() || !selectedTargetMember) return;

        try {
            // 1. Create Optimistic UI Message
            const tempId = 'temp-' + Date.now();
            const tempMsg: Message = {
                id: tempId,
                sender_phone: selectedTargetMember.phone,
                direction: 'outbound',
                type: 'text',
                content: newMessage,
                media_url: null,
                created_at: new Date().toISOString()
            };
            
            // Add to state immediately
            setMessages(prev => [...prev, tempMsg]);
            setNewMessage('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            setReplyingTo(null);
            
            // 2. Prepare DB Payload
            const messageData: any = {
                group_id: selectedGroupId,
                sender_phone: selectedTargetMember.phone,
                direction: 'outbound',
                type: 'text',
                content: tempMsg.content,
                status: 'pending',
                user_id: user?.id,
            };

            if (replyingTo?.whatsapp_message_id) {
                 messageData.quoted_message_id = replyingTo.whatsapp_message_id;
            }

            // 3. Insert ONLY (Do NOT update state here, let Realtime handle it)
            // This prevents the race condition where API updates ID, then Realtime thinks it's new.
            const { error } = await supabase
                .from('messages')
                .insert(messageData);

            if (error) {
                if (error.code === 'PGRST204' || error.message.includes('quoted_message_id')) {
                    delete messageData.quoted_message_id;
                    await supabase.from('messages').insert(messageData);
                } else {
                    // If error, remove the temp message to show failure (or we could mark as failed)
                    console.error('Send error:', error);
                    setMessages(prev => prev.filter(m => m.id !== tempId)); // Rollback
                    showToast('Mesaj gönderilemedi.');
                }
            }
        } catch (error) {
            console.error('Send error:', error);
            showToast('Mesaj gönderilemedi.');
        }
    };

    const convertToPng = async (blob: Blob): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('Canvas context failed')); return; }
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((pngBlob) => {
                    if (pngBlob) resolve(pngBlob);
                    else reject(new Error('Conversion failed'));
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image load failed'));
            };
            img.src = url;
        });
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const handleDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            
            showToast('Dosya indiriliyor...');
        } catch (error) {
            console.error('Download error:', error);
            window.open(url, '_blank');
        }
    };

    const openViewer = (url: string) => {
        setViewerUrl(url);
        setZoomLevel(1);
        setRotation(0);
        setPanPosition({ x: 0, y: 0 });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY * -0.001;
        const newZoom = Math.min(Math.max(0.1, zoomLevel + delta), 5);
        setZoomLevel(newZoom);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPanPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const items = files.map(f => ({ type: 'file' as const, content: f }));
            await handleSendQuoteResponse(items);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSendQuoteResponse = async (items: { type: 'text' | 'file', content: string | File }[]) => {
        if (!selectedGroupId || !selectedTargetMember) {
            showToast('Grup veya kişi seçili değil!');
            return;
        }
        
        setReplyingTo(null);

        try {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                
                // Dynamic delay based on previous item type
                if (i > 0) {
                    const prevItem = items[i - 1];
                    const delay = prevItem.type === 'file' ? 4000 : 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                if (item.type === 'text') {
                    const text = item.content as string;
                    if (!text) continue;

                    const tempId = 'temp-' + Date.now() + Math.random();
                    setMessages(prev => [...prev, {
                        id: tempId,
                        sender_phone: selectedTargetMember.phone,
                        direction: 'outbound',
                        type: 'text',
                        content: text,
                        media_url: null,
                        created_at: new Date().toISOString()
                    }]);

                    const { error } = await supabase.from('messages').insert({
                        group_id: selectedGroupId,
                        sender_phone: selectedTargetMember.phone,
                        direction: 'outbound',
                        type: 'text',
                        content: text,
                        status: 'pending',
                        user_id: user?.id,
                        quoted_message_id: replyingTo?.whatsapp_message_id || null
                    });

                    if (error) console.error('Error sending text:', error);

                } else if (item.type === 'file') {
                    const file = item.content as File;
                    const originalName = file.name || 'image.png';
                    const fileExt = originalName.split('.').pop() || 'png';
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `${selectedGroupId}/${fileName}`;

                    const fileOptions = {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: file.type || 'image/png'
                    };

                    const { error: uploadError } = await supabase.storage
                        .from('chat-media')
                        .upload(filePath, file, fileOptions);

                    if (uploadError) {
                        console.error('Upload error:', uploadError);
                        showToast(`Dosya yüklenemedi: ${uploadError.message}`);
                        continue;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('chat-media')
                        .getPublicUrl(filePath);

                    let msgType = 'document';
                    if (file.type.startsWith('image/')) msgType = 'image';
                    else if (file.type.startsWith('video/')) msgType = 'video';
                    else if (file.type.startsWith('audio/')) msgType = 'audio';

                    const tempId = 'temp-file-' + Date.now() + Math.random();
                    
                    setMessages(prev => [...prev, {
                        id: tempId,
                        sender_phone: selectedTargetMember.phone,
                        direction: 'outbound',
                        type: msgType as any, 
                        content: msgType === 'document' ? originalName : '',
                        media_url: publicUrl,
                        created_at: new Date().toISOString()
                    }]);

                    const msgData: any = {
                        group_id: selectedGroupId,
                        sender_phone: selectedTargetMember.phone,
                        direction: 'outbound',
                        type: msgType,
                        content: msgType === 'document' ? originalName : '',
                        media_url: publicUrl,
                        status: 'pending',
                        user_id: user?.id
                    };
                    
                    if (replyingTo?.whatsapp_message_id) {
                         msgData.quoted_message_id = replyingTo.whatsapp_message_id;
                    }

                    const { error: msgError } = await supabase.from('messages').insert(msgData);
                    
                     if (msgError) {
                          if (msgError.code === 'PGRST204' || msgError.message.includes('quoted_message_id')) {
                              delete msgData.quoted_message_id;
                              await supabase.from('messages').insert(msgData);
                          } else {
                              console.error('Error sending file msg:', msgError);
                          }
                     }
                }
            }
            
            showToast('Teklif ve belgeler gönderildi!');

        } catch (error) {
            console.error('Send quote error:', error);
            showToast('Gönderim sırasında hata oluştu.');
        }
    };

    if (isWhatsAppConnected === null) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="text-gray-500">Bağlantı kontrol ediliyor...</div>
            </div>
        );
    }

    if (isWhatsAppConnected === false && !myPhone) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md w-full border border-gray-200">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">WhatsApp Bağlantısı Gerekli</h2>
                    <p className="text-gray-600 mb-6">
                        Mesajları görüntülemek ve yanıtlamak için önce WhatsApp hesabınızı bağlamanız gerekmektedir.
                    </p>
                    <button
                        onClick={() => navigate('/employee/whatsapp-connection')}
                        className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center"
                    >
                        WhatsApp'ı Bağla
                    </button>
                    <div className="mt-4 text-xs text-gray-300">Status: Disconnected</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${quotePanel.isOpen ? 'fixed inset-0 z-50 rounded-none' : 'relative'}`}>
            {/* Sidebar: Groups */}
            {!hideSidebar && (
            <div className={`w-[240px] shrink-0 border-r border-gray-200 flex-col bg-gray-50 ${quotePanel.isOpen ? 'hidden lg:flex' : 'flex'}`}>
                {/* Filter Tabs */}
                <div className="px-2 pt-2 pb-1 bg-white border-b border-gray-100">
                    <div className="flex space-x-1 overflow-x-auto pb-2 scrollbar-hide">
                        <button 
                            type="button"
                            onClick={() => setActiveFilter('all')}
                            className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all border ${
                                activeFilter === 'all' 
                                    ? 'bg-gray-800 text-white border-gray-800' 
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            Tümü
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => setActiveFilter('private')}
                            className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all border ${
                                activeFilter === 'private' 
                                    ? 'bg-purple-600 text-white border-purple-600' 
                                    : 'bg-white text-purple-600 border-purple-100 hover:border-purple-200'
                            }`}
                        >
                            ÖZEL
                        </button>

                        {myGroupIds.length > 0 && (
                            <button 
                                type="button"
                                onClick={() => setActiveFilter('my_groups')}
                                className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all border ${
                                    activeFilter === 'my_groups' 
                                        ? 'bg-blue-600 text-white border-blue-600' 
                                        : 'bg-white text-blue-600 border-blue-100 hover:border-blue-200'
                                }`}
                            >
                                Grubum
                            </button>
                        )}

                        {employeeGroups
                            .filter(eg => !myGroupIds.includes(eg.id)) 
                            .map(eg => (
                            <button 
                                key={eg.id}
                                type="button"
                                onClick={() => setActiveFilter(eg.id)}
                                className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all border ${
                                    activeFilter === eg.id 
                                        ? 'bg-gray-800 text-white border-gray-800' 
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {eg.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-3 border-b border-gray-200 bg-white">
                    <div className="relative mb-2 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Grup Ara..." 
                                className="w-full pl-9 pr-8 py-1.5 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={14} className={searchTerm ? "text-red-500" : "text-black"} />
                                </button>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={markAllAsRead}
                        className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <CheckCircle size={14} />
                        Tümünü Okundu İşaretle
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {!activeFilter ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
                    ) : groups.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            Sohbet bulunamadı.
                        </div>
                    ) : (
                        sortedGroups.map(g => {
                            const meta = groupsMetadata[g.id] || { unreadCount: 0 };
                            return (
                                <div 
                                    key={g.id}
                                    onClick={() => setSelectedGroupId(g.id)}
                                    className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-100 
                                        ${selectedGroupId === g.id ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-sm' : ''} 
                                        ${meta.unreadCount > 0 ? 'bg-red-50 border-l-4 border-l-red-500' : ''}
                                    `}
                                >
                                    <div className={`relative w-12 h-12 rounded-full flex items-center justify-center font-bold mr-3 shadow-sm ${meta.unreadCount > 0 ? 'bg-red-100 text-red-600' : 'bg-white border border-gray-200 text-blue-600'}`}>
                                        <Users size={20} />
                                        {meta.unreadCount > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md animate-pulse">
                                                {meta.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <h3 className={`text-sm font-bold truncate ${meta.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'}`}>{g.name}</h3>
                                            {meta.lastMessageTime && (
                                                <span className={`text-[10px] ${meta.unreadCount > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                                    {isToday(new Date(meta.lastMessageTime)) ? format(new Date(meta.lastMessageTime), 'HH:mm') : format(new Date(meta.lastMessageTime), 'dd.MM')}
                                                </span>
                                            )}
                                        </div>
                                        {meta.unreadCount > 0 ? (
                                            <span className="text-[11px] text-red-600 font-bold flex items-center">
                                                <div className="w-2 h-2 bg-red-600 rounded-full mr-1.5 animate-pulse"></div>
                                                {meta.unreadCount} Yeni Mesaj
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-gray-500 truncate block">Sohbeti görüntüle</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 min-w-0 flex flex-col bg-[#e5ddd5] relative">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}></div>
                
                {!selectedGroupId ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] text-gray-500 relative z-10">
                       <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4 opacity-50">
                           <Users size={40} className="text-gray-400" />
                       </div>
                       <h3 className="text-lg font-medium text-gray-700">Sohbet Seçin</h3>
                    </div>
                ) : messagesLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] text-gray-500 relative z-10">
                        <RefreshCw size={32} className="animate-spin text-blue-500 mb-4" />
                        <p className="text-xs">Yükleniyor...</p>
                    </div>
                ) : (
                <>
                {/* Disconnected Banner */}
                {isWhatsAppConnected === false && (
                    <div className="bg-red-500 text-white p-2 text-center text-xs font-bold animate-pulse z-20">
                        ⚠️ Geçici Bağlantı Sorunu: Mesaj gönderimi şu an yapılamıyor. Yeniden bağlanılıyor...
                    </div>
                )}

                {/* Chat Header */}
                <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center min-w-0">
                        <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold mr-3 shrink-0">
                            <Users size={18} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-800 text-sm truncate">
                                {groups.find(g => g.id === selectedGroupId)?.name || currentGroup?.name || 'Grup'}
                            </h3>
                            <div className="flex items-center text-xs text-gray-500">
                                {(currentGroup?.group_jid || groups.find(g => g.id === selectedGroupId)?.group_jid) ? (
                                    <span className="text-gray-600 italic truncate">
                                        <span className="font-semibold text-green-600">{groups.find(g => g.id === selectedGroupId)?.name || currentGroup?.name}</span>
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span>Alıcı:</span>
                                        <div className="relative inline-block">
                                            <select 
                                                className="appearance-none bg-gray-100 border border-gray-300 rounded px-2 py-0.5 pr-6 cursor-pointer focus:outline-none focus:border-blue-500 font-medium text-gray-700 max-w-[150px]"
                                                value={selectedTargetMember?.id || ''}
                                                onChange={(e) => {
                                                    const member = groupMembers.find(m => m.id === e.target.value);
                                                    setSelectedTargetMember(member || null);
                                                }}
                                            >
                                                {groupMembers.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.name || m.phone}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-500" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 relative z-0">
                    {filteredMessages.map((msg) => {
                        const member = groupMembers.find(m => m.phone === msg.sender_phone);
                        return (
                            <MessageItem 
                                key={msg.id}
                                msg={msg}
                                member={member}
                                user={user}
                                messages={messages}
                                myPhone={myPhone}
                                activeSessionPhone={activeSessionPhone}
                                onContextMenu={(e, m) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, msg: m });
                                }}
                                onOpenViewer={openViewer}
                                onSetQuotePanel={setQuotePanel}
                                onDownload={handleDownload}
                                onToast={showToast}
                            />
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {replyingTo && (
                    <div className="bg-gray-50 p-2 border-t border-gray-200 flex justify-between items-center animate-in slide-in-from-bottom-2 z-20 relative">
                        <div className="flex-1 border-l-4 border-blue-500 pl-2">
                            <span className="text-xs font-bold text-blue-600 block">{replyingTo.sender_name || replyingTo.sender_phone}</span>
                            <span className="text-xs text-gray-500 line-clamp-1">{replyingTo.content || (replyingTo.type === 'image' ? '📷 Görsel' : '...')}</span>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                            <X size={16} className="text-gray-500" />
                        </button>
                    </div>
                )}
                <div className="p-2 bg-white border-t border-gray-200">
                    {!isMemberOfCurrentGroup && selectedGroupId ? (
                        <div className="flex items-center justify-center p-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm font-medium">
                            <Ban size={16} className="mr-2" />
                            Bu grupta ekli değilsiniz.
                        </div>
                    ) : (
                        <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                onChange={handleFileSelect} 
                                multiple 
                                accept="image/*,application/pdf,video/*"
                            />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full mb-1">
                                <Paperclip size={20} />
                            </button>
                            <textarea
                                ref={textareaRef}
                                value={newMessage}
                                onChange={(e) => {
                                    setNewMessage(e.target.value);
                                    adjustTextareaHeight();
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(e);
                                    }
                                }}
                                placeholder={isWhatsAppConnected === false ? "Bağlantı bekleniyor..." : (selectedTargetMember ? `${selectedTargetMember.name || selectedTargetMember.phone} kişisine mesaj yazın...` : "Mesaj yazın...")}
                                className="flex-1 py-2 px-4 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-green-500 outline-none resize-none overflow-y-auto min-h-[40px] max-h-[120px] disabled:bg-gray-100 disabled:text-gray-400"
                                disabled={!selectedTargetMember || isWhatsAppConnected === false}
                                rows={1}
                            />
                            <button 
                                type="submit" 
                                disabled={!newMessage.trim() || !selectedTargetMember || isWhatsAppConnected === false}
                                className="p-2 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] disabled:opacity-50 disabled:bg-gray-400 transition-colors mb-1 shadow-md"
                            >
                                <Send size={20} />
                            </button>
                        </form>
                    )}
                </div>

                {/* Toast Notification */}
                {toastMessage && (
                    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity duration-300 animate-in fade-in slide-in-from-bottom-2">
                        {toastMessage}
                    </div>
                )}

                </>
                )}

            </div>

            {/* Viewer Modal (Image or PDF) */}
            {viewerUrl && (
                <div 
                    className={`absolute top-0 bottom-0 left-0 z-[60] flex items-center justify-center overflow-hidden bg-black/90 ${quotePanel.isOpen ? 'w-1/2' : 'w-full'}`}
                    onWheel={handleWheel}
                >
                    {/* Controls */}
                    <div className="absolute top-4 right-4 flex space-x-2 z-[70]">
                        {!viewerUrl.toLowerCase().endsWith('.pdf') && (
                        <>
                            <button onClick={() => setZoomLevel(z => Math.min(z + 0.5, 5))} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <ZoomIn size={24} />
                            </button>
                            <button onClick={() => setZoomLevel(z => Math.max(z - 0.5, 0.1))} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <ZoomOut size={24} />
                            </button>
                            <button onClick={() => setRotation(r => r + 90)} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <RotateCcw size={24} />
                            </button>
                        </>
                        )}
                        <button onClick={() => setViewerUrl(null)} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    {viewerUrl.toLowerCase().endsWith('.pdf') ? (
                        <div className="w-full h-full p-4">
                            <iframe src={viewerUrl} className="w-full h-full rounded bg-white" title="PDF Viewer" />
                        </div>
                    ) : (
                        <div 
                            className="cursor-move"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            style={{
                                transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                            }}
                        >
                            <img 
                                src={viewerUrl} 
                                className="max-w-[90vw] max-h-[90vh] object-contain select-none pointer-events-none"
                                draggable={false}
                                alt="Full view"
                                style={{ imageRendering: 'auto' }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Right Quote Panel */}
            {quotePanel.isOpen && (
                <div className="w-[400px] shrink-0 bg-white flex flex-col border-l border-gray-200 overflow-y-auto animate-in slide-in-from-right-10 duration-300 shadow-xl z-20">
                    <EmployeeNewQuote 
                        embedded={true} 
                        initialState={quotePanel.data}
                        onClose={() => setQuotePanel({ isOpen: false, data: null })}
                        initialGroupName={groups.find(g => g.id === (quotePanel.data?.groupId || selectedGroupId))?.name}
                        onSendMessage={handleSendQuoteResponse}
                    />
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed bg-white shadow-xl rounded-lg py-1 z-[100] border border-gray-200 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center transition-colors"
                        onClick={() => {
                            setReplyingTo(contextMenu.msg);
                            setContextMenu(null);
                        }}
                    >
                        <RotateCcw size={16} className="mr-3 text-blue-600" />
                        Yanıtla
                    </button>
                    {(contextMenu.msg.media_url) && (
                        <button 
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center transition-colors"
                            onClick={() => {
                                handleDownload(contextMenu.msg.media_url!, contextMenu.msg.content || 'dosya');
                                setContextMenu(null);
                            }}
                        >
                            <Download size={16} className="mr-3 text-green-600" />
                            {contextMenu.msg.type === 'document' ? 'Belgeyi İndir' : 'Medyayı İndir'}
                        </button>
                    )}
                    {contextMenu.msg.content && (
                         <button 
                             className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center transition-colors"
                             onClick={() => {
                                 navigator.clipboard.writeText(contextMenu.msg.content);
                                 setContextMenu(null);
                                 showToast('Metin kopyalandı');
                             }}
                         >
                             <FileText size={16} className="mr-3 text-gray-500" />
                             Kopyala
                         </button>
                    )}
                </div>
            )}
        </div>
    );
}
