
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Upload, Car, FileText, Check, Clipboard, ScanLine, Loader2, Sparkles, Hash, AlertCircle, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { analyzeLicenseWithGemini } from '@/lib/gemini';
import toast from 'react-hot-toast';

export default function EmployeeNewQuote() {
  const navigate = useNavigate();
  const location = useLocation();
  const whatsappContext = location.state as any;
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>(''); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sale Toggle State
  const [isSale, setIsSale] = useState(false); 

  const [formData, setFormData] = useState({
    ad_soyad: '',
    plaka: '',
    tc_vkn: '',
    belge_no: '',
    sasi_no: '',
    arac_cinsi: '',
    marka: '',
    model: '',
    notlar: '',
    urun: 'TRAFİK' // Default product
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Handle WhatsApp Redirection Data
  useEffect(() => {
    const initFromWhatsApp = async () => {
        const state = location.state as any;
        if (state) {
            if (state.quoteType) {
                setFormData(prev => ({ ...prev, urun: state.quoteType }));
            }
            if (state.customerPhone) {
                setFormData(prev => ({ ...prev, notlar: `Müşteri Tel: ${state.customerPhone}\n` + prev.notlar }));
            }
            
            if (state.imageUrl && state.autoScan) {
                try {
                    setScanning(true);
                    setScanStatus('WhatsApp görseli alınıyor...');
                    
                    // Fetch the image from URL (it might be a blob url or data url)
                    const response = await fetch(state.imageUrl);
                    const blob = await response.blob();
                    const file = new File([blob], "whatsapp-image.jpg", { type: blob.type });
                    
                    setUploadedFile(file);
                    setPreviewUrl(state.imageUrl);
                    
                    // Trigger Analysis
                    setScanStatus('Gemini AI taranıyor...');
                    const result = await analyzeLicenseWithGemini(file);
                    
                    if (result) {
                        setFormData(prev => ({
                            ...prev,
                            plaka: result.plaka || prev.plaka,
                            tc_vkn: result.tc_vkn || prev.tc_vkn,
                            belge_no: result.belge_no || prev.belge_no,
                            sasi_no: result.sasi_no || prev.sasi_no,
                            arac_cinsi: result.arac_cinsi || prev.arac_cinsi,
                            marka: result.marka || prev.marka,
                            model: result.model || prev.model
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
  }, [location.state]);

  // --- Global Paste Logic ---
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
        if (e.clipboardData && e.clipboardData.items) {
            for (const item of e.clipboardData.items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const file = new File([blob], "pasted-image.png", { type: blob.type });
                        setUploadedFile(file);
                        setPreviewUrl(URL.createObjectURL(file));
                        processImage(file);
                    }
                    break;
                }
            }
        }
    };

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) setIsDragging(true);
    };
    
    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) setIsDragging(false);
    };
    
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    
    const handleDrop = (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false); dragCounter.current = 0;
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                setUploadedFile(file);
                setPreviewUrl(URL.createObjectURL(file));
                processImage(file);
                e.dataTransfer.clearData();
            }
        }
    };

    window.addEventListener('paste', handleGlobalPaste);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
        window.removeEventListener('paste', handleGlobalPaste);
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('drop', handleDrop);
    };
  }, []); 

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      processImage(file); // Trigger scan
    }
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      let imageFound = false;

      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          
          let ext = 'png';
          if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
          else if (blob.type.includes('webp')) ext = 'webp';
          else if (blob.type.includes('gif')) ext = 'gif';

          const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: blob.type });
          setUploadedFile(file);
          setPreviewUrl(URL.createObjectURL(file));
          processImage(file);
          imageFound = true;
          break;
        }
      }

      if (!imageFound) {
        toast.error('Panoda uygun resim bulunamadı.');
      }
    } catch (err) {
      console.error('Paste failed:', err);
      toast.error('Pano erişimi başarısız. "Ctrl+V" deneyin.');
    }
  };

  const handleCopyQrString = () => {
      // Format: BELGE NO-PLAKA-TC
      const qrString = `${formData.belge_no}-${formData.plaka}-${formData.tc_vkn}`;
      navigator.clipboard.writeText(qrString).then(() => {
          toast.success(`Kopyalandı: ${qrString}`); 
      }).catch(err => console.error('Copy failed', err));
  };

  const processImage = async (file: File) => {
    setScanning(true);
    setScanStatus('Gemini AI taranıyor...');
    
    try {
        const result = await analyzeLicenseWithGemini(file);
        
        if (result) {
            setFormData(prev => ({
                ...prev,
                plaka: result.plaka || prev.plaka,
                tc_vkn: result.tc_vkn || prev.tc_vkn,
                belge_no: result.belge_no || prev.belge_no,
                sasi_no: result.sasi_no || prev.sasi_no,
                arac_cinsi: result.arac_cinsi || prev.arac_cinsi,
                marka: result.marka || prev.marka,
                model: result.model || prev.model
            }));
            setScanStatus('İşlem tamamlandı!');
            toast.success('Belge tarandı ve form dolduruldu.');
        }
    } catch (error: any) {
        console.error('Scanning error:', error);
        setScanStatus('Tarama hatası!');
        toast.error(error.message || 'Belge taranırken hata oluştu.');
    } finally {
        setTimeout(() => {
            setScanning(false);
            setScanStatus('');
        }, 1500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (isSale && !formData.tc_vkn) {
      toast.error('SATIŞ durumunda TC/VKN zorunludur!');
      return;
    }
    
    if (!formData.plaka || !formData.tc_vkn || !formData.belge_no || !formData.sasi_no) {
        toast.error('Lütfen zorunlu alanları doldurunuz: TC/VKN, Plaka, Belge No, Şasi No');
        return;
    }

    if (formData.tc_vkn.length > 11) {
        toast.error('TC/VKN 11 karakterden fazla olamaz.');
        return;
    }

    setLoading(true);

    try {
      let fileUrl = null;

      if (uploadedFile) {
        const fileExt = uploadedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('documents') 
          .upload(filePath, uploadedFile);

        if (!uploadError) {
             const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);
             fileUrl = publicUrl;
        }
      }

      const { error } = await supabase
        .from('teklifler')
        .insert({
          ad_soyad: formData.ad_soyad,
          ilgili_kisi_id: user.id,
          plaka: formData.plaka,
          tc_vkn: formData.tc_vkn,
          arac_cinsi: formData.arac_cinsi,
          belge_no: formData.belge_no,
          sasi_no: formData.sasi_no, // Added sasi_no to DB
          tur: formData.urun,
          notlar: `MARKA: ${formData.marka} | MODEL: ${formData.model} | ŞASİ: ${formData.sasi_no} | ` + formData.notlar + (isSale ? '\n[DURUM: SATIŞ]' : '\n[DURUM: SATIŞ DEĞİL]'),
          durum: 'bekliyor',
          kart_bilgisi: fileUrl ? fileUrl : undefined,
          // Add misafir_bilgi if coming from WhatsApp
          misafir_bilgi: whatsappContext ? {
              source: whatsappContext.source || 'whatsapp',
              phone: whatsappContext.phone,
              group_id: whatsappContext.groupId
          } : undefined
        });

      if (error) throw error;

      toast.success('Teklif başarıyla oluşturuldu!');
      navigate('/employee/quotes');
    } catch (error) {
      console.error('Error creating quote:', error);
      toast.error('Teklif oluşturulurken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto relative">
      {isDragging && (
        <div className="fixed inset-0 bg-blue-600/90 z-50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
            <Upload size={80} className="mb-4 animate-bounce" />
            <h2 className="text-3xl font-bold">Dosyayı Buraya Bırakın</h2>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Yeni Teklif İsteği (Personel)</h1>
        <p className="text-gray-500 flex items-center">
            Araç ve müşteri bilgilerini girerek teklif isteği oluşturun.
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                <Sparkles size={12} className="mr-1" /> Gemini 2.0 Flash
            </span>
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* 1. Belge Yükleme */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ruhsat Fotoğrafı</label>
                    <div 
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer flex flex-col items-center justify-center h-48 relative overflow-hidden transition-all ${
                            scanning ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                        }`}
                        onClick={() => !scanning && fileInputRef.current?.click()}
                    >
                        {previewUrl ? (
                            <>
                                <img src={previewUrl} alt="Preview" className="h-full object-contain opacity-60" />
                                {scanning && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                                        <div className="flex flex-col items-center animate-pulse text-blue-600">
                                            <Sparkles className="w-8 h-8 mb-2 animate-spin" />
                                            <span className="font-bold">Analiz Ediliyor...</span>
                                        </div>
                                    </div>
                                )}
                                {!scanning && (
                                    <div className="absolute bottom-2 right-2 bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold flex items-center shadow-sm">
                                        <Check size={12} className="mr-1" /> Yüklendi
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <Upload className="h-10 w-10 text-gray-400 mb-2" />
                                <p className="text-sm font-medium text-gray-600">Fotoğraf Yükle</p>
                                <p className="text-xs text-gray-400 mt-1">veya sürükle bırak</p>
                            </>
                        )}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                        <button
                            type="button"
                            onClick={handlePaste}
                            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium flex items-center justify-center transition-colors"
                        >
                            <Clipboard className="w-4 h-4 mr-2" /> Panodan
                        </button>
                        <button
                            type="button"
                            onClick={handleCopyQrString}
                            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium flex items-center justify-center transition-colors"
                            title="BELGE-PLAKA-TC Kopyala"
                        >
                            <QrCode className="w-4 h-4 mr-2" /> Kare Kod
                        </button>
                    </div>
                </div>

                {/* 2. Form Alanları */}
                <div className="md:col-span-2 space-y-4">
                    
                    {/* Ürün Seçimi */}
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Ürün Seçiniz</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {['TRAFİK', 'KASKO', 'DASK', 'KONUT', 'İŞYERİ', 'TSS', 'ÖSS'].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setFormData({...formData, urun: p})}
                                    className={`px-2 py-2 rounded-lg text-xs font-bold transition-all border ${
                                        formData.urun === p 
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
                        <span className="text-sm font-medium text-gray-700">İşlem Türü:</span>
                        <div className="flex space-x-2">
                            <button type="button" onClick={() => setIsSale(false)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${!isSale ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>Normal</button>
                            <button type="button" onClick={() => setIsSale(true)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${isSale ? 'bg-red-500 shadow text-white' : 'text-gray-500 hover:bg-gray-100'}`}>SATIŞ</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Adı Soyadı */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Adı Soyadı / Ünvanı</label>
                            <input
                                type="text"
                                name="ad_soyad"
                                value={formData.ad_soyad}
                                onChange={handleChange}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 outline-none text-sm"
                                placeholder="Ad Soyad"
                            />
                        </div>

                        {/* TC / VKN */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">TC / Vergi No</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="tc_vkn"
                                    value={formData.tc_vkn}
                                    onChange={(e) => setFormData({...formData, tc_vkn: e.target.value.slice(0, 11)})}
                                    className={`w-full h-10 px-3 border rounded-lg focus:ring-2 outline-none font-mono text-sm ${formData.tc_vkn.length >= 10 ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                                    placeholder="11 Haneli No"
                                />
                                {formData.tc_vkn.length >= 10 && <Check className="absolute right-2 top-2.5 text-green-600 w-4 h-4" />}
                            </div>
                        </div>

                        {/* Plaka */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plaka</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="plaka"
                                    value={formData.plaka}
                                    onChange={handleChange}
                                    className={`w-full h-10 px-3 border rounded-lg focus:ring-2 outline-none font-bold text-sm ${formData.plaka.length > 5 ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                                    placeholder="34ABC123"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Belge No */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Belge No</label>
                            <input
                                type="text"
                                name="belge_no"
                                value={formData.belge_no}
                                onChange={handleChange}
                                className={`w-full h-10 px-3 border rounded-lg focus:ring-2 outline-none text-sm ${formData.belge_no.length > 5 ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                                placeholder="AB123456"
                            />
                        </div>

                        {/* Şasi No */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Şasi No (17 Hane)</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="sasi_no"
                                    value={formData.sasi_no}
                                    onChange={(e) => setFormData({...formData, sasi_no: e.target.value.toUpperCase()})}
                                    className={`w-full h-10 px-3 border rounded-lg focus:ring-2 outline-none font-mono text-sm tracking-wide ${formData.sasi_no.length === 17 ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                                    placeholder="WVGZZZ..."
                                />
                                {formData.sasi_no.length !== 17 && formData.sasi_no.length > 0 && (
                                    <AlertCircle className="absolute right-2 top-2.5 text-amber-500 w-4 h-4" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Araç Cinsi / Marka / Model */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Araç Cinsi</label>
                            <input
                                type="text"
                                name="arac_cinsi"
                                value={formData.arac_cinsi}
                                onChange={handleChange}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                placeholder="Otomobil"
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Marka</label>
                            <input
                                type="text"
                                name="marka"
                                value={formData.marka}
                                onChange={handleChange}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Model</label>
                            <input
                                type="text"
                                name="model"
                                value={formData.model}
                                onChange={handleChange}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Notlar ve Buton */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ek Notlar</label>
                <textarea
                    name="notlar"
                    rows={2}
                    value={formData.notlar}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Varsa eklemek istediğiniz notlar..."
                />
            </div>

            <button
                type="submit"
                disabled={loading || scanning}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center text-base"
            >
                {loading ? 'Gönderiliyor...' : (
                <>
                    <Check size={20} className="mr-2" />
                    Teklifi Gönder
                </>
                )}
            </button>

        </form>
      </div>
    </div>
  );
}
