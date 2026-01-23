
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, Car, FileText, Check, Clipboard, ScanLine, Loader2, Sparkles, Hash, AlertCircle, QrCode, X, Plus, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { analyzeLicenseWithGemini } from '@/lib/gemini';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase'; // Import Supabase Client

interface EmployeeNewQuoteProps {
    embedded?: boolean;
    initialState?: any;
    onClose?: () => void;
    initialGroupName?: string;
    onSendMessage?: (messages: string[], files: File[]) => Promise<void>;
}

export default function EmployeeNewQuote({ embedded, initialState, onClose, initialGroupName, onSendMessage }: EmployeeNewQuoteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>(''); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevProductRef = useRef<string>('TRAFİK');
  
  // Form States
  const [tali, setTali] = useState(initialGroupName || '');
  const [companyPriceInstallment, setCompanyPriceInstallment] = useState('');
  const [product, setProduct] = useState('TRAFİK');
  const [isNewCar, setIsNewCar] = useState(false);
  const [pastCompany, setPastCompany] = useState('');
  const [pastEndDate, setPastEndDate] = useState('');
  
  // Dynamic Form Data
  const [formData, setFormData] = useState<any>({
    ad_soyad: '',
    plaka: '',
    tc_vkn: '',
    belge_no: '',
    sasi_no: '',
    arac_cinsi: '',
    motor_no: '',
    marka_kodu: '',
    meslek: '',
    dogum_tarihi: '',
    adres_kodu: '',
    daire_brut_m2: '',
    bina_insa_yili: '',
    bina_toplam_kat: '',
    daire_kacinci_kat: '',
    faaliyet: '',
    durum_kisi: 'FERT', // For TSS/ÖSS dropdown
    notlar: ''
  });

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [tssList, setTssList] = useState<{type: string, id: string, tc: string, birthDate: string}[]>([]); 

  const [uploadedFile, setUploadedFile] = useState<File | null>(null); // For License AI
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Sync Tali if prop changes
  useEffect(() => {
      if (initialGroupName) setTali(initialGroupName);
  }, [initialGroupName]);

  // Handle WhatsApp Redirection Data
  useEffect(() => {
    const initFromWhatsApp = async () => {
        const state = initialState || location.state as any;
        if (state) {
            if (state.quoteType) {
                setProduct(state.quoteType);
            }
            
            if (state.imageUrl && state.autoScan) {
                try {
                    setScanning(true);
                    setScanStatus('WhatsApp görseli alınıyor...');
                    
                    const response = await fetch(state.imageUrl);
                    const blob = await response.blob();
                    const file = new File([blob], "whatsapp-image.jpg", { type: blob.type });
                    
                    setUploadedFile(file);
                    setPreviewUrl(state.imageUrl);
                    
                    setScanStatus('Gemini AI taranıyor...');
                    const result = await analyzeLicenseWithGemini(file);
                    
                    if (result) {
                        setFormData((prev: any) => ({
                            ...prev,
                            plaka: result.plaka || prev.plaka,
                            tc_vkn: result.tc_vkn || prev.tc_vkn,
                            belge_no: result.belge_no || prev.belge_no,
                            sasi_no: result.sasi_no || prev.sasi_no,
                            arac_cinsi: result.arac_cinsi || prev.arac_cinsi
                        }));
                        setScanStatus('İşlem tamamlandı!');
                    }
                } catch (err) {
                    console.error('Auto-scan error:', err);
                    setScanStatus('Otomatik tarama hatası.');
                } finally {
                    setScanning(false);
                }
            }
        }
    };
    
    initFromWhatsApp();
  }, [location.state, initialState]);

  const handleProductChange = (newProduct: string) => {
    const prev = prevProductRef.current;
    
    const isVehicle = (p: string) => p === 'TRAFİK' || p === 'KASKO';
    const isSameCategory = isVehicle(prev) && isVehicle(newProduct);
    
    // Only reset if switching categories (e.g. Traffic -> DASK)
    // "trafik kasko arasında değişiminde hiç bir textboxı sıfırlama"
    if (!isSameCategory) {
        setFormData({
            ad_soyad: '', plaka: '', tc_vkn: '', belge_no: '', sasi_no: '',
            arac_cinsi: '', motor_no: '', marka_kodu: '', meslek: '',
            dogum_tarihi: '', adres_kodu: '', daire_brut_m2: '',
            bina_insa_yili: '', bina_toplam_kat: '', daire_kacinci_kat: '',
            faaliyet: '', durum_kisi: 'FERT', notlar: ''
        });
        setAttachedFiles([]);
        setUploadedFile(null);
        setPreviewUrl(null);
        setIsNewCar(false);
        setCompanyPriceInstallment('');
        setTssList([]);
    }
    
    setProduct(newProduct);
    prevProductRef.current = newProduct;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      processImage(file); 
    }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
      }
  };

  const handlePasteToScan = async () => {
      try {
          // Check for clipboard permissions or API availability
          if (!navigator.clipboard || !navigator.clipboard.read) {
               throw new Error('Clipboard API not supported');
          }
          
          const items = await navigator.clipboard.read();
          let found = false;
          
          for (const item of items) {
              // Try to find image types
              const imageType = item.types.find(type => type.startsWith('image/'));
              
              if (imageType) {
                  const blob = await item.getType(imageType);
                  const file = new File([blob], `scanned-paste.png`, { type: imageType });
                  setUploadedFile(file);
                  setPreviewUrl(URL.createObjectURL(file));
                  processImage(file);
                  found = true;
                  return; // Stop after finding first image
              }
          }
          
          if (!found) {
              toast.error('Panoda resim bulunamadı. Lütfen bir resim kopyaladığınızdan emin olun.');
          }
      } catch (err) {
          console.error('Paste error:', err);
          toast.error('Yapıştırma hatası: Tarayıcınız panoya erişime izin vermiyor olabilir.');
      }
  };

  const handlePastePriceList = async () => {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
             throw new Error('Clipboard API not supported');
        }

        const items = await navigator.clipboard.read();
        let pasted = false;
        
        for (const item of items) {
             const imageType = item.types.find(type => type.startsWith('image/'));
             if (imageType) {
                const blob = await item.getType(imageType);
                const file = new File([blob], `fiyat-listesi-${Date.now()}.png`, { type: imageType });
                setAttachedFiles(prev => [...prev, file]);
                pasted = true;
            }
        }
        
        if (pasted) toast.success('Fiyat listesi eklendi');
        else toast.error('Panoda resim bulunamadı');
    } catch (err) {
        console.error('Paste error:', err);
        toast.error('Yapıştırma hatası: Tarayıcınız panoya erişime izin vermiyor olabilir.');
    }
  };

  const handleCopyQR = () => {
      const text = `${formData.belge_no || ''}-${formData.plaka || ''}-${formData.tc_vkn || ''}`;
      // Fix: Use navigator.clipboard.writeText correctly, and handle potential absence of navigator.clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
              .then(() => toast.success('QR Verisi kopyalandı'))
              .catch(err => {
                  console.error('Clipboard error:', err);
                  toast.error('Kopyalama başarısız');
              });
      } else {
          // Fallback for insecure context or unsupported browsers
          try {
              const textArea = document.createElement("textarea");
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              toast.success('QR Verisi kopyalandı (Fallback)');
          } catch (err) {
              console.error('Fallback clipboard error:', err);
              toast.error('Kopyalama başarısız');
          }
      }
  };

  const processImage = async (file: File) => {
    if (product !== 'TRAFİK' && product !== 'KASKO') return; 
    setScanning(true);
    setScanStatus('Gemini AI taranıyor...');
    
    try {
        const result = await analyzeLicenseWithGemini(file);
        
        if (result) {
            setFormData((prev: any) => ({
                ...prev,
                plaka: result.plaka || prev.plaka,
                tc_vkn: result.tc_vkn || prev.tc_vkn,
                belge_no: result.belge_no || prev.belge_no,
                sasi_no: result.sasi_no || prev.sasi_no,
                arac_cinsi: result.arac_cinsi || prev.arac_cinsi
            }));
            setScanStatus('İşlem tamamlandı!');
            toast.success('Belge tarandı.');
        }
    } catch (error: any) {
        console.error('Scanning error:', error);
        setScanStatus('Tarama hatası!');
    } finally {
        setScanning(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const isValid = (value: string, minLength: number = 1) => {
      return value && value.length >= minLength;
  };

  const getInputClass = (value: string, minLength: number = 1) => {
      return `w-full h-10 px-3 border rounded-lg focus:ring-2 outline-none text-sm transition-colors ${
          isValid(value, minLength) ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'
      }`;
  };

  // TSS Logic
  const handleAddPerson = () => {
      const type = formData.durum_kisi;
      if (type === 'FERT' && tssList.some(p => p.type === 'FERT')) {
          toast.error('Sadece 1 adet FERT ekleyebilirsiniz.');
          return;
      }
      if (type === 'EŞ' && tssList.some(p => p.type === 'EŞ')) {
          toast.error('Sadece 1 adet EŞ ekleyebilirsiniz.');
          return;
      }
      // Add current form data values for person
      const newPerson = { 
          type, 
          id: Math.random().toString(),
          tc: formData.tc_vkn,
          birthDate: formData.dogum_tarihi
      };
      
      setTssList([...tssList, newPerson]);

      // Determine next default type
      const nextList = [...tssList, newPerson];
      const hasFert = nextList.some(p => p.type === 'FERT');
      const hasEs = nextList.some(p => p.type === 'EŞ');
      
      let nextType = 'ÇOCUK';
      if (!hasFert) nextType = 'FERT';
      else if (!hasEs) nextType = 'EŞ';
      
      setFormData(prev => ({ ...prev, durum_kisi: nextType, tc_vkn: '', dogum_tarihi: '' }));
  };

  const handleRemovePerson = (id: string) => {
      const newList = tssList.filter(p => p.id !== id);
      setTssList(newList);
      
      // Reset dropdown logic if needed (e.g. if FERT removed, default back to FERT)
      const hasFert = newList.some(p => p.type === 'FERT');
      if (!hasFert) setFormData(prev => ({ ...prev, durum_kisi: 'FERT' }));
  };

  const getAvailablePersonTypes = () => {
      const options = ['FERT', 'EŞ', 'ÇOCUK'];
      return options.filter(opt => {
          if (opt === 'FERT' && tssList.some(p => p.type === 'FERT')) return false;
          if (opt === 'EŞ' && tssList.some(p => p.type === 'EŞ')) return false;
          return true;
      });
  };

  const getExtraInfo = () => {
    let info = '';
    
    // 1. Ek Notlar - User says: "nottaki şey yazılmış ama NOT: SAMETT olarak yazılmış NOT: bu yazmayacak"
    // So we just append the note content directly.
    if (formData.notlar) info += `${formData.notlar} `;

    // 2. Meslek (Kasko)
    if (product === 'KASKO' && formData.meslek) info += `MESLEK: ${formData.meslek} `;

    // 3. DASK/KONUT/İŞYERİ Detayları
    if (product === 'DASK' || product === 'KONUT' || product === 'İŞYERİ') {
        info += `M2: ${formData.daire_brut_m2 || '-'} YIL: ${formData.bina_insa_yili || '-'} KAT: ${formData.daire_kacinci_kat || '-'}/${formData.bina_toplam_kat || '-'} `;
    }

    // 4. TSS/ÖSS Detayları
    if (product === 'TSS' || product === 'ÖSS') {
        // Eş ve Çocuk bilgileri buraya
        const es = tssList.find(p => p.type === 'EŞ');
        if (es) info += `EŞ: ${es.tc || ''} ${es.birthDate || ''} `;
        
        const cocuklar = tssList.filter(p => p.type === 'ÇOCUK');
        if (cocuklar.length > 0) {
            info += 'ÇOCUKLAR: ';
            cocuklar.forEach((c, idx) => {
                info += `${idx+1}) ${c.tc || ''} ${c.birthDate || ''} `;
            });
        }
    }

    return info.trim();
  };

  const parseDate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      // User complaint: "TARİ (SAATTE YAZIYOR SADECE TARİH OALCAK)"
      // Database field is likely timestamptz. We should format it correctly or ensure DB ignores time.
      // But if user sees it in UI list, UI should format it.
      // Here we just save ISO string.
      
      // Format: DD.MM.YYYY
      const parts = dateStr.split('.');
      if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Months are 0-based
          const year = parseInt(parts[2], 10);
          
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
              // Create date at noon to avoid timezone shift issues causing prev day
              // We will return formatted YYYY-MM-DD string which Supabase can cast to date/timestamp
              // This ensures clean date format
              const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
              return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
          }
      }
      return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        // --- 1. Database Insert ---
        let dbBirthDate = parseDate(formData.dogum_tarihi);
        if (!dbBirthDate && formData.tc_vkn && formData.tc_vkn.length === 10) {
            // Tax number: Default to 01.01.1900 as requested
            dbBirthDate = '1900-01-01';
        }
        
        let dbEndDate = parseDate(pastEndDate);

        const quoteData = {
            ad_soyad: formData.ad_soyad,
            dogum_tarihi: dbBirthDate,
            sirket: pastCompany || '-', // Şirket boşsa -
            tarih: dbEndDate, // Bitiş Tarihi
            sasi: formData.sasi_no, 
            sasi_no: formData.sasi_no, 
            plaka: formData.plaka,
            tc_vkn: formData.tc_vkn,
            belge_no: formData.belge_no,
            arac_cinsi: formData.arac_cinsi,
            brut_prim: null,
            tur: product,
            kesen_id: user?.id,
            // İLGİLİ KİŞİ (TALİ) yeri Tali / Grup textboxından alacak -> acente kolonuna
            misafir_bilgi: { tali_grup: tali }, 
            acente: tali, 
            tali: tali, // Save Tali explicitly to the new column
            police_no: companyPriceInstallment, 
            kart_bilgisi: null, 
            ek_bilgiler: getExtraInfo(),
            net_prim: null,
            komisyon: null,
            durum: 'bekliyor'
        };

        const { error: dbError } = await supabase.from('teklifler').insert(quoteData);
        if (dbError) {
            console.error('DB Insert Error:', dbError);
            toast.error('Veritabanına kayıt yapılamadı, ancak mesaj gönderiliyor.');
        }

        // --- 2. WhatsApp Message ---
        const messagesToSend: string[] = [];

        // Mesaj Formatı:
        // 1. İSİM SOYİSİM ÜRÜN PLAKA
        // 2. Şirket / Fiyat / Taksit (Alt satırda)
        // 3. Mesaj ek not (Alt satırda)
        
        let mainMsg = '';
        
        // 1. Satır
        if (formData.ad_soyad) mainMsg += `${formData.ad_soyad} `;
        mainMsg += `${product} `;
        
        if (product === 'TRAFİK' || product === 'KASKO') {
            mainMsg += `${formData.plaka}`;
        } else if (product === 'DASK' || product === 'KONUT' || product === 'İŞYERİ') {
            mainMsg += `\nTC/VKN: ${formData.tc_vkn}`;
            mainMsg += `\nADRES KODU: ${formData.adres_kodu}`;
            mainMsg += `\nM2: ${formData.daire_brut_m2} | YIL: ${formData.bina_insa_yili}`;
            mainMsg += `\nKAT: ${formData.daire_kacinci_kat} / ${formData.bina_toplam_kat}`;
            if (product === 'İŞYERİ') mainMsg += `\nFAALİYET: ${formData.faaliyet}`;
        } else if (product === 'TSS' || product === 'ÖSS') {
            mainMsg += `\nTC: ${formData.tc_vkn}`;
            mainMsg += `\nKİŞİLER: ${tssList.map(p => `${p.tc} - ${p.birthDate} - ${p.type}`).join('\n')}`;
        }

        // 2. Satır: Şirket / Fiyat / Taksit
        if (companyPriceInstallment) {
            mainMsg += `\n${companyPriceInstallment}`;
        }

        // 3. Satır: Ek Not
        if (formData.notlar) {
             mainMsg += `\n${formData.notlar}`; 
        }

        messagesToSend.push(mainMsg.trim());

        // Send via Callback
        if (onSendMessage) {
            // Sadece ekli dosyaları gönder (Fiyat listesi vb.)
            // Ruhsatı (uploadedFile) GÖNDERME
            const filesToSend = [...attachedFiles];
            // if (uploadedFile) filesToSend.unshift(uploadedFile); // REMOVED
            await onSendMessage(messagesToSend, filesToSend);
        }
        
        // Reset Form (Keep Product and Tali)
        setFormData({
            ad_soyad: '', plaka: '', tc_vkn: '', belge_no: '', sasi_no: '',
            arac_cinsi: '', motor_no: '', marka_kodu: '', meslek: '',
            dogum_tarihi: '', adres_kodu: '', daire_brut_m2: '',
            bina_insa_yili: '', bina_toplam_kat: '', daire_kacinci_kat: '',
            faaliyet: '', durum_kisi: 'FERT', notlar: ''
        });
        setAttachedFiles([]);
        setUploadedFile(null);
        setPreviewUrl(null);
        setIsNewCar(false);
        setCompanyPriceInstallment('');
        setPastCompany('');
        setPastEndDate('');
        setTssList([]);

        // Close is handled by parent if needed, but user said "ekran kapanıyor sadece textboxlar sıfırlansın"
        // So we do NOT call onClose() here.
        // Also remove 'setQuotePanel({ isOpen: false... })' in parent callback? 
        // Parent callback sets quotePanel false. We need to prevent that.

    } catch (error) {
        console.error('Submit error:', error);
        toast.error('İşlem başarısız.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className={`max-w-4xl mx-auto relative ${embedded ? 'p-4' : 'p-8'}`}>
      
      {embedded && onClose && (
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Teklif Oluştur</h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} className="text-gray-500" />
              </button>
          </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* 0. Past Info (Optional) */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
            <h3 className="text-xs font-bold text-blue-800 mb-2 flex items-center">
                <Sparkles size={12} className="mr-1" />
                GEÇMİŞ BİLGİLER (Varsa)
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <input 
                    type="text" 
                    placeholder="Hangi Şirket?" 
                    value={pastCompany}
                    onChange={(e) => setPastCompany(e.target.value)}
                    className="w-full h-10 px-3 border border-blue-200 rounded-lg focus:ring-2 outline-none text-sm"
                />
                <input 
                    type="text" 
                    placeholder="Bitiş Tarihi (GÜN.AY.YIL)" 
                    value={pastEndDate}
                    onChange={(e) => setPastEndDate(e.target.value)}
                    className="w-full h-10 px-3 border border-blue-200 rounded-lg focus:ring-2 outline-none text-sm"
                />
            </div>
        </div>
        
        {/* 1. Product Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['TRAFİK', 'KASKO', 'DASK', 'KONUT', 'İŞYERİ', 'TSS'].map((p) => (
                <button
                    key={p}
                    type="button"
                    onClick={() => handleProductChange(p)}
                    className={`px-2 py-2 rounded-lg text-xs font-bold transition-all border ${
                        product === p 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                    }`}
                >
                    {p}
                </button>
            ))}
        </div>

        {/* 2. Tali (Group Name) */}
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tali / Grup</label>
            <input
                type="text"
                value={tali}
                readOnly
                className="w-full h-10 px-3 border border-gray-300 rounded-lg outline-none text-sm bg-gray-100 cursor-not-allowed text-gray-500"
            />
        </div>

        {/* 3. Scan Area */}
        {(product === 'TRAFİK' || product === 'KASKO') && (
            <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50"
                onClick={() => fileInputRef.current?.click()}
            >
                {previewUrl ? (
                    <div className="relative h-20 flex items-center justify-center">
                        <img src={previewUrl} className="h-full object-contain" />
                        {scanning && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-gray-400">
                        <ScanLine size={24} />
                        <span className="text-xs mt-1">Ruhsat Tara</span>
                    </div>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
        )}

        {/* 4. Buttons (Paste / QR) */}
        {(product === 'TRAFİK' || product === 'KASKO') && (
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handlePasteToScan}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center"
                >
                    <Clipboard size={14} className="mr-1" /> YAPIŞTIR
                </button>
                <button
                    type="button"
                    onClick={handleCopyQR}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center"
                >
                    <QrCode size={14} className="mr-1" /> QR için kopyala
                </button>
            </div>
        )}

        {/* 5. Zero Car */}
        {(product === 'TRAFİK' || product === 'KASKO') && (
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                <span className="text-sm font-bold text-gray-700">Sıfır Araç mı?</span>
                <div className="flex bg-gray-200 rounded-lg p-1">
                    <button type="button" onClick={() => setIsNewCar(false)} className={`px-3 py-1 rounded text-xs font-bold ${!isNewCar ? 'bg-white shadow text-black' : 'text-gray-500'}`}>Hayır</button>
                    <button type="button" onClick={() => setIsNewCar(true)} className={`px-3 py-1 rounded text-xs font-bold ${isNewCar ? 'bg-green-500 shadow text-white' : 'text-gray-500'}`}>Evet</button>
                </div>
            </div>
        )}

        {/* 6. Dynamic Inputs */}
        <div className="space-y-3">
            {(product === 'TRAFİK' || product === 'KASKO') && (
                <div className="grid grid-cols-2 gap-3">
                    <input name="ad_soyad" placeholder="Ad Soyad" value={formData.ad_soyad} onChange={handleInputChange} className={getInputClass(formData.ad_soyad)} />
                    <input name="plaka" placeholder="Plaka" value={formData.plaka} onChange={handleInputChange} className={getInputClass(formData.plaka)} />
                    <input name="tc_vkn" placeholder="TC / VKN" value={formData.tc_vkn} onChange={handleInputChange} className={getInputClass(formData.tc_vkn, 10)} />
                    {/* Only show BirthDate if TC is 11 chars */}
                    {formData.tc_vkn.length === 11 && (
                         <input type="text" name="dogum_tarihi" placeholder="GÜN.AY.YIL" value={formData.dogum_tarihi} onChange={handleInputChange} className={getInputClass(formData.dogum_tarihi)} />
                    )}
                    
                    <input name="belge_no" placeholder="Belge No" value={formData.belge_no} onChange={handleInputChange} className={getInputClass(formData.belge_no)} />
                    <input name="sasi_no" placeholder="Şasi No" value={formData.sasi_no} onChange={handleInputChange} className={getInputClass(formData.sasi_no, 17)} />
                    <input name="arac_cinsi" placeholder="Araç Cinsi" value={formData.arac_cinsi} onChange={handleInputChange} className={getInputClass(formData.arac_cinsi)} />
                    
                    {isNewCar && (
                        <>
                            <input name="motor_no" placeholder="Motor No" value={formData.motor_no} onChange={handleInputChange} className={getInputClass(formData.motor_no)} />
                            <input name="marka_kodu" placeholder="Marka Kodu" value={formData.marka_kodu} onChange={handleInputChange} className={getInputClass(formData.marka_kodu)} />
                        </>
                    )}
                    
                    {product === 'KASKO' && (
                        <input name="meslek" placeholder="Meslek" value={formData.meslek} onChange={handleInputChange} className={getInputClass(formData.meslek)} />
                    )}
                </div>
            )}

            {(product === 'DASK' || product === 'KONUT' || product === 'İŞYERİ') && (
                <div className="grid grid-cols-2 gap-3">
                    <input name="tc_vkn" placeholder="TC / VKN" value={formData.tc_vkn} onChange={handleInputChange} className={getInputClass(formData.tc_vkn, 10)} />
                    {(formData.tc_vkn.length === 11 || product !== 'İŞYERİ') && (
                        <input type="text" name="dogum_tarihi" placeholder="GÜN.AY.YIL" value={formData.dogum_tarihi} onChange={handleInputChange} className={getInputClass(formData.dogum_tarihi)} />
                    )}
                    
                    <input name="ad_soyad" placeholder="Ad Soyad" value={formData.ad_soyad} onChange={handleInputChange} className={getInputClass(formData.ad_soyad)} />

                    <input name="adres_kodu" placeholder="Adres Kodu" value={formData.adres_kodu} onChange={handleInputChange} className={getInputClass(formData.adres_kodu)} />
                    
                    {/* DASK için Poliçe No */}
                    {product === 'DASK' && (
                        <input name="belge_no" placeholder="DASK Poliçe No (Varsa)" value={formData.belge_no} onChange={handleInputChange} className={getInputClass(formData.belge_no, 0)} />
                    )}

                    <input name="daire_brut_m2" placeholder="Daire Brüt m²" value={formData.daire_brut_m2} onChange={handleInputChange} className={getInputClass(formData.daire_brut_m2)} />
                    <input name="bina_insa_yili" placeholder="Bina İnşa Yılı" value={formData.bina_insa_yili} onChange={handleInputChange} className={getInputClass(formData.bina_insa_yili)} />
                    <input name="bina_toplam_kat" placeholder="Bina Toplam Kat" value={formData.bina_toplam_kat} onChange={handleInputChange} className={getInputClass(formData.bina_toplam_kat)} />
                    <input name="daire_kacinci_kat" placeholder="Daire Kaçıncı Kat" value={formData.daire_kacinci_kat} onChange={handleInputChange} className={getInputClass(formData.daire_kacinci_kat)} />
                    
                    {product === 'İŞYERİ' && (
                        <input name="faaliyet" placeholder="Faaliyet Konusu" value={formData.faaliyet} onChange={handleInputChange} className="col-span-2" />
                    )}
                </div>
            )}

            {(product === 'TSS' || product === 'ÖSS') && (
                <div className="space-y-3">
                    <input name="ad_soyad" placeholder="Sigortalı Ad Soyad" value={formData.ad_soyad} onChange={handleInputChange} className={getInputClass(formData.ad_soyad)} />
                    
                    {/* Add Person Form */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex gap-2 items-center mb-2">
                             <select 
                                name="durum_kisi" 
                                value={formData.durum_kisi} 
                                onChange={handleInputChange}
                                className="w-1/3 h-10 px-2 border border-gray-300 rounded-lg text-sm bg-white"
                            >
                                {getAvailablePersonTypes().map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <input name="tc_vkn" placeholder="TC Kimlik No" value={formData.tc_vkn} onChange={handleInputChange} className={getInputClass(formData.tc_vkn, 11)} />
                            <input type="text" name="dogum_tarihi" placeholder="GÜN.AY.YIL" value={formData.dogum_tarihi} onChange={handleInputChange} className={getInputClass(formData.dogum_tarihi)} />
                             <button 
                                type="button" 
                                onClick={handleAddPerson}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-2 mt-2">
                            {tssList.map((p) => (
                                <div key={p.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-xs font-mono">
                                    <span>{p.tc} - {p.birthDate} - {p.type}</span>
                                    <button type="button" onClick={() => handleRemovePerson(p.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {tssList.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz kişi eklenmedi.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* 7. Şirket / Fiyat / Taksit */}
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Şirket / Fiyat / Taksit</label>
            <textarea
                value={companyPriceInstallment}
                onChange={(e) => setCompanyPriceInstallment(e.target.value)}
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 outline-none text-sm font-mono"
                placeholder="Fiyat bilgisi..."
            />
        </div>

        {/* 8. Fiyat Listesi Yapıştır */}
        <button
            type="button"
            onClick={handlePastePriceList}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center border border-gray-300 border-dashed"
        >
            <Clipboard size={14} className="mr-2" /> Fiyat Listesi Yapıştır (Görsel)
        </button>

        {/* 9. Ek Belgeler */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Ek Belgeler</label>
                <span className="text-xs text-gray-400">{attachedFiles.length} dosya</span>
            </div>
            <label className="w-full cursor-pointer bg-white border border-gray-300 hover:border-blue-400 text-gray-600 rounded-lg py-2 flex items-center justify-center text-sm transition-all">
                <Plus size={16} className="mr-2" /> Belge Seç
                <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
            </label>
            {attachedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                    {attachedFiles.map((f, i) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-white p-1.5 rounded border border-gray-200">
                            <span className="truncate max-w-[200px]">{f.name}</span>
                            <button type="button" onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* 10. Ek Notlar */}
        <textarea 
            name="notlar" 
            placeholder="Ek Notlar (Zorunlu Değil)" 
            value={formData.notlar} 
            onChange={handleInputChange} 
            rows={2} 
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none text-sm"
        />

        <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center text-base mt-4"
        >
            {loading ? 'Gönderiliyor...' : (
            <>
                <Send size={20} className="mr-2" />
                Teklif Gönder
            </>
            )}
        </button>

      </form>
    </div>
  );
}
