import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Paperclip, Loader2, FileText, Bot, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'file';
  fileName?: string;
}

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const initialMessage: Message = {
    id: '1',
    role: 'assistant',
    content: 'Merhaba! Ben Sigorta Asistanınız. Kasko tekliflerini analiz edebilir, teminatları karşılaştırabilirim. Bana bir PDF yükleyin veya soru sorun.',
    timestamp: new Date()
  };
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearChat = () => {
    setMessages([initialMessage]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const formatResponse = (data: any) => {
    // If it's just a simple message (Mode 1)
    if (data.employee_message && !data.policy_id && !data.coverages) {
      return data.employee_message;
    }

    // Build structured response for Quote Analysis (Mode 2)
    let output = '';

    // 1. Employee Summary
    if (data.employee_message) {
      output += `📋 **Özet:**\n${data.employee_message}\n\n`;
    }

    // 2. Vehicle Info
    if (data.vehicle) {
      const v = data.vehicle;
      output += `🚗 **Araç:** ${v.plate || '-'} | ${v.year || ''} ${v.make || ''} ${v.model || ''}\n`;
    }

    // 3. Premium
    if (data.premium) {
      output += `💰 **Prim:** ${data.premium.amount} ${data.premium.currency}\n\n`;
    }

    // 4. Windshield (Important!)
    if (data.windshield) {
      const w = data.windshield;
      output += `🪟 **Cam Teminatı:**\n`;
      output += `• Durum: ${w.covered ? '✅ Kapsamda' : '❌ Kapsam Dışı'}\n`;
      output += `• Tür: ${w.replacement_type || 'Belirsiz'}\n`;
      output += `• Servis: ${w.service_restriction || 'Belirsiz'}\n`;
      if (w.notes) output += `• Not: ${w.notes}\n`;
      output += '\n';
    }

    // 5. Service Options
    if (data.service_options) {
      output += `🛠 **Servis Seçimi:** ${data.service_options.default || 'Belirsiz'}\n`;
      if (data.service_options.approved_workshops?.length > 0) {
        output += `• Önerilenler: ${data.service_options.approved_workshops.join(', ')}\n`;
      }
      output += '\n';
    }

    // 6. Coverages (List included ones)
    if (data.coverages && Array.isArray(data.coverages)) {
      output += `🛡 **Teminatlar:**\n`;
      data.coverages.forEach((c: any) => {
        if (c.included) {
          output += `• ${c.name}: ${c.limit || 'Limit Yok'} ${c.deductible && c.deductible !== '0 TRY' ? `(Muafiyet: ${c.deductible})` : ''}\n`;
        }
      });
      output += '\n';
    }

    // 7. Missing Fields
    if (data.missing_fields && data.missing_fields.length > 0) {
      output += `⚠️ **Eksik Bilgiler:** ${data.missing_fields.join(', ')}\n`;
    }

    return output.trim();
  };

  const sendMessageToBackend = async (text: string, file: File | null) => {
    const formData = new FormData();
    if (text) formData.append('message', text);
    if (file) formData.append('file', file);

    try {
        const response = await fetch('http://localhost:3004/chat/analyze', {
            method: 'POST',
            headers: {
                'x-api-secret': 'SigortaSecurev3_2026_Key'
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server Error');
        }

        const data = await response.json();
        // Use formatter to show full details
        return formatResponse(data);
    } catch (error: any) {
        console.error('AI Request Failed:', error);
        return `Hata: ${error.message}. Lütfen sistem yöneticisi ile iletişime geçin.`;
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await sendMessageToBackend(input, null);
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Dosya yüklendi: ${file.name}`,
      timestamp: new Date(),
      type: 'file',
      fileName: file.name
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const responseText = await sendMessageToBackend(`Bu dosyayı analiz et: ${file.name}`, file);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
        console.error('Error uploading file:', error);
    } finally {
        setIsLoading(false);
    }
  };

  if (!user) return null; // Don't show if not logged in

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-10 fade-in max-h-[600px]">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Sigorta Asistanı</h3>
                <p className="text-[10px] text-blue-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                  Çevrimiçi
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={clearChat}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
                title="Sohbeti Temizle"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white text-gray-700 border border-gray-200 rounded-tl-none shadow-sm'
                  }`}
                >
                  {msg.type === 'file' && (
                    <div className="flex items-center gap-2 mb-2 bg-black/10 p-2 rounded text-xs">
                      <FileText className="w-4 h-4" />
                      <span className="truncate">{msg.fileName}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className={`text-[10px] block mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-200 shadow-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-xs text-gray-500">Yazıyor...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Dosya Yükle"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Bir soru sorun..."
              className="flex-1 text-sm bg-gray-100 border-none rounded-full px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() && !isLoading}
              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-2 p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-105 ${
          isOpen ? 'bg-gray-800 text-white rotate-90' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <Bot className="w-6 h-6 animate-bounce" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap text-sm font-medium">
              Asistana Sor
            </span>
          </>
        )}
      </button>
    </div>
  );
}