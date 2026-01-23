import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { QrCode, Smartphone, Wifi, WifiOff, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function WhatsAppConnection() {
    const { user } = useAuth();
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const pollInterval = useRef<NodeJS.Timeout | null>(null);

    // Initial Load
    useEffect(() => {
        if (user) fetchSession();
        return () => stopPolling();
    }, [user]);

    // Polling Logic: Only poll if status is 'scanning' or 'connected'
    useEffect(() => {
        stopPolling();
        
        // Always poll if we are generating or scanning to catch the update
        if (session?.status === 'scanning' || generating) {
            pollInterval.current = setInterval(fetchSession, 2000);
        } else if (session?.status === 'connected') {
            pollInterval.current = setInterval(fetchSession, 5000);
        } else {
             // Even if disconnected, poll occasionally in case of external updates
             pollInterval.current = setInterval(fetchSession, 3000);
        }
        
        return () => stopPolling();
    }, [session?.status, generating]);

    function stopPolling() {
        if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
        }
    }

    async function fetchSession() {
        try {
            const { data } = await supabase
                .from('whatsapp_sessions')
                .select('*')
                .eq('user_id', user?.id)
                .single();
            
            if (data) {
                setSession(prev => {
                    // Simple check: if status changed, definitely update
                    if (prev?.status !== data.status) return data;
                    // If QR changed, update
                    if (prev?.qr_code !== data.qr_code) return data;
                    // Deep check for other fields
                    if (JSON.stringify(prev) !== JSON.stringify(data)) return data;
                    return prev;
                });
            } else {
                 setSession(null);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching session:', error);
        }
    }

    async function startNewSession() {
        setConfirmDisconnect(false);
        setGenerating(true);
        try {
            // Force reset session in DB to trigger backend restart
            const { data, error } = await supabase
                .from('whatsapp_sessions')
                .upsert({
                    user_id: user?.id,
                    status: 'scanning',
                    qr_code: null, // Clear old QR
                    phone_number: null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .select()
                .single();

            if (error) throw error;
            setSession(data);
            
            // Wait a bit and check if backend picked it up
            // toast.success('QR Kod isteği gönderildi...');
        } catch (error: any) {
            toast.error('Hata: ' + error.message);
        } finally {
            setGenerating(false);
        }
    }

    async function disconnect() {
        try {
            await supabase
                .from('whatsapp_sessions')
                .update({ 
                    status: 'disconnected', 
                    qr_code: null, 
                    phone_number: null 
                })
                .eq('user_id', user?.id);
            
            setSession(prev => ({ ...prev, status: 'disconnected', qr_code: null }));
            toast.success('Bağlantı kesildi.');
        } catch (error) {
            toast.error('Hata oluştu.');
        }
    }

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

    const status = session?.status || 'disconnected';
    const qrCode = session?.qr_code;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Smartphone className="text-green-600" />
                WhatsApp Bağlantısı
            </h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-8 text-center">
                
                {/* STATE: DISCONNECTED */}
                {status === 'disconnected' && (
                    <div className="space-y-6">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                            <WifiOff size={40} />
                        </div>
                        <h2 className="text-xl font-semibold">Bağlantı Yok</h2>
                        <p className="text-gray-500">Botu aktif etmek için QR kod oluşturun.</p>
                        
                        <button 
                            onClick={startNewSession} 
                            disabled={generating}
                            className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center mx-auto gap-2 disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="animate-spin" /> : <QrCode size={20} />}
                            {generating ? 'Başlatılıyor...' : 'QR Kod Oluştur'}
                        </button>
                    </div>
                )}

                {/* STATE: SCANNING (QR) */}
                {status === 'scanning' && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold animate-pulse">QR Kod Bekleniyor...</h2>
                        
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 inline-block min-w-[300px] min-h-[300px] flex items-center justify-center bg-gray-50">
                            {qrCode ? (
                                <img 
                                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} 
                                    alt="QR Code" 
                                    className="w-64 h-64 object-contain" 
                                />
                            ) : (
                                <div className="text-gray-400 flex flex-col items-center">
                                    <Loader2 className="animate-spin mb-2" size={32} />
                                    <span>Backend'den QR bekleniyor...</span>
                                    <span className="text-xs mt-2">Bu işlem 5-10 saniye sürebilir.</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-center gap-4">
                            <button onClick={() => setConfirmDisconnect(true)} className="text-red-500 text-sm hover:underline">
                                İptal Et
                            </button>
                        </div>
                    </div>
                )}

                {/* STATE: CONNECTED */}
                {status === 'connected' && (
                    <div className="space-y-6">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                            <Wifi size={40} />
                        </div>
                        <h2 className="text-xl font-semibold text-green-700">Bağlı</h2>
                        <div className="bg-green-50 p-4 rounded-lg inline-block">
                            <p className="text-sm text-gray-500">Telefon Numarası</p>
                            <p className="text-lg font-mono font-bold">{session?.phone_number}</p>
                        </div>
                        <div>
                            {!confirmDisconnect ? (
                                <button 
                                    onClick={() => setConfirmDisconnect(true)}
                                    className="border border-red-200 text-red-600 px-6 py-2 rounded-lg hover:bg-red-50 transition-colors inline-flex items-center gap-2"
                                >
                                    <LogOut size={18} />
                                    Bağlantıyı Kes
                                </button>
                            ) : (
                                <div className="flex flex-col gap-2 items-center">
                                    <p className="text-sm text-red-600 font-medium">Emin misiniz?</p>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={disconnect}
                                            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                                        >
                                            Evet, Kes
                                        </button>
                                        <button 
                                            onClick={() => setConfirmDisconnect(false)}
                                            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300 transition-colors"
                                        >
                                            Vazgeç
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Custom Confirm Modal for Cancel Scanning */}
            {status === 'scanning' && confirmDisconnect && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 text-center">
                        <h3 className="text-lg font-bold mb-2">İşlemi İptal Et?</h3>
                        <p className="text-gray-600 mb-6 text-sm">QR kod tarama işlemini iptal etmek istediğinize emin misiniz?</p>
                        <div className="flex justify-center gap-3">
                            <button 
                                onClick={() => setConfirmDisconnect(false)}
                                className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors"
                            >
                                Hayır
                            </button>
                            <button 
                                onClick={disconnect}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Evet, İptal Et
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
