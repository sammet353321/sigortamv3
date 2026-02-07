
import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Send, Paperclip, FileText, CheckCircle, Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { format, isToday } from 'date-fns';
import toast from 'react-hot-toast';

interface Message {
    id: string;
    whatsapp_message_id?: string;
    sender_phone: string;
    sender_name?: string;
    direction: 'inbound' | 'outbound';
    type: 'text' | 'image' | 'document';
    content: string;
    media_url: string | null;
    created_at: string;
    group_id?: string;
    user_id?: string;
}

interface ChatAreaProps {
    groupId: string | null;
    targetPhone: string | null; // Fallback if no group ID, or for specific member targeting
    targetName?: string;
}

export default function ChatArea({ groupId, targetPhone, targetName }: ChatAreaProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [viewerImage, setViewerImage] = useState<string | null>(null);

    // Fetch Messages
    useEffect(() => {
        if (!groupId && !targetPhone) return;
        fetchMessages();

        // Realtime Subscription
        const channel = supabase
            .channel(`chat-area-${groupId || targetPhone}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: groupId ? `group_id=eq.${groupId}` : `sender_phone=eq.${targetPhone}`
            }, (payload) => {
                const newMsg = payload.new as Message;
                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    // Remove temp messages
                    const tempIndex = prev.findIndex(m => m.id.startsWith('temp-') && m.content === newMsg.content);
                    if (tempIndex !== -1) {
                         const updated = [...prev];
                         updated[tempIndex] = newMsg;
                         return updated;
                    }
                    return [...prev, newMsg];
                });
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [groupId, targetPhone]);

    const fetchMessages = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else if (targetPhone) {
                query = query.or(`sender_phone.eq.${targetPhone},direction.eq.outbound`);
            }

            const { data, error } = await query;
            if (error) throw error;

            const sorted = (data || []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            setMessages(sorted);
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto Scroll
    useLayoutEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || (!groupId && !targetPhone)) return;

        const tempId = 'temp-' + Date.now();
        const msgContent = newMessage;
        
        // Optimistic UI
        setMessages(prev => [...prev, {
            id: tempId,
            sender_phone: targetPhone || 'system',
            direction: 'outbound',
            type: 'text',
            content: msgContent,
            media_url: null,
            created_at: new Date().toISOString()
        }]);
        setNewMessage('');

        try {
            const { error } = await supabase.from('messages').insert({
                group_id: groupId || null,
                sender_phone: targetPhone, // This might need adjustment if group has multiple members
                direction: 'outbound',
                type: 'text',
                content: msgContent,
                status: 'pending',
                user_id: user?.id
            });

            if (error) throw error;
        } catch (error) {
            console.error('Send error:', error);
            toast.error('Mesaj gönderilemedi');
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            for (const file of files) {
                await uploadAndSendFile(file);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const uploadAndSendFile = async (file: File) => {
        try {
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
            const filePath = `${groupId || 'chat'}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-media')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('chat-media')
                .getPublicUrl(filePath);

            let msgType: 'image' | 'document' = 'document';
            if (file.type.startsWith('image/')) msgType = 'image';

            await supabase.from('messages').insert({
                group_id: groupId || null,
                sender_phone: targetPhone,
                direction: 'outbound',
                type: msgType,
                content: file.name,
                media_url: publicUrl,
                status: 'pending',
                user_id: user?.id
            });

        } catch (error) {
            console.error('File upload error:', error);
            toast.error('Dosya gönderilemedi');
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#e5ddd5] relative rounded-l-xl overflow-hidden">
             <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}></div>
            
            {/* Header */}
            <div className="bg-white p-3 border-b border-gray-200 flex items-center justify-between z-10 shadow-sm">
                <div>
                    <h3 className="font-bold text-gray-800">{targetName || 'Sohbet'}</h3>
                    <span className="text-xs text-green-600 font-medium">WhatsApp</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 z-0">
                {messages.map((msg) => (
                    <div 
                        key={msg.id} 
                        className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}
                    >
                        <div className={`max-w-[85%] rounded-lg p-2 shadow-sm relative ${
                            msg.direction === 'outbound' ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'
                        }`}>
                            {msg.type === 'image' && msg.media_url && (
                                <img 
                                    src={msg.media_url} 
                                    onClick={() => setViewerImage(msg.media_url)}
                                    className="rounded mb-1 max-h-48 object-cover cursor-pointer"
                                />
                            )}
                            
                            {msg.type === 'document' && (
                                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200 mb-1">
                                    <FileText size={20} className="text-red-500" />
                                    <a href={msg.media_url || '#'} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline truncate max-w-[150px]">
                                        {msg.content || 'Belge'}
                                    </a>
                                </div>
                            )}

                            {msg.content && msg.type === 'text' && (
                                <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.content}</p>
                            )}

                            <span className="text-[10px] text-gray-500 block text-right mt-1">
                                {format(new Date(msg.created_at), 'HH:mm')}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-200 z-10">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                     <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                    >
                        <Paperclip size={20} />
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileSelect} 
                        multiple 
                    />
                    <input 
                        type="text" 
                        value={newMessage} 
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Mesaj yazın..."
                        className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-green-500 text-sm"
                    />
                    <button type="submit" className="p-2 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f]">
                        <Send size={18} />
                    </button>
                </form>
            </div>

             {/* Image Viewer */}
             {viewerImage && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
                    <button onClick={() => setViewerImage(null)} className="absolute top-4 right-4 text-white p-2 bg-white/10 rounded-full">
                        <X size={24} />
                    </button>
                    <img src={viewerImage} className="max-w-full max-h-full object-contain" />
                </div>
            )}
        </div>
    );
}
