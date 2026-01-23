import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Save, Upload, Calculator, ArrowLeft, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { analyzePolicyWithGemini } from '@/lib/gemini';

export default function PolicyCut() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  
  // Data
  const [quote, setQuote] = useState<any>(null);
  const [priceListUrl, setPriceListUrl] = useState<string | null>(null);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyPreviewUrl, setPolicyPreviewUrl] = useState<string | null>(null);

  // Form State
    const [formData, setFormData] = useState({
        // Quote Info
        ad_soyad: '',
        dogum_tarihi: '', // Display format DD.MM.YYYY
        sasi_no: '',
        plaka: '',
        tc_vkn: '',
        belge_no: '',
        arac_cinsi: '',
        tur: '', // ReadOnly
        tali: '', // ReadOnly (Acente/İlgili Kişi)
        adres_kodu: '', // New field
        
        // Policy Info
        sirket: '',
        bitis_tarihi: '',
        brut_prim: '',
        net_prim: '',
        komisyon: '',
        acente: '',
        police_no: '',
        
        // Other
        kart_bilgisi: '', 
        ek_notlar: ''
    });

    useEffect(() => {
        if (id) fetchQuote();
    }, [id]);

    // Global Paste Listener
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                const file = e.clipboardData.files[0];
                if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                    e.preventDefault();
                    handlePolicyFileUpload(file);
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const formatDateForDisplay = (isoDate: string) => {
        if (!isoDate) return '';
        const cleanDate = isoDate.trim();
        
        // Handle YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
            const [year, month, day] = cleanDate.split('-');
            return `${day}.${month}.${year}`;
        }
        
        // Handle YYYY-MM-DDTHH:mm:ss...
        if (/^\d{4}-\d{2}-\d{2}T/.test(cleanDate)) {
             const [datePart] = cleanDate.split('T');
             const [year, month, day] = datePart.split('-');
             return `${day}.${month}.${year}`;
        }

        try {
            const date = new Date(cleanDate);
            if (isNaN(date.getTime())) return cleanDate;
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}.${m}.${y}`;
        } catch (e) {
            return cleanDate;
        }
    };

    const convertToDbDate = (displayDate: string) => {
        if (!displayDate) return null;
        
        // Normalize: Replace / with .
        let normalized = displayDate.replace(/\//g, '.');
        
        // Check if already YYYY-MM-DD
        if (normalized.match(/^\d{4}-\d{2}-\d{2}$/)) return normalized;
        
        // Check if DD.MM.YYYY
        const match = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (match) {
            const d = match[1].padStart(2, '0');
            const m = match[2].padStart(2, '0');
            const y = match[3];
            return `${y}-${m}-${d}`;
        }
        return normalized; // Fallback
    };

    const fetchQuote = async () => {
        try {
            const { data, error } = await supabase
                .from('teklifler')
                .select('*, ilgili_kisi:users!ilgili_kisi_id(name)')
                .eq('id', id)
                .single();

            if (error) throw error;
            setQuote(data);
            
            // Populate Form
            setFormData({
                ad_soyad: data.ad_soyad || '',
                dogum_tarihi: data.dogum_tarihi ? formatDateForDisplay(data.dogum_tarihi) : '',
                sasi_no: data.sasi_no || '',
                plaka: data.plaka || '',
                tc_vkn: data.tc_vkn || '',
                belge_no: data.belge_no || '',
                arac_cinsi: data.arac_cinsi || '',
                tur: data.tur || '',
                tali: (data as any).ilgili_kisi?.name || data.misafir_bilgi?.tali_grup || '',
                adres_kodu: '', // Default empty
                
                sirket: data.sirket || '',
                bitis_tarihi: data.tarih || '', 
                brut_prim: data.brut_prim || '',
                net_prim: data.net_prim || '',
                komisyon: data.komisyon || '',
                acente: data.acente || '',
                
                kart_bilgisi: '', 
                ek_notlar: data.ek_bilgiler || ''
            });

            if (data.misafir_bilgi && data.misafir_bilgi.price_list_url) {
                setPriceListUrl(data.misafir_bilgi.price_list_url);
            }

        } catch (error) {
            console.error('Error fetching quote:', error);
            toast.error('Teklif bilgileri alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    // Helper for Number Formatting (19.600,48 -> 19600,48)
    const formatCurrencyInput = (val: string | number) => {
        if (val === undefined || val === null) return ''; // Fix for undefined
        let s = String(val).trim();
        
        // If it contains a comma, assume dots are thousands separators and remove them
        if (s.includes(',')) {
            return s.replace(/\./g, '');
        }
        // If it has only dots, assume it's a decimal (e.g. from JS number 123.45)
        // BUT be careful about 1.000 (1000). 
        // If it has 2 decimal places (e.g. 123.45), replace with comma.
        if (s.match(/^\d+\.\d{2}$/)) {
            return s.replace('.', ',');
        }
        // Fallback: Replace dot with comma anyway to be safe for "decimal" intent
        return s.replace(/\./g, ',');
    };

    const handlePolicyFileUpload = async (file: File) => {
        setPolicyFile(file);
        setPolicyPreviewUrl(URL.createObjectURL(file));
        
        // Auto Scan (OCR)
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            setScanning(true);
            toast.loading('Poliçe taranıyor...', { id: 'scan' });
            try {
                const result = await analyzePolicyWithGemini(file);
                
                if (result) {
                    // Post-processing rules
                    let cleanAcente = result.acente || '';
                    const acenteUpper = cleanAcente.toUpperCase();
                    
                    if (acenteUpper.includes('WİN') || acenteUpper.includes('WIN')) cleanAcente = 'TİMURLAR';
                    else if (acenteUpper.includes('KOÇ')) cleanAcente = 'KOÇ';
                    else if (acenteUpper.includes('NESA')) cleanAcente = 'NESA';

                    let cleanSirket = result.sirket || '';
                    // Remove SİGORTA suffix and generic cleanup
                    cleanSirket = cleanSirket.replace(/SİGORTA/i, '').trim();
                    const sirketUpper = cleanSirket.toUpperCase();
                    
                    if (sirketUpper.includes('NEOVA')) cleanSirket = 'NEOVA';
                    else if (sirketUpper.includes('AK')) cleanSirket = 'AK';
                    else if (sirketUpper.includes('HEPİYİ')) cleanSirket = 'HEPİYİ';
                    else if (sirketUpper.includes('QUICK')) cleanSirket = 'QUICK';
                    else if (sirketUpper.includes('TURKIYE') || sirketUpper.includes('TÜRKİYE')) cleanSirket = 'TÜRKİYE';

                    setFormData(prev => ({
                        ...prev,
                        sirket: cleanSirket || prev.sirket,
                        acente: cleanAcente || prev.acente,
                        bitis_tarihi: result.bitis_tarihi ? formatDateForDisplay(result.bitis_tarihi) : prev.bitis_tarihi,
                        brut_prim: formatCurrencyInput(result.brut_prim) || prev.brut_prim,
                        net_prim: formatCurrencyInput(result.net_prim) || prev.net_prim,
                        komisyon: formatCurrencyInput(result.komisyon) || prev.komisyon,
                        police_no: result.police_no || prev.police_no || '', // Ensure it's never undefined
                        // belge_no: result.police_no || prev.belge_no, // User requested to keep original Doc No
                    }));
                    toast.success('Poliçe bilgileri tarandı', { id: 'scan' });
                } else {
                    toast.dismiss('scan');
                }
            } catch (err: any) {
                console.error('Scan error:', err);
                // Ensure we don't crash with non-serializable error
                const msg = err?.message || 'Bilinmeyen hata';
                toast.error('Tarama başarısız: ' + msg, { id: 'scan' });
            } finally {
                setScanning(false);
            }
        }
    };

    const handleRemovePolicyFile = () => {
        setPolicyFile(null);
        setPolicyPreviewUrl(null);
        setScanning(false);
    };

  const calculateCommission = (rate: number) => {
      const net = parseFloat(formData.net_prim.replace(',', '.'));
      if (!isNaN(net)) {
          const comm = (net * rate).toFixed(2);
          setFormData(prev => ({ ...prev, komisyon: comm }));
          toast.success(`%${rate * 100} Komisyon hesaplandı`);
      } else {
          toast.error('Geçerli bir Net Prim giriniz');
      }
  };

  // Helper to format currency for DB (12.345,67 -> 12345.67)
    const formatCurrencyForDb = (val: string) => {
        if (!val) return null;
        // Remove dots (thousands separator)
        // Replace comma with dot (decimal separator)
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Upload Policy File to Google Drive (via Backend)
            let policyUrl = null;
            if (policyFile) {
                try {
                    const formData = new FormData();
                    formData.append('file', policyFile);
                    
                    // Local Backend URL (Assuming running on 3004)
                    const response = await fetch('http://localhost:3004/upload-to-drive', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        const errData = await response.json();
                        throw new Error(errData.error || 'Drive upload failed');
                    }
                    
                    const data = await response.json();
                    policyUrl = data.url; // Google Drive Link
                    
                } catch (err) {
                    console.error('Drive Upload Error:', err);
                    toast.error(`Drive'a yüklenemedi: ${(err as any).message}`);
                    toast.success('Kayıt işlemine devam ediliyor...', { icon: '⚠️' });
                    // Don't return here, continue to DB save
                    policyUrl = null;
                }
            }

            // Convert Display Dates to DB Format (YYYY-MM-DD)
            const dbBitisTarihi = convertToDbDate(formData.bitis_tarihi);
            const dbDogumTarihi = convertToDbDate(formData.dogum_tarihi);

            // Format Currency Fields for DB (Postgres expects 12345.67, not 12.345,67)
            const dbBrutPrim = formatCurrencyForDb(formData.brut_prim);
            const dbNetPrim = formatCurrencyForDb(formData.net_prim);
            const dbKomisyon = formatCurrencyForDb(formData.komisyon);

            // 2. Update Quote Status
            const { error: quoteError } = await supabase
                .from('teklifler')
                .update({ 
                    durum: 'policelesti',
                    ek_bilgiler: formData.ek_notlar,
                  police_no: formData.police_no || formData.belge_no, 
                  brut_prim: dbBrutPrim,
                  net_prim: dbNetPrim,
                  komisyon: dbKomisyon,
                  sirket: formData.sirket,
                  acente: formData.acente,
                  // Update Editable Info
                  ad_soyad: formData.ad_soyad,
                  dogum_tarihi: dbDogumTarihi, 
                  sasi_no: formData.sasi_no,
                  plaka: formData.plaka,
                  tc_vkn: formData.tc_vkn,
                  belge_no: formData.belge_no,
                  arac_cinsi: formData.arac_cinsi,
                  // Also save 'tali' to teklifler
                  tali: formData.tali
                })
                .eq('id', id);

            if (quoteError) throw quoteError;

            // 3. Create Policy Record
            const { error: policyError } = await supabase
                .from('policeler')
                .insert({
                    teklif_id: id,
                    plaka: formData.plaka,
                    ad_soyad: formData.ad_soyad,
                    tc_vkn: formData.tc_vkn,
                    sirket: formData.sirket,
                    tarih: dbBitisTarihi, // User requested 'tarih' column to be the End Date
                    // bitis_tarihi: dbBitisTarihi, // Removing this as per user request
                    brut_prim: dbBrutPrim,
                    net_prim: dbNetPrim,
                    komisyon: dbKomisyon,
                    acente: formData.acente,
                    tur: formData.tur, // Use 'tur' column
                    pdf_url: policyUrl,
                    kesen_id: user?.id,
                    durum: 'aktif',
                    dogum_tarihi: dbDogumTarihi,
                    
                    // Add missing fields to map from form
                    sasi_no: formData.sasi_no,
                    belge_no: formData.belge_no,
                    arac_cinsi: formData.arac_cinsi,
                    police_no: formData.police_no, // New Policy No field
                    ek_bilgiler: formData.ek_notlar,
                    // tali: formData.tali // Assuming 'tali' column exists? If not, check DB.
                    // If 'tali' is not a column in 'policeler', maybe it relies on 'teklif_id' relation?
                    // User said "İLGİLİ KİŞİ (TALİ) Bilinmiyor".
                    // Let's try to insert 'tali' if the column exists, or check relation.
                    // Based on previous errors, let's assume 'tali' might be needed if not auto-fetched.
                    // tali: formData.tali
                    
                    // User specifically asked to save Tali and Card info
                    tali: formData.tali, 
                    
                    // kart_bilgisi: formData.kart_bilgisi // Check if 'kart_bilgisi' exists?
                    // It exists in schema (id: 20404.17, name: 'kart_bilgisi', type: 'text')
                    
                    kart_bilgisi: formData.kart_bilgisi,
                    ek_bilgiler: formData.ek_notlar
                });

          if (policyError) throw policyError;

          toast.success('Poliçe başarıyla kesildi!');
          navigate('/employee/policies');

      } catch (error: any) {
          console.error('Save error:', error);
          toast.error(`Hata: ${error.message}`);
      } finally {
          setSaving(false);
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const renderDynamicFields = () => {
        const type = formData.tur || '';
        const isTSS_OSS = type.includes('TSS') || type.includes('ÖSS') || type.includes('SAĞLIK');
        const isDASK = type.includes('DASK');
        const isKONUT = type.includes('KONUT') || type.includes('YANGIN');

        // Common Fields
        const AdSoyad = (
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Adı Soyadı</label>
                <input name="ad_soyad" value={formData.ad_soyad} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
        );
        const DogumTarihi = (
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Doğum Tarihi (GG.AA.YYYY)</label>
                <input name="dogum_tarihi" type="text" placeholder="24.08.2002" value={formData.dogum_tarihi} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
            </div>
        );
        const TC = (
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">TC / VKN</label>
                <input name="tc_vkn" value={formData.tc_vkn} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" />
            </div>
        );
        const TurAndTali = (
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tür</label>
                    <input name="tur" value={formData.tur} readOnly className="w-full border rounded p-2 text-sm bg-gray-100" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tali</label>
                    <input name="tali" value={formData.tali} readOnly className="w-full border rounded p-2 text-sm bg-gray-100" />
                </div>
            </div>
        );

        if (isTSS_OSS) {
            // ADI SOYADI , TC , DOĞUM TARİHİ , TÜR , TALİ
            return (
                <div className="grid grid-cols-2 gap-4">
                    {AdSoyad}
                    {TC}
                    {DogumTarihi}
                    {TurAndTali}
                </div>
            );
        } else if (isDASK) {
            // ADI SOYADI , TC , DOĞUM TARİHİ , ADRES KODU , DASK POLİÇE NO , TÜR , TALİ
            return (
                <div className="grid grid-cols-2 gap-4">
                    {AdSoyad}
                    {TC}
                    {DogumTarihi}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Adres Kodu</label>
                        <input name="adres_kodu" value={formData.adres_kodu} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">DASK Poliçe No</label>
                        <input name="belge_no" value={formData.belge_no} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                    </div>
                    {TurAndTali}
                </div>
            );
        } else if (isKONUT) {
            // ADI SOYADI , TC , DOĞUM TARİHİ , ADRES KODU , TÜR , TALİ
            return (
                <div className="grid grid-cols-2 gap-4">
                    {AdSoyad}
                    {TC}
                    {DogumTarihi}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Adres Kodu</label>
                        <input name="adres_kodu" value={formData.adres_kodu} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                    </div>
                    {TurAndTali}
                </div>
            );
        } else {
            // Default (Traffic/Kasko etc) - Original Full List
            return (
                <div className="grid grid-cols-2 gap-4">
                    {AdSoyad}
                    {DogumTarihi}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Şasi No</label>
                        <input name="sasi_no" value={formData.sasi_no} onChange={handleChange} className="w-full border rounded p-2 text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Plaka</label>
                        <input name="plaka" value={formData.plaka} onChange={handleChange} className="w-full border rounded p-2 text-sm font-bold" />
                    </div>
                    {TC}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Belge No</label>
                        <input name="belge_no" value={formData.belge_no} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Araç Cinsi</label>
                        <input name="arac_cinsi" value={formData.arac_cinsi} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
                    </div>
                    {TurAndTali}
                </div>
            );
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-bold text-gray-800">Poliçe Kesim Ekranı</h1>
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    KAYDET & POLİÇELEŞTİR
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Price List / Document */}
                <div className="w-1/3 bg-gray-200 border-r flex flex-col items-center justify-center p-4 overflow-hidden relative">
                    {priceListUrl ? (
                        <div className="w-full h-full relative group">
                            <img 
                                src={priceListUrl} 
                                alt="Fiyat Listesi" 
                                className="w-full h-full object-contain" 
                            />
                            <a 
                                href={priceListUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="absolute bottom-4 right-4 bg-white/90 p-2 rounded shadow text-blue-600 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                Yeni Sekmede Aç
                            </a>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500">
                            <FileText size={48} className="mx-auto mb-2 opacity-50" />
                            <p className="font-medium">Belge Yok</p>
                            <p className="text-xs">Bu teklif için fiyat listesi yüklenmemiş.</p>
                        </div>
                    )}
                </div>

                {/* Right Side: Form */}
                <div className="w-2/3 overflow-y-auto p-8 bg-white">
                    <div className="max-w-3xl mx-auto space-y-8">
                        
                        {/* 1. Teklif Bilgileri */}
                        <section>
                            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 uppercase">Teklif Bilgileri</h3>
                            {renderDynamicFields()}
                        </section>

                        {/* 2. Poliçe Yükleme */}
                        <section className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-blue-800 uppercase">Poliçe Yükle</h3>
                                <span className="text-xs text-blue-600">Görsel veya PDF yapıştırabilirsiniz (CTRL+V)</span>
                            </div>
                            <div className="flex gap-4">
                                <label className={`flex-1 border-2 border-dashed border-blue-300 rounded-lg h-24 flex flex-col items-center justify-center cursor-pointer transition-colors ${scanning ? 'bg-blue-50 cursor-not-allowed' : 'hover:bg-white'}`}>
                                    {scanning ? (
                                        <div className="flex flex-col items-center">
                                            <Loader2 size={32} className="text-blue-500 animate-spin mb-1" />
                                            <span className="text-xs text-blue-600 font-bold animate-pulse">Poliçe Taranıyor...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <FileText size={32} className="text-blue-400 mb-1" />
                                            <span className="text-xs text-blue-500 font-bold">Dosya Seç veya Yapıştır (CTRL+V)</span>
                                        </>
                                    )}
                                    <input type="file" className="hidden" disabled={scanning} onChange={(e) => e.target.files?.[0] && handlePolicyFileUpload(e.target.files[0])} />
                                </label>
                                {policyPreviewUrl && (
                                    <div className="w-24 h-24 relative bg-white rounded-lg border overflow-hidden flex items-center justify-center group">
                                        {policyFile?.type.startsWith('image/') ? (
                                            <img src={policyPreviewUrl} className="w-full h-full object-cover" />
                                        ) : (
                                            <FileText size={40} className="text-gray-400" />
                                        )}
                                        <button 
                                            onClick={handleRemovePolicyFile}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={24} className="text-white" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* 3. Poliçe Bilgileri */}
                        <section>
                        <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 uppercase">Poliçe Bilgileri</h3>
                        <div className={`grid grid-cols-2 gap-4 ${scanning ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Şirket</label>
                                <input name="sirket" value={formData.sirket} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Bitiş Tarihi (GG.AA.YYYY)</label>
                                <input name="bitis_tarihi" type="text" placeholder="01.01.2026" value={formData.bitis_tarihi} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Brüt Prim</label>
                                <input name="brut_prim" value={formData.brut_prim} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Net Prim</label>
                                <input name="net_prim" value={formData.net_prim} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                            <div className="relative">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Komisyon</label>
                                <input name="komisyon" value={formData.komisyon} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm pr-20 disabled:bg-gray-100" />
                                <div className="absolute right-1 top-6 flex gap-1">
                                    <button onClick={() => calculateCommission(0.10)} disabled={scanning} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-2 py-1 rounded disabled:opacity-50">T</button>
                                    <button onClick={() => calculateCommission(0.15)} disabled={scanning} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-2 py-1 rounded disabled:opacity-50">K</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Acente</label>
                                <input name="acente" value={formData.acente} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Poliçe No</label>
                                <input name="police_no" value={formData.police_no} onChange={handleChange} disabled={scanning} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                            </div>
                        </div>
                    </section>

                    {/* 4. Kart & Notlar */}
                    <section className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">KART</label>
                            <input name="kart_bilgisi" value={formData.kart_bilgisi} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="Kart bilgileri..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Ek Notlar</label>
                            <textarea name="ek_notlar" value={formData.ek_notlar} onChange={handleChange} rows={3} className="w-full border rounded p-2 text-sm" />
                        </div>
                    </section>

                </div>
            </div>
        </div>
    </div>
  );
}
