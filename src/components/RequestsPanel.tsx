
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Plus, CheckCircle, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Request {
  id: string;
  content: string;
  status: 'resolved' | 'unresolved';
  created_at: string;
}

export default function RequestsPanel() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newRequestContent, setNewRequestContent] = useState('');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true }); // Oldest first

      if (error) throw error;

      if (data) {
        // Sort: Unresolved first (by date), then Resolved (by date)
        const sorted = data.sort((a, b) => {
          if (a.status === b.status) {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }
          return a.status === 'unresolved' ? -1 : 1;
        });
        setRequests(sorted);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequest = async () => {
    if (!newRequestContent.trim() || !user) return;

    try {
      const { data, error } = await supabase
        .from('requests')
        .insert([{ user_id: user.id, content: newRequestContent, status: 'unresolved' }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setRequests(prev => {
            const newList = [...prev, data];
             // Re-sort
            return newList.sort((a, b) => {
                if (a.status === b.status) {
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                }
                return a.status === 'unresolved' ? -1 : 1;
            });
        });
        setNewRequestContent('');
        setIsAdding(false);
      }
    } catch (error) {
      console.error('Error adding request:', error);
    }
  };

  const toggleStatus = async (id: string, currentStatus: 'resolved' | 'unresolved') => {
    const newStatus = currentStatus === 'resolved' ? 'unresolved' : 'resolved';
    try {
      const { error } = await supabase
        .from('requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setRequests(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, status: newStatus } : r);
        // Re-sort
        return updated.sort((a, b) => {
          if (a.status === b.status) {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }
          return a.status === 'unresolved' ? -1 : 1;
        });
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
      try {
          const { error } = await supabase.from('requests').delete().eq('id', id);
          if (error) throw error;
          setRequests(prev => prev.filter(r => r.id !== id));
      } catch (error) {
          console.error('Error deleting request:', error);
      }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">Taleplerim</h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
          title="Talep Ekle"
        >
          <Plus size={20} />
        </button>
      </div>

      {isAdding && (
        <div className="mb-4 animate-in slide-in-from-top-2 fade-in">
          <textarea
            value={newRequestContent}
            onChange={(e) => setNewRequestContent(e.target.value)}
            placeholder="Talebinizi buraya yazın..."
            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              İptal
            </button>
            <button
              onClick={handleAddRequest}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar" style={{ maxHeight: '300px' }}>
        {loading ? (
            <p className="text-center text-gray-400 text-sm py-4">Yükleniyor...</p>
        ) : requests.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-4">Henüz talep yok.</p>
        ) : (
          requests.map((req) => (
            <div
              key={req.id}
              className={`p-3 rounded-lg border transition-all ${
                req.status === 'resolved' 
                  ? 'bg-green-50 border-green-100 opacity-75' 
                  : 'bg-white border-gray-200 hover:border-blue-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleStatus(req.id, req.status)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    req.status === 'resolved' ? 'text-green-600' : 'text-gray-300 hover:text-green-500'
                  }`}
                >
                  {req.status === 'resolved' ? <CheckCircle size={18} /> : <div className="w-[18px] h-[18px] rounded-full border-2 border-current" />}
                </button>
                
                <div className="flex-1 min-w-0" onClick={() => setExpandedRequestId(expandedRequestId === req.id ? null : req.id)}>
                    <p className={`text-sm cursor-pointer ${req.status === 'resolved' ? 'text-gray-500 line-through' : 'text-gray-800'} ${expandedRequestId === req.id ? '' : 'truncate'}`}>
                        {req.content}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-gray-400">
                            {format(new Date(req.created_at), 'dd MMM yyyy HH:mm', { locale: tr })}
                        </span>
                    </div>
                </div>

                <button 
                    onClick={() => handleDelete(req.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                >
                    <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
