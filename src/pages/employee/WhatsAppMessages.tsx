import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Search, Send, Paperclip, FileText, User, Users, ChevronDown, X, ZoomIn, ZoomOut, RotateCcw, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface ChatGroup {
    id: string;
    name: string;
    assigned_employee_group_id?: string;
}

interface ChatGroupMember {
    id: string;
    phone: string;
    name: string | null;
}

interface Message {
    id: string;
    sender_phone: string;
    sender_name?: string;
    direction: 'inbound' | 'outbound';
    type: 'text' | 'image';
    content: string;
    media_url: string | null;
    created_at: string;
    group_id?: string;
}

interface EmployeeGroup {
    id: string;
    name: string;
}

export default function WhatsAppMessages() {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    const [groups, setGroups] = useState<ChatGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [groupMembers, setGroupMembers] = useState<ChatGroupMember[]>([]);
    const [selectedTargetMember, setSelectedTargetMember] = useState<ChatGroupMember | null>(null);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Group Filter State
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
    const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
    const [activeFilter, setActiveFilter] = useState<string | null>(null); // Changed to null initially to prevent flicker

    // Image Viewer State
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // WhatsApp Connection State
    const [isWhatsAppConnected, setIsWhatsAppConnected] = useState<boolean | null>(null);
    const [myPhone, setMyPhone] = useState<string | null>(null);

    // ESC to close viewer
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setViewerImage(null);
        };
        if (viewerImage) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewerImage]);

    // Check WhatsApp Connection Status
    useEffect(() => {
        if (!user) return;

        const checkConnection = async () => {
            try {
                const { data, error } = await supabase
                    .from('whatsapp_sessions')
                    .select('status, phone_number')
                    .eq('user_id', user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error('Connection check error:', error);
                    setIsWhatsAppConnected(false);
                    return;
                }

                setIsWhatsAppConnected(data?.status === 'connected');
                if (data?.phone_number) setMyPhone(data.phone_number);
            } catch (err) {
                console.error('Connection check failed:', err);
                setIsWhatsAppConnected(false);
            }
        };

        checkConnection();
    }, [user]);

    // 1. Initial Data Fetch (Employee Groups & My Groups)
    useEffect(() => {
        if (user && isWhatsAppConnected) fetchInitialData();
    }, [user, isWhatsAppConnected]);

    async function fetchInitialData() {
        try {
            // Fetch all employee groups
            const { data: allGroups } = await supabase.from('employee_groups').select('id, name').order('name');
            setEmployeeGroups(allGroups || []);

            // Fetch my groups
            if (user?.role === 'employee') {
                const { data: myMemberships } = await supabase
                    .from('employee_group_members')
                    .select('group_id')
                    .eq('user_id', user.id);
                
                const ids = myMemberships?.map(m => m.group_id) || [];
                setMyGroupIds(ids);
                
                // Default to 'my_groups' if user is in a group, otherwise 'all'
                if (ids.length > 0) {
                    setActiveFilter('my_groups');
                } else {
                    setActiveFilter('all');
                }
            } else {
                // Admin sees all by default
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
    }, [activeFilter, myGroupIds]); // Re-fetch when filter or myGroups changes

    async function fetchChatGroups() {
        try {
            let query = supabase.from('chat_groups').select('*').order('name');

            if (activeFilter === 'my_groups') {
                if (myGroupIds.length === 0) {
                    query = query.in('assigned_employee_group_id', []); 
                } else {
                    query = query.in('assigned_employee_group_id', myGroupIds);
                }
            } else if (activeFilter === 'all') {
                // Sadece benim üyesi olduğum WhatsApp gruplarını getir
                // (Admin ise hepsini görebilir, çalışan ise sadece dahil olduklarını)
                if (user?.role !== 'admin') {
                     // Get list of group IDs where I am a member
                     // const { data: memberOf } = await supabase
                     //    .from('chat_group_members')
                     //    .select('group_id')
                     //    .eq('phone', myPhone || ''); // Backend needs to sync my phone first
                     
                     // Fallback: If phone not synced yet, maybe use assigned_employee_group_id logic?
                     // Or just show assigned groups + any group I'm explicitly added to.
                     // For now, let's stick to 'assigned_employee_group_id' logic for simplicity + explicit memberships
                     
                     // Actually, user wants 'all' to mean "All groups I have access to via categories".
                     // So if I have access to Category A (3 groups) and Category B (2 groups), 'all' should show 5 groups.
                     
                     if (myGroupIds.length > 0) {
                         query = query.in('assigned_employee_group_id', myGroupIds);
                     } else {
                         // If no categories assigned, show nothing (or just explicit memberships)
                         query = query.in('id', []);
                     }
                }
            } else {
                // Specific Employee Group
                query = query.eq('assigned_employee_group_id', activeFilter);
            }

            const { data } = await query;
            setGroups(data || []);

            // Auto-select logic...
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
                     // Check if this new group belongs to my filters
                     // For simplicity, just re-fetch
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
            fetchGroupMembers();
        }
    }, [selectedGroupId]);

    async function fetchGroupMembers() {
        if (!selectedGroupId) return;

        const { data: group } = await supabase
            .from('chat_groups')
            .select('*')
            .eq('id', selectedGroupId)
            .single();

        const { data: members } = await supabase
            .from('chat_group_members')
            .select('*')
            .eq('group_id', selectedGroupId);
        
        setGroupMembers(members || []);
        
        if (group?.is_whatsapp_group && group?.group_jid) {
            setSelectedTargetMember({
                id: 'group',
                phone: group.group_jid, 
                name: 'Grup Geneli'
            });
        } else {
            if (members && members.length > 0) {
                setSelectedTargetMember(members[0]);
            } else {
                setSelectedTargetMember(null);
            }
        }

        if (members && members.length > 0) {
            const phones = members.map(m => m.phone);
            if (group?.group_jid) phones.push(group.group_jid);
            fetchMessages(phones, selectedGroupId);
        } else if (group?.group_jid) {
             fetchMessages([group.group_jid], selectedGroupId);
        } else {
            setMessages([]);
        }
    }

    async function fetchMessages(phones: string[], groupId?: string) {
        let query = supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (groupId) {
            const groupJid = phones.find(p => p.includes('@g.us'));
            let orCondition = `group_id.eq.${groupId}`;
            if (groupJid) {
                orCondition += `,sender_phone.eq.${groupJid}`;
            }
            query = query.or(orCondition);
        } else {
            if (phones.length === 0) return;
            query = query.in('sender_phone', phones);
        }

        const { data, error } = await query;
        
        if (error) {
            // Ignore network abort errors
            if (error.code !== '20' && error.message !== 'FetchError: The user aborted a request.') {
               // console.warn('Messages fetch error:', error);
            }
            return;
       }

        setMessages(data || []);
        
        // Mark as read immediately when loaded
        if (data && data.length > 0) {
            markMessagesAsRead(data);
        }
    }

    // New Function: Mark displayed messages as read
    async function markMessagesAsRead(msgs: Message[]) {
        const unreadIds = msgs
            .filter(m => m.direction === 'inbound' && (m as any).status !== 'read') // Assuming status field exists or checking delivered
            .map(m => m.id);

        if (unreadIds.length > 0) {
            await supabase
                .from('messages')
                .update({ status: 'read' }) // Ensure your DB supports this status value
                .in('id', unreadIds);
        }
    }

    // Realtime Listener
    useEffect(() => {
        if (!selectedGroupId || groupMembers.length === 0) return;

        const phones = groupMembers.map(m => m.phone);

        const channel = supabase
            .channel('group-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const newMsg = payload.new as any;
                if (phones.includes(newMsg.sender_phone)) {
                     setMessages(prev => {
                        const existingTempIndex = prev.findIndex(m => m.content === newMsg.content && m.id.startsWith('temp-'));
                        if (existingTempIndex !== -1) {
                            const newMessages = [...prev];
                            newMessages[existingTempIndex] = newMsg;
                            return newMessages;
                        }
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    
                    // Mark new incoming message as read if we are viewing this chat
                    if (newMsg.direction === 'inbound') {
                        markMessagesAsRead([newMsg]);
                    }
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedGroupId, groupMembers]);

    // Use useLayoutEffect for immediate scroll
    useLayoutEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedTargetMember) return;

        try {
            const tempMsg: Message = {
                id: 'temp-' + Date.now(),
                sender_phone: selectedTargetMember.phone,
                direction: 'outbound',
                type: 'text',
                content: newMessage,
                media_url: null,
                created_at: new Date().toISOString()
            };
            setMessages(prev => [...prev, tempMsg]);
            setNewMessage('');
            
            // Scroll will happen automatically via useLayoutEffect

            const { error } = await supabase.from('messages').insert({
                sender_phone: selectedTargetMember.phone,
                direction: 'outbound',
                type: 'text',
                content: tempMsg.content,
                status: 'pending'
            });

            if (error) throw error;
        } catch (error) {
            console.error('Send error:', error);
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

    const createQuoteFromImage = async (imgUrl: string, phone: string) => {
        const quoteData = {
            durum: 'islemde',
            kesen_id: user?.id,
            kart_bilgisi: imgUrl,
            notlar: 'WhatsApp üzerinden gelen görselden oluşturuldu.',
            misafir_bilgi: { phone: phone, source: 'whatsapp_group', group_id: selectedGroupId }
        };

        const { data, error } = await supabase.from('teklifler').insert(quoteData).select().single();
        if (error) console.error('Quote create error:', error);
        else if (data) navigate(`/employee/quotes/${data.id}`);
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const handleCopyImage = async (url: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const pngBlob = await convertToPng(blob);
            const item = new ClipboardItem({ [pngBlob.type]: pngBlob });
            await navigator.clipboard.write([item]);
            showToast('Görsel panoya kopyalandı!');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Kopyalama başarısız.');
        }
    };

    const openViewer = (url: string) => {
        setViewerImage(url);
        setZoomLevel(1);
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

    if (isWhatsAppConnected === null) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="text-gray-500">Bağlantı kontrol ediliyor...</div>
            </div>
        );
    }

    if (isWhatsAppConnected === false) {
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
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
            {/* Sidebar: Groups */}
            <div className="w-1/4 border-r border-gray-200 flex flex-col bg-gray-50">
                {/* Filter Tabs */}
                <div className="px-3 pt-3 pb-1 bg-white border-b border-gray-100">
                    <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                        <button 
                            onClick={() => setActiveFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                                activeFilter === 'all' 
                                    ? 'bg-gray-800 text-white border-gray-800' 
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            Tümü
                        </button>
                        
                        {myGroupIds.length > 0 && (
                            <button 
                                onClick={() => setActiveFilter('my_groups')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                                    activeFilter === 'my_groups' 
                                        ? 'bg-blue-600 text-white border-blue-600' 
                                        : 'bg-white text-blue-600 border-blue-100 hover:border-blue-200'
                                }`}
                            >
                                Grubum
                            </button>
                        )}

                        {employeeGroups
                            .filter(eg => !myGroupIds.includes(eg.id)) // Filter out my groups as they are covered by 'Grubum' tab
                            .map(eg => (
                            <button 
                                key={eg.id}
                                onClick={() => setActiveFilter(eg.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
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

                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Grup Ara..." 
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {/* Show loading or empty state if filter not ready */}
                    {!activeFilter ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
                    ) : groups.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            {activeFilter === 'my_groups' 
                                ? 'Grubunuza atanmış sohbet bulunamadı.' 
                                : 'Kriterlere uygun sohbet bulunamadı.'}
                        </div>
                    ) : (
                        groups.map(g => (
                            <div 
                                key={g.id}
                                onClick={() => setSelectedGroupId(g.id)}
                                className={`p-4 flex items-center cursor-pointer hover:bg-white transition-colors border-b border-gray-100 ${selectedGroupId === g.id ? 'bg-white border-l-4 border-l-blue-600 shadow-sm' : ''}`}
                            >
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold mr-3">
                                    <Users size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 truncate">{g.name}</h3>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#e5ddd5] relative">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}></div>
                {/* Chat Header */}
                <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold mr-3">
                            <Users size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">
                                {groups.find(g => g.id === selectedGroupId)?.name || 'Grup Seçiniz'}
                            </h3>
                            <div className="flex items-center text-xs text-gray-500">
                                <span className="mr-1">Mesaj Gönderilecek:</span>
                                {selectedTargetMember?.id === 'group' ? (
                                    <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">WhatsApp Grubu</span>
                                ) : (
                                    <div className="relative inline-block">
                                        <select 
                                            className="appearance-none bg-gray-100 border border-gray-300 rounded px-2 py-0.5 pr-6 cursor-pointer focus:outline-none focus:border-blue-500"
                                            value={selectedTargetMember?.id || ''}
                                            onChange={(e) => {
                                                const member = groupMembers.find(m => m.id === e.target.value);
                                                setSelectedTargetMember(member || null);
                                            }}
                                        >
                                            {groupMembers.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name || m.phone} ({m.phone})
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 relative z-0">
                    {messages.map((msg) => {
                        const member = groupMembers.find(m => m.phone === msg.sender_phone);
                        const senderName = member?.name || member?.phone || msg.sender_phone;

                        return (
                            <div 
                                key={msg.id} 
                                className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}
                            >
                                <span className="text-[10px] text-gray-600 mb-0.5 px-1 font-medium">
                                    {msg.direction === 'inbound' ? senderName : `Kime: ${senderName}`}
                                </span>
                                <div className={`max-w-[70%] rounded-lg p-3 shadow-sm relative ${
                                    msg.direction === 'outbound' ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'
                                }`}>
                                    {msg.type === 'image' && (
                                        <div className="mb-2">
                                            {msg.media_url ? (
                                                <img 
                                                    src={msg.media_url} 
                                                    alt="Görsel" 
                                                    onClick={() => handleCopyImage(msg.media_url!)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        openViewer(msg.media_url!);
                                                    }}
                                                    className="rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                    title="Kopyalamak için sol tık, Büyütmek için sağ tık"
                                                />
                                            ) : null}
                                            {msg.direction === 'inbound' && (
                                                <button 
                                                    onClick={() => createQuoteFromImage(msg.media_url!, msg.sender_phone)}
                                                    className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded flex items-center justify-center transition-colors"
                                                >
                                                    <FileText size={14} className="mr-1" />
                                                    Teklife Dönüştür
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {msg.content && <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>}
                                    
                                    <span className="text-[10px] text-gray-500 block text-right mt-1">
                                        {format(new Date(msg.created_at), 'HH:mm')}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 bg-white border-t border-gray-200">
                    <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                        <button type="button" className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                            <Paperclip size={20} />
                        </button>
                        <input 
                            type="text" 
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder={selectedTargetMember ? `${selectedTargetMember.name || selectedTargetMember.phone} kişisine mesaj yazın...` : "Mesaj yazın..."}
                            className="flex-1 py-2 px-4 border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 outline-none"
                            disabled={!selectedTargetMember}
                        />
                        <button 
                            type="submit" 
                            disabled={!newMessage.trim() || !selectedTargetMember}
                            className="p-2 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] disabled:opacity-50 transition-colors"
                        >
                            <Send size={20} />
                        </button>
                    </form>
                </div>

                {/* Toast Notification */}
                {toastMessage && (
                    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity duration-300 animate-in fade-in slide-in-from-bottom-2">
                        {toastMessage}
                    </div>
                )}

                {/* Image Viewer Modal */}
                {viewerImage && (
                    <div 
                        className="absolute inset-0 bg-black/90 z-[60] flex items-center justify-center overflow-hidden"
                        onWheel={handleWheel}
                    >
                        {/* Controls */}
                        <div className="absolute top-4 right-4 flex space-x-2 z-[70]">
                            <button onClick={() => setZoomLevel(z => Math.min(z + 0.5, 5))} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <ZoomIn size={24} />
                            </button>
                            <button onClick={() => setZoomLevel(z => Math.max(z - 0.5, 0.1))} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <ZoomOut size={24} />
                            </button>
                            <button onClick={() => { setZoomLevel(1); setPanPosition({x:0, y:0}); }} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <RotateCcw size={24} />
                            </button>
                            <button onClick={() => setViewerImage(null)} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Image Container */}
                        <div 
                            className="cursor-move"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            style={{
                                transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                            }}
                        >
                            <img 
                                src={viewerImage} 
                                className="max-w-[90vw] max-h-[90vh] object-contain select-none pointer-events-none"
                                draggable={false}
                                alt="Full view"
                                style={{ imageRendering: 'auto' }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
