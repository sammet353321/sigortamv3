import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Teklif } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { 
    ArrowLeft, Check, FileText, Car, Calendar, 
    User, Paperclip, Upload, ZoomIn, ZoomOut, RotateCw, ScanLine, Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { analyzeLicenseWithGemini, analyzePolicyWithGemini } from '@/lib/gemini';

export default function EmployeeQuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // States
  const [quote, setQuote] = useState<Teklif | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [policyScanning, setPolicyScanning] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string, type: 'image' | 'file', name: string }[]>([]);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  
  // Form Fields
  const [adSoyad, setAdSoyad] = useState('');
  const [tcVkn, setTcVkn] = useState('');
  const [dogumTarihi, setDogumTarihi] = useState('');
  const [plaka, setPlaka] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [sasiNo, setSasiNo] = useState('');
  const [aracCinsi, setAracCinsi] = useState('');
  
  // Quote Fields
  const [oncekiSirket, setOncekiSirket] = useState('');
  const [bitisTarihi, setBitisTarihi] = useState('');
  const [urun, setUrun] = useState('');
  const [offerDetails, setOfferDetails] = useState(''); 
  const [notes, setNotes] = useState('');

  // Policy Fields
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policySirket, setPolicySirket] = useState('');
  const [policyAcente, setPolicyAcente] = useState('');
  const [policyBitisTarihi, setPolicyBitisTarihi] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [brutPrim, setBrutPrim] = useState('');
  const [netPrim, setNetPrim] = useState('');
  const [komisyon, setKomisyon] = useState('');
  const [policyKartBilgisi, setPolicyKartBilgisi] = useState(''); // New State
  
  // Auto OCR Ref
  const autoScanTriggered = useRef(false);

  // Image Viewer State
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  // Auto OCR Effect
  useEffect(() => {
    if (quote?.kart_bilgisi && !autoScanTriggered.current) {
        autoScanTriggered.current = true;
        // Small delay to ensure UI is ready
        setTimeout(() => {
            handleOCR(true); // true = silent mode (no alert)
        }, 500);
    }
  }, [quote?.kart_bilgisi]);

  async function fetchData() {
    try {
        const { data: quoteData, error: quoteError } = await supabase
            .from('teklifler')
            .select('*, ilgili_kisi:users!ilgili_kisi_id(name, phone)')
            .eq('id', id!)
            .single();
        
        if (quoteError) throw quoteError;

        // Fetch Group Name if needed
        let groupName = null;
        const misafirInfo = (quoteData as any).misafir_bilgi as any;
        if (misafirInfo?.group_id) {
            const { data: group } = await supabase
                .from('chat_groups')
                .select('name')
                .eq('id', misafirInfo.group_id)
                .single();
            groupName = group?.name;
        }

        // Attach group name manually to quote object for display
        (quoteData as any).group_name = groupName;

        setQuote(quoteData);
        
        // Populate fields
        setAdSoyad(quoteData.ad_soyad || '');
        setTcVkn(quoteData.tc_vkn || '');
        setDogumTarihi(quoteData.dogum_tarihi || '');
        setPlaka(quoteData.plaka || '');
        setBelgeNo(quoteData.belge_no || '');
        setSasiNo(quoteData.sasi_no || ''); 
        setAracCinsi(quoteData.arac_cinsi || '');
        
        setOncekiSirket(quoteData.onceki_sirket || '');
        setBitisTarihi(quoteData.bitis_tarihi || '');
        setUrun(quoteData.tur || ''); // 'tur' column maps to 'urun'

        setOfferDetails(quoteData.ek_bilgiler || '');
        setNotes(''); 

        // Mark as 'islemde'
        if (quoteData.durum === 'bekliyor') {
            await supabase.from('teklifler').update({ durum: 'islemde', kesen_id: user?.id }).eq('id', id!);
        }

        // If status is 'hesaplandi', automatically show policy form
        if (quoteData.durum === 'hesaplandi') {
            setShowPolicyForm(true);
        }
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  }

  // GEMINI OCR Function (Replaces Tesseract)
  const handleOCR = async (silent = false) => {
      if (!quote?.kart_bilgisi) return;
      
      setOcrScanning(true);
      try {
          // 1. Fetch Image
          const response = await fetch(quote.kart_bilgisi);
          const blob = await response.blob();
          const file = new File([blob], "ruhsat.jpg", { type: blob.type });

          // 2. Call Gemini
          const result = await analyzeLicenseWithGemini(file);
          
          if (result) {
              if (result.plaka) setPlaka(result.plaka.toUpperCase());
              if (result.tc_vkn) setTcVkn(result.tc_vkn);
              if (result.belge_no) setBelgeNo(result.belge_no.toUpperCase());
              if (result.sasi_no) setSasiNo(result.sasi_no.toUpperCase());
              
              if (result.arac_cinsi) {
                  // Clean Vehicle Type: Take first word or known types
                  let rawType = result.arac_cinsi.toUpperCase();
                  let cleanType = rawType;
                  if (rawType.includes("OTOMOBİL")) cleanType = "OTOMOBİL";
                  else if (rawType.includes("KAMYONET")) cleanType = "KAMYONET";
                  else if (rawType.includes("MOTOSİKLET")) cleanType = "MOTOSİKLET";
                  else cleanType = rawType.split(' ')[0]; // Fallback to first word
                  
                  setAracCinsi(cleanType);
              }
              
              if (!silent) alert('Tarama tamamlandı (Gemini 2.0).');
          } else {
              if (!silent) alert('Metin okunamadı.');
          }

      } catch (err: any) {
          console.error('OCR Error:', err);
          if (!silent) alert('Tarama başarısız oldu: ' + err.message);
      } finally {
          setOcrScanning(false);
      }
  };


  // Helper for TC Button
  const handleTCOCR = () => {
      if (confirm('TC Numarasını ruhsattan okumak için tarama başlatılsın mı?')) {
          handleOCR();
      }
  };

  const handlePasteImage = async () => {
    // Valid image types
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

    try {
        // Method 1: Clipboard API (Modern)
        const items = await navigator.clipboard.read();
        let imageFound = false;
        
        for (const item of items) {
            // Find any type that starts with image/
            const imageType = item.types.find(type => type.startsWith('image/'));
            
            if (imageType) {
                imageFound = true;
                const blob = await item.getType(imageType);
                
                // Determine correct extension
                let ext = 'png';
                if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
                else if (blob.type.includes('webp')) ext = 'webp';
                else if (blob.type.includes('gif')) ext = 'gif';
                
                const file = new File([blob], `teklif-resmi-${Date.now()}.${ext}`, { type: blob.type });
                await uploadFile(file, 'offer-image');
                break; // Upload one image at a time
            }
        }
        
        if (!imageFound) {
            alert('Panoda uygun formatta resim bulunamadı. \n\nİpucu: Bir resim dosyasını kopyalamak yerine, resmi açıp "Resmi Kopyala" diyerek deneyin veya ekran alıntısı (Screenshot) kullanın.');
        }

    } catch (err) {
        console.error('Paste failed:', err);
        alert('Panoya erişilemedi. Lütfen tarayıcı izinlerini kontrol edin veya "Ctrl+V" kısayolunu deneyin.');
    }
  };

  const uploadFile = async (file: File, type: 'offer-image' | 'document') => {
    if (!user) return;
    setSaving(true);
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${type}-${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('documents')
            .getPublicUrl(filePath);

        // Add to attachments list
        setAttachments(prev => [...prev, {
            url: publicUrl,
            type: type === 'offer-image' ? 'image' : 'file',
            name: file.name
        }]);
        
    } catch (error: any) {
        console.error('Upload error:', error);
        alert('Dosya yüklenirken hata oluştu: ' + error.message);
    } finally {
        setSaving(false);
    }
  };
  
  const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
        // Validation: TC entered -> Birth Date required
        if (tcVkn && tcVkn.length === 11 && !dogumTarihi) {
            alert('TC Kimlik No girildiyse Doğum Tarihi zorunludur!');
            setSaving(false);
            return;
        }

        // Bitis Tarihi Default Logic
        const finalBitisTarihi = bitisTarihi || new Date().toISOString().split('T')[0];

        // 1. Update Quote in DB
        const { error } = await supabase
            .from('teklifler')
            .update({ 
                durum: 'hesaplandi',
                kesen_id: user?.id,
                guncellenme_tarihi: new Date().toISOString(),
                
                // Mapped Fields
                ad_soyad: adSoyad,
                tc_vkn: tcVkn,
                dogum_tarihi: dogumTarihi || null,
                plaka: plaka,
                belge_no: belgeNo,
                sasi_no: sasiNo,
                arac_cinsi: aracCinsi,
                
                // Temp Solution: Store extra fields in notes if columns are missing
                // onceki_sirket: oncekiSirket,
                // bitis_tarihi: finalBitisTarihi,
                tur: urun, 

                // "Poliçe No" gets "Offer Details" as requested
                police_no: offerDetails, 
                ek_bilgiler: offerDetails,
                
                // Append extra info to notes
                notlar: `Önceki Şirket: ${oncekiSirket} | Bitiş: ${finalBitisTarihi} | \n` + notes,
             })
            .eq('id', id!);

        if (error) throw error;

        // 2. Send WhatsApp Message (if source is whatsapp)
        const misafirInfo = quote?.misafir_bilgi as any;
        
        if (misafirInfo?.source === 'whatsapp' || misafirInfo?.source === 'whatsapp_group') {
            const targetPhone = misafirInfo.phone;
            const groupId = misafirInfo.group_id; 

            if (targetPhone) {
                // 1. Send Attachments First
                for (const att of attachments) {
                    await supabase.from('messages').insert({
                        sender_phone: targetPhone,
                        group_id: groupId || null,
                        direction: 'outbound',
                        type: att.type === 'image' ? 'image' : 'text', 
                        content: att.type === 'image' ? '' : `📄 Belge: ${att.url}`, // No caption for images
                        media_url: att.type === 'image' ? att.url : null,
                        status: 'pending'
                    });
                }

                // 2. Send Text Message
                // Template:
                // SAMET ÇELEN TRAFİK 35ARV922
                // ANADOLU ..... TEK ÇEKİM
                
                const headerLine = `${(adSoyad || 'MÜŞTERİ').toUpperCase()} ${(urun || 'SİGORTA').toUpperCase()} ${(plaka || '').toUpperCase()}`;
                
                // Plain text format without markdown bold or labels
                const messageBody = `${headerLine}\n` +
                                    `${offerDetails}\n\n` +
                                    (notes ? `${notes}` : '');
                
                await supabase.from('messages').insert({
                    sender_phone: targetPhone,
                    group_id: groupId || null,
                    direction: 'outbound',
                    type: 'text',
                    content: messageBody,
                    status: 'pending'
                });
                
                alert('Teklif kaydedildi ve WhatsApp mesajı gönderildi!');
            } else {
                alert('Teklif kaydedildi (WhatsApp numarası bulunamadı).');
            }
        } else {
            alert('Teklif kaydedildi.');
        }
        
        navigate('/employee/dashboard');

    } catch (error) {
        console.error('Error:', error);
        alert('İşlem başarısız.');
    } finally {
        setSaving(false);
    }
  };

  const handlePolicyScan = async (file: File) => {
      setPolicyScanning(true);
      try {
          const result = await analyzePolicyWithGemini(file);
          if (result) {
              // Acente Mapping
              let acente = result.acente || '';
              const acenteUpper = acente.toUpperCase();
              if (acenteUpper.includes('KOÇ') || acenteUpper.includes('ACAR')) acente = 'KOÇ SİGORTA';
              else if (acenteUpper.includes('WİN') || acenteUpper.includes('WIN')) acente = 'TİMURLAR';
              
              setPolicyAcente(acente);
              setPolicySirket(result.sirket || '');
              setPolicyBitisTarihi(result.bitis_tarihi || '');
              setPolicyNo(result.police_no || '');
              setBrutPrim(result.brut_prim || '');
              setNetPrim(result.net_prim || '');
              setKomisyon(result.komisyon || '');
              
              alert('Poliçe tarandı ve bilgiler dolduruldu.');
          }
      } catch (error: any) {
          console.error('Policy Scan Error:', error);
          alert('Poliçe taranamadı: ' + error.message);
      } finally {
          setPolicyScanning(false);
      }
  };

  const handlePolicyFinalize = async () => {
      if (!policySirket || !policyAcente || !policyNo) {
          alert('Lütfen Şirket, Acente ve Poliçe No alanlarını doldurun.');
          return;
      }

      setSaving(true);
      try {
          // 1. Insert Policy
          const { error: policyError } = await supabase.from('policeler').insert({
              teklif_id: id,
              kesen_id: user?.id,
              ilgili_kisi_id: quote?.ilgili_kisi_id, // Same as quote
              tarih: new Date().toISOString(),
              
              // Mapped Fields
              ad_soyad: adSoyad,
              tc_vkn: tcVkn,
              plaka: plaka,
              belge_no: belgeNo,
              sasi_no: sasiNo,
              arac_cinsi: aracCinsi,
              dogum_tarihi: dogumTarihi || null,
              
              // Policy Specific
              sirket: policySirket,
              acente: policyAcente,
              police_no: policyNo,
              bitis_tarihi: policyBitisTarihi || null,
              tur: urun,
              brut_prim: parseFloat(brutPrim) || 0,
              net_prim: parseFloat(netPrim) || 0,
              komisyon: parseFloat(komisyon) || 0,
              ek_bilgiler: offerDetails, // Carry over details
              kart_bilgisi: policyKartBilgisi || quote?.kart_bilgisi // Use manual input if present, else fallback to quote image
          });

          if (policyError) throw policyError;

          // 2. Update Quote Status
          const { error: quoteError } = await supabase
              .from('teklifler')
              .update({ durum: 'policelesti' })
              .eq('id', id!);

          if (quoteError) throw quoteError;

          alert('Poliçe başarıyla oluşturuldu!');
          navigate('/employee/policies');

      } catch (error: any) {
          console.error('Policy Creation Error:', error);
          alert('İşlem başarısız: ' + error.message);
      } finally {
          setSaving(false);
      }
  };

  const handlePolicyCreate = () => {
      setShowPolicyForm(true);
  };

  if (loading) return <div className="flex justify-center items-center h-screen">Yükleniyor...</div>;
  if (!quote) return <div>Teklif bulunamadı</div>;

  const taliName = ((quote as any).misafir_bilgi as any)?.source === 'whatsapp_group' 
        ? (quote as any).group_name || 'WhatsApp Grubu'
        : (quote as any).ilgili_kisi?.name || ((quote as any).misafir_bilgi as any)?.phone || 'Bilinmiyor';

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-center mb-4 px-1">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-800">
            <ArrowLeft size={18} className="mr-1" /> Geri Dön
        </button>
        <div className="flex items-center space-x-4">
            <span className="text-sm font-bold text-gray-600">Tali: {taliName}</span>
            <StatusBadge status={quote.durum} className="px-4 py-1" />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* LEFT COLUMN: Document Viewer */}
        <div className="lg:col-span-5 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center">
                    <FileText size={18} className="mr-2 text-blue-600" />
                    Ruhsat / Belge
                </h3>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => handleOCR()} 
                        disabled={ocrScanning}
                        className="flex items-center bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                        <ScanLine size={14} className="mr-1" />
                        {ocrScanning ? 'Taranıyor...' : 'TARA (OCR)'}
                    </button>
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-gray-200 rounded"><ZoomOut size={18} /></button>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 hover:bg-gray-200 rounded"><ZoomIn size={18} /></button>
                    <button onClick={() => setRotation(r => r + 90)} className="p-1 hover:bg-gray-200 rounded"><RotateCw size={18} /></button>
                </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-4 relative">
                {quote.kart_bilgisi ? (
                    <img 
                        src={quote.kart_bilgisi} 
                        alt="Ruhsat" 
                        className="transition-transform duration-200 ease-out max-w-none"
                        style={{ 
                            transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            maxHeight: '100%',
                            maxWidth: '100%'
                        }} 
                    />
                ) : (
                    <div className="text-gray-400 flex flex-col items-center">
                        <FileText size={48} className="mb-2 opacity-50" />
                        <p>Yüklü belge yok.</p>
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: Info & Forms */}
        <div className="lg:col-span-7 flex flex-col space-y-4 h-full overflow-y-auto pr-2 pb-4">
            
            {showPolicyForm ? (
                // --- POLICY CREATION MODE ---
                <div className="bg-white p-5 rounded-xl shadow-sm border border-purple-200 flex-1 flex flex-col animate-in slide-in-from-right-4 duration-300">
                    <h3 className="font-bold text-purple-800 mb-4 text-sm uppercase tracking-wide border-b border-purple-100 pb-2 flex items-center justify-between">
                        <span className="flex items-center">
                            <FileText size={16} className="mr-2 text-purple-600" />
                            Poliçe Kesme Ekranı
                        </span>
                        <button onClick={() => setShowPolicyForm(false)} className="text-gray-400 hover:text-gray-600">
                            &times;
                        </button>
                    </h3>

                    <div className="space-y-4 flex-1">
                        {/* 1. Verilen Fiyat Listesi (Offer Details) - Hide for DASK/KONUT if empty */}
                        {!['DASK', 'KONUT'].includes(urun) && (
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Verilen Fiyat Listesi</label>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                                    {offerDetails || 'Fiyat bilgisi girilmemiş.'}
                                </div>
                            </div>
                        )}

                        {/* 2. Poliçe Yükle & Tara */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <label className="block text-sm font-bold text-blue-800 mb-2">Poliçe Yükle & Otomatik Doldur</label>
                            <div className="flex items-center space-x-2">
                                <label className="flex-1 flex items-center justify-center bg-white border border-blue-300 rounded-lg py-2 px-4 text-blue-600 cursor-pointer hover:bg-blue-50 transition-colors">
                                    <Upload size={18} className="mr-2" />
                                    {policyScanning ? 'Taranıyor...' : 'PDF / Resim Seç'}
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept=".pdf,image/*"
                                        onChange={(e) => e.target.files?.[0] && handlePolicyScan(e.target.files[0])}
                                        disabled={policyScanning}
                                    />
                                </label>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-1">Acente, Şirket, Bitiş Tarihi ve Primler otomatik okunur.</p>
                        </div>

                        {/* 3. Form Fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Şirket</label>
                                <input type="text" value={policySirket} onChange={(e) => setPolicySirket(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 font-bold" placeholder="Örn: NEOVA" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Acente</label>
                                <input type="text" value={policyAcente} onChange={(e) => setPolicyAcente(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 font-bold" placeholder="Örn: KOÇ SİGORTA" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Poliçe No</label>
                                <input type="text" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono" placeholder="12345678" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Bitiş Tarihi</label>
                                <input type="date" value={policyBitisTarihi} onChange={(e) => setPolicyBitisTarihi(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5" />
                            </div>
                        </div>

                        {/* 4. Financials */}
                        <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Brüt Prim</label>
                                <input type="number" value={brutPrim} onChange={(e) => setBrutPrim(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-right font-mono" placeholder="0.00" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Net Prim</label>
                                <input type="number" value={netPrim} onChange={(e) => setNetPrim(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-right font-mono" placeholder="0.00" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Komisyon</label>
                                <input type="number" value={komisyon} onChange={(e) => setKomisyon(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-right font-mono" placeholder="0.00" />
                            </div>
                        </div>

                        {/* 5. Kart Bilgisi / Link (Optional) */}
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Kart Linki / Bilgisi (İsteğe Bağlı)</label>
                            <input 
                                type="text" 
                                value={policyKartBilgisi} 
                                onChange={(e) => setPolicyKartBilgisi(e.target.value)} 
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" 
                                placeholder="Ödeme linki veya not..." 
                            />
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-purple-100 flex space-x-3">
                        <button onClick={() => setShowPolicyForm(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">İptal</button>
                        <button 
                            onClick={handlePolicyFinalize}
                            disabled={saving}
                            className="flex-[2] py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-md flex items-center justify-center"
                        >
                            {saving ? 'Kaydediliyor...' : 'Poliçeleştir & Bitir'}
                        </button>
                    </div>
                </div>
            ) : (
                // --- STANDARD QUOTE MODE (Existing) ---
                <>
                {/* Card 1: Teklif Bilgileri (New) */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide border-b pb-2 flex items-center">
                    <FileText size={16} className="mr-2 text-blue-600" />
                    Teklif Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Önceki Şirket</label>
                        <input 
                            type="text" 
                            value={oncekiSirket} 
                            onChange={(e) => setOncekiSirket(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            placeholder="Örn: Anadolu"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Bitiş Tarihi</label>
                        <input 
                            type="date" 
                            value={bitisTarihi} 
                            onChange={(e) => setBitisTarihi(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                        <span className="text-[10px] text-gray-400">Boş bırakılırsa bugün seçilir</span>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Ürün</label>
                        <input 
                            type="text" 
                            value={urun} 
                            onChange={(e) => setUrun(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            placeholder="TRAFİK / KASKO"
                            list="products"
                        />
                        <datalist id="products">
                            <option value="TRAFİK SİGORTASI" />
                            <option value="KASKO" />
                            <option value="İMM" />
                            <option value="KONUT" />
                            <option value="DASK" />
                        </datalist>
                    </div>
                </div>
            </div>

            {/* Card 2: Müşteri Bilgileri */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide border-b pb-2 flex items-center">
                    <User size={16} className="mr-2 text-blue-600" />
                    Müşteri Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <div className="mb-2">
                            <label className="block text-xs text-gray-500 mb-1">Adı Soyadı / Ünvanı</label>
                            <input 
                                type="text" 
                                value={adSoyad} 
                                onChange={(e) => setAdSoyad(e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-bold text-gray-800"
                                placeholder="Ad Soyad"
                            />
                        </div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs text-gray-500">TC / Vergi No</label>
                            <button 
                                onClick={handleTCOCR} 
                                className="text-[10px] text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded cursor-pointer"
                                title="Ruhsattan otomatik oku"
                            >
                                Ruhsattan Al
                            </button>
                        </div>
                        <input 
                            type="text" 
                            value={tcVkn} 
                            onChange={(e) => setTcVkn(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono text-sm"
                            placeholder="11 Haneli TC"
                        />
                    </div>
                    
                    {/* Doğum Tarihi - Show only if TC is 11 chars */}
                    {tcVkn.length === 11 && (
                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                            <label className="block text-xs text-gray-500 mb-1">Doğum Tarihi (Zorunlu)</label>
                            <input 
                                type="date" 
                                value={dogumTarihi} 
                                onChange={(e) => setDogumTarihi(e.target.value)}
                                className="w-full border border-red-300 bg-red-50 rounded px-2 py-1.5 text-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Card 3: Araç Bilgileri */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide border-b pb-2 flex items-center">
                    <Car size={16} className="mr-2 text-blue-600" />
                    Araç Bilgileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Plaka</label>
                        <input 
                            type="text" 
                            value={plaka} 
                            onChange={(e) => setPlaka(e.target.value.toUpperCase())}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 font-bold text-gray-900"
                            placeholder="34 AB 123"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Belge No</label>
                        <input 
                            type="text" 
                            value={belgeNo} 
                            onChange={(e) => setBelgeNo(e.target.value.toUpperCase())}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono text-sm"
                            placeholder="AB123456"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Şasi No</label>
                        <input 
                            type="text" 
                            value={sasiNo} 
                            onChange={(e) => setSasiNo(e.target.value.toUpperCase())}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono text-sm"
                            placeholder="17 Haneli"
                        />
                    </div>
                </div>
                
                {/* Araç Cinsi Row */}
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Araç Cinsi</label>
                    <input 
                        type="text" 
                        value={aracCinsi} 
                        onChange={(e) => setAracCinsi(e.target.value.toUpperCase())}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                        placeholder="OTOMOBİL, KAMYONET..."
                    />
                </div>
            </div>

            {/* Card 4: Teklif Detayları & Form */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide border-b pb-2">Teklif Detayları (Şirket/Fiyat/Taksit)</h3>
                
                <div className="space-y-4 flex-1">
                    {/* Offers Textarea */}
                    <div>
                        <textarea 
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[120px] font-mono"
                            placeholder="Örn: Anadolu Sigorta - 2.500 TL - 12 Taksit"
                            value={offerDetails}
                            onChange={(e) => setOfferDetails(e.target.value)}
                        />
                        <button 
                            onClick={handlePasteImage}
                            className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center font-medium bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors w-full justify-center border border-blue-100"
                        >
                            <Paperclip size={16} className="mr-2" />
                            Panodan Resim Yapıştır (Sadece Resim)
                        </button>
                    </div>

                    {/* Additional Files */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">Ek Belgeler</label>
                        <div className="flex gap-2">
                            <label className="flex-1 flex items-center justify-center border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
                                <Upload size={16} className="mr-2" /> Dosya Yükle
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], 'document')}
                                />
                            </label>
                        </div>
                        
                        {/* Attachments List */}
                        {attachments.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 mt-2">
                                {attachments.map((att, index) => (
                                    <div key={index} className="flex items-center p-2 bg-gray-50 border rounded-lg text-xs relative group">
                                        <Paperclip size={14} className="mr-2 text-gray-500"/>
                                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 hover:text-blue-600 hover:underline">
                                            {att.name}
                                        </a>
                                        <button 
                                            onClick={() => removeAttachment(index)}
                                            className="ml-2 text-red-500 hover:text-red-700"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notlar</label>
                        <textarea 
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Ek notlar..."
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                    <button 
                        onClick={handleComplete}
                        disabled={saving}
                        className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm"
                    >
                        <Check size={18} className="mr-2" />
                        Tamamla
                    </button>

                    <button 
                        onClick={handlePolicyCreate}
                        disabled={saving || !tcVkn || !plaka || !belgeNo || !sasiNo}
                        className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileText size={18} className="mr-2" />
                        Poliçeyi Kes
                    </button>
                </div>
            </div>
            </>
            )}

        </div>
      </div>
    </div>
  );
}
