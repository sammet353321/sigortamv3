
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Teklif } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { 
    Check, FileText, Car, User, Upload, 
    CreditCard, Save, X
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { analyzePolicyWithGemini } from '@/lib/gemini';
import { toast } from 'react-hot-toast';
import WhatsAppMessages from './WhatsAppMessages';
import { format } from 'date-fns';

export default function EmployeeQuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // States
  const [quote, setQuote] = useState<Teklif | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  
  // Chat State
  const [groupId, setGroupId] = useState<string | null>(null);
  const [targetPhone, setTargetPhone] = useState<string | null>(null);
  const [targetName, setTargetName] = useState('');

  // Form Fields
  const [taliName, setTaliName] = useState('');
  
  // Policy Scan Fields
  const [policySirket, setPolicySirket] = useState('');
  const [policyAcente, setPolicyAcente] = useState('');
  const [policyBitisTarihi, setPolicyBitisTarihi] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  
  // Customer Info
  const [adSoyad, setAdSoyad] = useState('');
  const [dogumTarihi, setDogumTarihi] = useState('');
  const [tcVkn, setTcVkn] = useState('');
  
  // Vehicle Info
  const [plaka, setPlaka] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [sasi, setSasi] = useState('');
  const [aracCinsi, setAracCinsi] = useState('');
  
  // Financials
  const [brutPrim, setBrutPrim] = useState('');
  const [netPrim, setNetPrim] = useState('');
  const [komisyon, setKomisyon] = useState('');
  
  // Other
  const [kartBilgisi, setKartBilgisi] = useState('');
  const [notlar, setNotlar] = useState('');
  
  // Files
  const [uploadedPolicyFile, setUploadedPolicyFile] = useState<File | null>(null);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  async function fetchData() {
    try {
        const { data: quoteData, error: quoteError } = await supabase
            .from('teklifler')
            .select('*')
            .eq('id', id!)
            .single();
        
        if (quoteError) throw quoteError;

        setQuote(quoteData);

        // 1. Determine Chat Target & Tali Name
        const misafir = quoteData.misafir_bilgi || {};
        let groupName = quoteData.ilgili_kisi || 'Bilinmiyor';
        
        if (misafir.group_id) {
            setGroupId(misafir.group_id);
            // Fetch group name if not in quote
            if (!quoteData.ilgili_kisi) {
                const { data: grp } = await supabase.from('chat_groups').select('name').eq('id', misafir.group_id).single();
                if (grp) groupName = grp.name;
            }
        } else if (misafir.phone) {
            setTargetPhone(misafir.phone);
        }
        
        setTaliName(groupName);
        setTargetName(groupName);

        // 2. Pre-fill Form from Quote
        setAdSoyad(quoteData.ad_soyad || '');
        setDogumTarihi(quoteData.dogum_tarihi || '');
        setTcVkn(quoteData.tc_vkn || '');
        
        setPlaka(quoteData.plaka || '');
        setBelgeNo(quoteData.belge_no || '');
        setSasi(quoteData.sasi_no || quoteData.sasi || ''); // Handle both column names
        setAracCinsi(quoteData.arac_cinsi || '');
        
        // Notes pre-fill
        setNotlar(quoteData.ek_bilgiler_iletisim || quoteData.ek_bilgiler || '');

    } catch (error) {
        console.error(error);
        toast.error('Teklif yüklenemedi');
    } finally {
        setLoading(false);
    }
  }

  const handlePolicyScan = async (file: File) => {
      setScanning(true);
      setUploadedPolicyFile(file);
      
      try {
          const result = await analyzePolicyWithGemini(file);
          if (result) {
              setPolicySirket(result.sirket || '');
              setPolicyAcente(result.acente || '');
              setPolicyBitisTarihi(result.bitis_tarihi || '');
              setPolicyNo(result.police_no || '');
              
              // Helper to clean currency (Remove dots and spaces, keep comma)
              const cleanVal = (val: string) => val ? val.replace(/[\.\s]/g, '') : '';

              if (result.brut_prim) setBrutPrim(cleanVal(result.brut_prim));
              if (result.net_prim) setNetPrim(cleanVal(result.net_prim));
              if (result.komisyon) setKomisyon(cleanVal(result.komisyon));
              
              toast.success('Poliçe tarandı ve bilgiler dolduruldu.');
          }
      } catch (error: any) {
          console.error('Scan Error:', error);
          toast.error('Tarama hatası: ' + error.message);
      } finally {
          setScanning(false);
      }
  };

  const calculateCommission = (rate: number) => {
      // Parse Turkish format (10.000,50 -> 10000.50) for calculation
      // But user wants display as 10000,50 (no thousands dot, comma decimal)
      
      // Clean input: remove dots (thousands), replace comma with dot
      const cleanNet = netPrim.replace(/\./g, '').replace(',', '.');
      const netVal = parseFloat(cleanNet);
      
      if (!isNaN(netVal)) {
          const commVal = netVal * rate;
          // Format back to TR style: Comma decimal, no thousands separator
          const formatted = commVal.toFixed(2).replace('.', ',');
          setKomisyon(formatted);
      } else {
          toast.error('Geçerli bir Net Prim giriniz.');
      }
  };

  const handleFinalize = async () => {
      if (!policySirket || !policyNo) {
          toast.error('Şirket ve Poliçe No zorunludur.');
          return;
      }

      setSaving(true);
      try {
          // 1. Save to Database (Policeler Table)
          // Clean currency strings to numbers for DB
          const cleanCurrency = (val: string) => {
              if (!val) return 0;
              return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
          };

          const policyData = {
              teklif_id: id,
              kesen: user?.name || user?.email || 'Bilinmiyor', // Kesen kişi ismi
              employee_id: user?.id,
              tarih: new Date().toISOString(), // Default init
              tanzim_tarihi: new Date().toISOString(), // Oluşturulma (Bugün)
              
              // Mapped Fields
              ad_soyad: adSoyad,
              tc_vkn: tcVkn,
              plaka: plaka,
              belge_no: belgeNo,
              sasi: sasi,
              arac_cinsi: aracCinsi,
              dogum_tarihi: dogumTarihi || null,
              
              sirket: policySirket,
              acente: policyAcente,
              police_no: policyNo,
              
              tur: quote?.tur,
              brut_prim: cleanCurrency(brutPrim),
              net_prim: cleanCurrency(netPrim),
              komisyon: cleanCurrency(komisyon),
              
              ek_bilgiler_iletisim: notlar,
              kart: kartBilgisi,
              ilgili_kisi: taliName,
              
              // Copy misafir_bilgi for Tali tracking
              misafir_bilgi: quote?.misafir_bilgi
          };

          // Parse Date helper
          const parseTRDate = (d: string) => {
               if(!d) return null;
               const parts = d.split('.');
               if(parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
               return null;
          };
          
          // Use 'tarih' field for Expiry Date in Policy Table? 
          // Previous PolicyTable uses 'tarih' as Expiry Date.
          // So we map policyBitisTarihi to 'tarih'.
          policyData.tarih = parseTRDate(policyBitisTarihi) || new Date().toISOString();

          const { error: dbError } = await supabase.from('policeler').insert(policyData);
          if (dbError) throw dbError;

          // 2. Update Quote Status
          await supabase.from('teklifler').update({ durum: 'policelesti' }).eq('id', id!);

          // 3. Send WhatsApp Messages
          if (groupId || targetPhone) {
              const target = {
                  group_id: groupId || null,
                  sender_phone: targetPhone || '',
                  user_id: user?.id
              };

              // A. Send PDF File
              if (uploadedPolicyFile) {
                   const fileName = `${Date.now()}-${uploadedPolicyFile.name}`;
                   const filePath = `${groupId || 'chat'}/${fileName}`;
                   
                   const { error: upError } = await supabase.storage.from('chat-media').upload(filePath, uploadedPolicyFile);
                   if (!upError) {
                       const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filePath);
                       
                       await supabase.from('messages').insert({
                           ...target,
                           direction: 'outbound',
                           type: 'document',
                           content: uploadedPolicyFile.name,
                           media_url: publicUrl,
                           status: 'pending'
                       });
                       
                       // Small delay
                       await new Promise(r => setTimeout(r, 1000));
                   }
              }

              // B. Send Text: NAME SURNAME PLATE PRODUCT
              const textMsg = `${adSoyad} ${plaka} ${quote?.tur || ''}`.trim().toUpperCase();
              await supabase.from('messages').insert({
                  ...target,
                  direction: 'outbound',
                  type: 'text',
                  content: textMsg,
                  status: 'pending'
              });
          }

          toast.success('Poliçe oluşturuldu ve gönderildi!');
          navigate('/employee/policies');

      } catch (error: any) {
          console.error('Finalize Error:', error);
          toast.error('Hata: ' + error.message);
      } finally {
          setSaving(false);
      }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>;

  const isVehicleProduct = ['TRAFİK', 'KASKO', 'İMM'].includes(quote?.tur || '');

  return (
    <div className="h-screen grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-gray-100">
        
        {/* LEFT: WhatsApp Chat */}
        <div className="lg:col-span-6 h-full border-r border-gray-300 overflow-hidden">
            <WhatsAppMessages embedded={true} initialGroupId={groupId} hideSidebar={false} />
        </div>

        {/* RIGHT: Policy Form */}
        <div className="lg:col-span-6 h-full overflow-y-auto p-6 bg-white">
            <div className="max-w-3xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b pb-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800 flex items-center">
                            <FileText className="mr-2 text-green-600" />
                            Poliçeleştirme Ekranı
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">Teklif No: #{id?.slice(0,8)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <StatusBadge status={quote?.durum || ''} />
                        <button 
                            onClick={() => navigate('/employee/quotes')} 
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Kapat"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* 1. Tali / Grup (Read Only) */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tali / Grup (Değiştirilemez)</label>
                    <input 
                        type="text" 
                        value={taliName} 
                        readOnly 
                        className="w-full bg-gray-200 border border-gray-300 text-gray-600 rounded-lg px-3 py-2 font-bold cursor-not-allowed"
                    />
                </div>

                {/* 2. PDF Upload & AI Scan */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-sm">
                    <label className="block text-sm font-bold text-blue-800 mb-2 flex items-center">
                        <Upload size={16} className="mr-2" />
                        Poliçe PDF Yükle & Tara (AI)
                    </label>
                    <div className="flex items-center gap-3">
                        <label className={`flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadedPolicyFile ? 'border-green-400 bg-green-50' : 'border-blue-300 hover:bg-blue-100'}`}>
                            {scanning ? (
                                <div className="animate-pulse text-blue-600 font-bold text-sm">Taranıyor...</div>
                            ) : uploadedPolicyFile ? (
                                <div className="text-center">
                                    <Check className="mx-auto text-green-600 mb-1" />
                                    <span className="text-xs text-green-700 font-bold">{uploadedPolicyFile.name}</span>
                                    <p className="text-[10px] text-green-600">Tekrar yüklemek için tıklayın</p>
                                </div>
                            ) : (
                                <div className="text-center text-blue-500">
                                    <FileText className="mx-auto mb-1" />
                                    <span className="text-xs font-bold">PDF Seçin</span>
                                </div>
                            )}
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf,image/*"
                                onChange={(e) => e.target.files?.[0] && handlePolicyScan(e.target.files[0])}
                            />
                        </label>
                    </div>
                </div>

                {/* 3. Company Info */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">ŞİRKET</label>
                        <input 
                            type="text" 
                            value={policySirket} 
                            onChange={(e) => setPolicySirket(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Örn: AK, NEOVA"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">BİTİŞ TARİHİ</label>
                        <input 
                            type="text" 
                            value={policyBitisTarihi} 
                            onChange={(e) => setPolicyBitisTarihi(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="GG.AA.YYYY"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">ACENTE</label>
                        <input 
                            type="text" 
                            value={policyAcente} 
                            onChange={(e) => setPolicyAcente(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* 4. Customer Info */}
                <div className="border-t pt-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <User size={16} className="mr-2" /> Müşteri Bilgileri
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">ADI SOYADI</label>
                            <input 
                                type="text" 
                                value={adSoyad} 
                                onChange={(e) => setAdSoyad(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">DOĞUM TARİHİ</label>
                            <input 
                                type="text" // Keep as text to show DB format or Date picker
                                value={dogumTarihi ? format(new Date(dogumTarihi), 'yyyy-MM-dd') : ''}
                                readOnly
                                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-gray-500"
                            />
                        </div>
                        {/* Hidden/Read-only TC/VKN */}
                        <div className="hidden">
                            <input type="text" value={tcVkn} readOnly />
                        </div>
                    </div>
                </div>

                {/* 5. Vehicle Info (Conditional) */}
                {isVehicleProduct && (
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                            <Car size={16} className="mr-2" /> Araç Bilgileri
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">PLAKA</label>
                                <input 
                                    type="text" 
                                    value={plaka} 
                                    onChange={(e) => setPlaka(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">BELGE NO</label>
                                <input 
                                    type="text" 
                                    value={belgeNo} 
                                    onChange={(e) => setBelgeNo(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">ŞASİ</label>
                                <input 
                                    type="text" 
                                    value={sasi} 
                                    onChange={(e) => setSasi(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">ARAÇ CİNSİ</label>
                                <input 
                                    type="text" 
                                    value={aracCinsi} 
                                    onChange={(e) => setAracCinsi(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. Premium Info */}
                <div className="border-t pt-4 bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <CreditCard size={16} className="mr-2" /> Prim Bilgileri
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">BRÜT PRİM</label>
                            <input 
                                type="text" 
                                value={brutPrim} 
                                onChange={(e) => setBrutPrim(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="10000,00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">NET PRİM</label>
                            <input 
                                type="text" 
                                value={netPrim} 
                                onChange={(e) => setNetPrim(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="8000,00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 flex justify-between">
                                KOMİSYON
                                <div className="flex gap-1">
                                    <button onClick={() => calculateCommission(0.10)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] px-1.5 rounded font-bold transition-colors">T</button>
                                    <button onClick={() => calculateCommission(0.20)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] px-1.5 rounded font-bold transition-colors">K</button>
                                </div>
                            </label>
                            <input 
                                type="text" 
                                value={komisyon} 
                                onChange={(e) => setKomisyon(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0,00"
                            />
                        </div>
                    </div>
                </div>

                {/* 7. Card Info */}
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">KART BİLGİSİ</label>
                    <input 
                        type="text" 
                        value={kartBilgisi} 
                        onChange={(e) => setKartBilgisi(e.target.value)}
                        className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Kart bilgisi giriniz..."
                    />
                </div>

                {/* 8. Notes */}
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">NOTLAR (EK BİLGİLER / İLETİŞİM)</label>
                    <textarea 
                        value={notlar} 
                        onChange={(e) => setNotlar(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                    />
                </div>

                {/* Submit Button */}
                <button 
                    onClick={handleFinalize}
                    disabled={saving}
                    className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 shadow-lg transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                >
                    {saving ? (
                        <span className="animate-pulse">Kaydediliyor...</span>
                    ) : (
                        <>
                            <Save size={20} className="mr-2" />
                            POLİÇELEŞTİR
                        </>
                    )}
                </button>

            </div>
        </div>
    </div>
  );
}
