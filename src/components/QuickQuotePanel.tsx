import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Upload, Check, Loader2, Sparkles, AlertCircle, Plus, Trash2, Camera, Clipboard } from 'lucide-react';
import { analyzeLicenseWithGemini } from '@/lib/gemini';
import { useAuth } from '@/context/AuthContext';

interface QuickQuotePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

import EmployeeMessagesPage from '@/pages/employee/WhatsAppMessages'; // Fixed import path

export default function QuickQuotePanel({ isOpen, onClose }: QuickQuotePanelProps) {
    const { user } = useAuth();
    
    // --- STATES ---
    const [step, setStep] = useState<'product' | 'form'>('product');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedTali, setSelectedTali] = useState('');
    const [taliList, setTaliList] = useState<any[]>([]);
    
    // Loading States
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState('');

    // Form Data
    const [formData, setFormData] = useState({
        ad_soyad: '',
        tc_vkn: '',
        dogum_tarihi: '',
        plaka: '',
        belge_no: '',
        sasi_no: '',
        motor_no: '',
        arac_cinsi: '',
        marka_kodu: '',
        adres_kodu: '',
        m2: '',
        insaa_yili: '',
        kat_sayisi: '',
        daire_kati: '',
        faaliyet_konusu: '',
        emtia: '',
        teminatlar: '',
        limitli_limitsiz: 'LİMİTLİ',
        istenen_hastane: '',
        notlar: '',
        offer_details: ''
    });

    // Special Toggles
    const [isZeroVehicle, setIsZeroVehicle] = useState(false);
    
    // TSS/ÖSS Members
    const [members, setMembers] = useState<{tc: string, dogum: string, yakinlik: string}[]>([]);
    const [newMember, setNewMember] = useState({tc: '', dogum: '', yakinlik: 'KENDİSİ'});

    // Attachments
    const [attachments, setAttachments] = useState<{ url: string, type: 'image' | 'file', name: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const extraFileRef = useRef<HTMLInputElement>(null);

    // --- EFFECTS ---
    useEffect(() => {
        if (isOpen) {
            fetchTalis();
        } else {
            // Reset all state when closed
            setStep('product');
            setSelectedProduct('');
            setSelectedTali('');
            setLoading(false);
            setScanning(false);
            setScanStatus('');
            setFormData({
                ad_soyad: '',
                tc_vkn: '',
                dogum_tarihi: '',
                plaka: '',
                belge_no: '',
                sasi_no: '',
                motor_no: '',
                arac_cinsi: '',
                marka_kodu: '',
                adres_kodu: '',
                m2: '',
                insaa_yili: '',
                kat_sayisi: '',
                daire_kati: '',
                faaliyet_konusu: '',
                emtia: '',
                teminatlar: '',
                limitli_limitsiz: 'LİMİTLİ',
                istenen_hastane: '',
                notlar: '',
                offer_details: ''
            });
            setIsZeroVehicle(false);
            setMembers([]);
            setNewMember({tc: '', dogum: '', yakinlik: 'KENDİSİ'});
            setAttachments([]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const fetchTalis = async () => {
        // Fetch only WhatsApp Groups as per request
        const { data } = await supabase.from('chat_groups').select('id, name, group_jid').order('name');
        setTaliList(data || []);
    };

    // --- HANDLERS ---
    
    const handleProductSelect = (product: string) => {
        setSelectedProduct(product);
        setStep('form');
        // Reset specific fields if needed
        setFormData(prev => ({ ...prev, notlar: '', offer_details: '' }));
    };

    const handlePaste = async (type: 'document' | 'offer-image' = 'offer-image') => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(t => t.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    let ext = 'png';
                    if (blob.type.includes('jpeg')) ext = 'jpg';
                    const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
                    
                    await uploadFile(file, type);
                    break;
                }
            }
        } catch (e) {
            alert('Pano erişimi başarısız. Ctrl+V deneyin.');
        }
    };

    const uploadFile = async (file: File, type: 'document' | 'offer-image' | 'file') => {
        if (!user) return;
        setLoading(true);
        try {
            // Check if document type, if so, trigger OCR directly and do NOT upload
            if (type === 'document') {
                if (file.type.startsWith('image/')) {
                    const shouldScanLicense = ['TRAFİK', 'KASKO'].includes(selectedProduct);
                    const shouldScanID = ['TSS', 'ÖSS'].includes(selectedProduct);

                    if (shouldScanLicense || shouldScanID) {
                        await processOCR(file, shouldScanLicense ? 'license' : 'id');
                    }
                } else {
                     console.log('OCR skipped: Not an image.');
                }
                setLoading(false);
                return; // SKIP UPLOAD and SKIP ATTACHMENT ADDITION
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `${type}-${Date.now()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
            
            setAttachments(prev => [...prev, { url: publicUrl, type: type === 'offer-image' ? 'image' : 'file', name: file.name }]);

        } catch (error) {
            console.error(error);
            alert('Dosya yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    const processOCR = async (file: File, type: 'license' | 'id') => {
        setScanning(true);
        setScanStatus('Gemini Analiz Ediyor...');
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
                    ad_soyad: prev.ad_soyad || (type === 'id' ? 'Ad Soyad (OCR Bulunamadı)' : prev.ad_soyad)
                }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setScanning(false);
            setScanStatus('');
        }
    };

    const handleAddMember = () => {
        if (newMember.tc) {
            setMembers([...members, newMember]);
            setNewMember({ tc: '', dogum: '', yakinlik: 'EŞ' });
        }
    };

    const handleComplete = async () => {
        if (!selectedTali) {
            alert('Lütfen bir Tali/Müşteri seçin.');
            return;
        }

        setLoading(true);
        try {
            // 1. Create Quote Record
            // Note: We are using existing 'teklifler' table. We might need to map fields to 'ek_bilgiler' or 'notlar' 
            // since the table schema might not have all new columns (adres_kodu, m2, etc).
            // We will dump specific fields into 'notlar' for now to be safe.
            
            let extraInfo = '';
            if (['DASK', 'KONUT', 'İŞYERİ'].includes(selectedProduct)) {
                extraInfo += `ADRES KODU: ${formData.adres_kodu} | M2: ${formData.m2} | İNŞA YILI: ${formData.insaa_yili} | KAT: ${formData.kat_sayisi}/${formData.daire_kati}\n`;
            }
            if (['TSS', 'ÖSS'].includes(selectedProduct)) {
                extraInfo += `FERTLER: ${members.map(m => `${m.tc}-${m.yakinlik}`).join(', ')} | HASTANE: ${formData.istenen_hastane}\n`;
            }
            if (isZeroVehicle) extraInfo += `[SIFIR ARAÇ] MOTOR: ${formData.motor_no} | MARKA KODU: ${formData.marka_kodu}\n`;

            const fullNotes = `${extraInfo}\n${formData.notlar}`;

            // Find the selected group
            const selectedGroup = taliList.find(t => t.id === selectedTali);

            const { data: quote, error } = await supabase.from('teklifler').insert({
                ilgili_kisi_id: null, // Since it's a group, set this to null to avoid FK error
                misafir_bilgi: { 
                    group_id: selectedTali, 
                    group_name: selectedGroup?.name,
                    group_jid: selectedGroup?.group_jid
                },
                kesen_id: user?.id,
                ad_soyad: formData.ad_soyad,
                tc_vkn: formData.tc_vkn,
                plaka: formData.plaka,
                belge_no: formData.belge_no,
                sasi_no: formData.sasi_no,
                arac_cinsi: formData.arac_cinsi,
                dogum_tarihi: formData.dogum_tarihi || null,
                tur: selectedProduct,
                notlar: fullNotes,
                durum: 'hesaplandi', // Automatically completed
                ek_bilgiler: formData.offer_details, // Offer details
                police_no: formData.offer_details, // Using police_no column for offer summary as requested before? Or stick to ek_bilgiler.
                // kart_bilgisi: attachments.length > 0 ? attachments[0].url : null // First attachment as main image
            }).select().single();

            if (error) throw error;

            // 2. Send WhatsApp Message
            if (selectedGroup?.group_jid) {
                // Send Attachments
                for (const att of attachments) {
                    await supabase.from('messages').insert({
                        sender_phone: selectedGroup.group_jid,
                        group_id: selectedGroup.id,
                        direction: 'outbound',
                        type: att.type === 'image' ? 'image' : 'text',
                        content: att.type === 'image' ? '' : `📄 ${att.name}: ${att.url}`,
                        media_url: att.type === 'image' ? att.url : null,
                        status: 'pending'
                    });
                }

                // Send Text
                const header = `${formData.ad_soyad || 'MÜŞTERİ'} ${selectedProduct} ${formData.plaka || ''}`;
                const body = `${header.toUpperCase()}\n${formData.offer_details}\n\n${fullNotes}`;

                await supabase.from('messages').insert({
                    sender_phone: selectedGroup.group_jid,
                    group_id: selectedGroup.id,
                    direction: 'outbound',
                    type: 'text',
                    content: body,
                    status: 'pending'
                });
            }

            alert('Teklif oluşturuldu ve gönderildi!');
            onClose();

        } catch (e: any) {
            console.error(e);
            alert('Hata: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER HELPERS ---
    const renderFormFields = () => {
        // Common Fields based on Product
        const isVehicle = ['TRAFİK', 'KASKO'].includes(selectedProduct);
        const isHealth = ['TSS', 'ÖSS'].includes(selectedProduct);
        const isProperty = ['DASK', 'KONUT', 'İŞYERİ'].includes(selectedProduct);

        return (
            <div className="space-y-4">
                {/* 4. SCAN BUTTON AT TOP */}
                <div className="flex gap-2">
                    <label className="flex-1 border border-dashed border-gray-300 rounded p-2 flex items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-500 text-sm">
                        <Camera size={18} className="mr-2"/>
                        {scanning ? scanStatus : 'Belge Tara & Yükle (OCR)'}
                        <input type="file" className="hidden" ref={extraFileRef} onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'document')} />
                    </label>
                    {/* 2. Paste Button */}
                    <button onClick={() => handlePaste('document')} className="flex-1 border border-gray-300 rounded p-2 flex items-center justify-center hover:bg-gray-50 text-gray-600 text-sm">
                         <Clipboard size={18} className="mr-2"/>
                         Panodan Yapıştır
                    </button>
                </div>

                        {/* Tali Selection */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tali / Müşteri Seç</label>
                            <select 
                                className="w-full border rounded p-2 text-sm"
                                value={selectedTali}
                                onChange={e => setSelectedTali(e.target.value)}
                            >
                                <option value="">Seçiniz...</option>
                                {taliList.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                {/* --- VEHICLE FORM --- */}
                {isVehicle && (
                    <>
                         <div className="flex items-center space-x-2 bg-yellow-50 p-2 rounded">
                            <input 
                                type="checkbox" 
                                id="zero" 
                                checked={isZeroVehicle} 
                                onChange={e => setIsZeroVehicle(e.target.checked)} 
                            />
                            <label htmlFor="zero" className="text-sm font-bold text-yellow-800">Sıfır Araç mı?</label>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                             <input placeholder="Adı Soyadı / Ünvanı" className="border p-2 rounded text-sm" value={formData.ad_soyad} onChange={e => setFormData({...formData, ad_soyad: e.target.value})} />
                             <input placeholder="TC / VKN" className="border p-2 rounded text-sm" value={formData.tc_vkn} onChange={e => setFormData({...formData, tc_vkn: e.target.value})} />
                             {formData.tc_vkn.length === 11 && (
                                <input 
                                    placeholder="Doğum Tarihi (GG.AA.YYYY)"
                                    className="border p-2 rounded text-sm" 
                                    value={formData.dogum_tarihi} 
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        if (val.length > 2) val = val.slice(0,2) + '.' + val.slice(2);
                                        if (val.length > 5) val = val.slice(0,5) + '.' + val.slice(5);
                                        if (val.length > 10) val = val.slice(0,10);
                                        setFormData({...formData, dogum_tarihi: val});
                                    }} 
                                />
                             )}
                             <input placeholder="Plaka" className="border p-2 rounded text-sm font-bold" value={formData.plaka} onChange={e => setFormData({...formData, plaka: e.target.value.toUpperCase()})} />
                             
                             {isZeroVehicle ? (
                                <>
                                    <input placeholder="Motor No" className="border p-2 rounded text-sm" value={formData.motor_no} onChange={e => setFormData({...formData, motor_no: e.target.value})} />
                                    <input placeholder="Marka Kodu" className="border p-2 rounded text-sm" value={formData.marka_kodu} onChange={e => setFormData({...formData, marka_kodu: e.target.value})} />
                                </>
                             ) : (
                                <input placeholder="Belge No" className="border p-2 rounded text-sm" value={formData.belge_no} onChange={e => setFormData({...formData, belge_no: e.target.value})} />
                             )}
                             
                             <input placeholder="Şasi No" className="border p-2 rounded text-sm" value={formData.sasi_no} onChange={e => setFormData({...formData, sasi_no: e.target.value})} />
                             <input placeholder="Araç Cinsi" className="border p-2 rounded text-sm" value={formData.arac_cinsi} onChange={e => setFormData({...formData, arac_cinsi: e.target.value})} />
                        </div>
                    </>
                )}

                {/* --- HEALTH FORM --- */}
                {isHealth && (
                    <>
                        {/* Removed duplicate TC/DOB inputs as per request */}
                        {/* Members List */}
                        <div className="bg-gray-50 p-3 rounded border">
                            <label className="text-xs font-bold block mb-2">Aile Bireyleri / Sigortalılar</label>
                            <div className="flex gap-2 mb-2">
                                <input placeholder="TC" className="border p-1 text-xs w-24" value={newMember.tc} onChange={e => setNewMember({...newMember, tc: e.target.value})} />
                                <input 
                                    placeholder="Doğum Tarihi (GG.AA.YYYY)"
                                    className="border p-1 text-xs w-32" 
                                    value={newMember.dogum} 
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        if (val.length > 2) val = val.slice(0,2) + '.' + val.slice(2);
                                        if (val.length > 5) val = val.slice(0,5) + '.' + val.slice(5);
                                        if (val.length > 10) val = val.slice(0,10);
                                        setNewMember({...newMember, dogum: val});
                                    }} 
                                />
                                <select className="border p-1 text-xs" value={newMember.yakinlik} onChange={e => setNewMember({...newMember, yakinlik: e.target.value})}>
                                    <option value="EŞ">EŞ</option>
                                    <option value="ÇOCUK">ÇOCUK</option>
                                    {!members.some(m => m.yakinlik === 'KENDİSİ') && <option value="KENDİSİ">KENDİSİ</option>}
                                </select>
                                <button 
                                    onClick={handleAddMember} 
                                    disabled={!newMember.tc || !newMember.dogum}
                                    className="bg-blue-600 text-white px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={14}/>
                                </button>
                            </div>
                            <div className="space-y-1">
                                {members.map((m, i) => (
                                    <div key={i} className="flex justify-between text-xs bg-white p-1 border rounded">
                                        <span>{m.yakinlik} - {m.tc} - {m.dogum}</span>
                                        <button onClick={() => setMembers(members.filter((_, idx) => idx !== i))} className="text-red-500"><Trash2 size={12}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <input placeholder="İstenen Hastane / Ağ" className="border p-2 rounded text-sm w-full" value={formData.istenen_hastane} onChange={e => setFormData({...formData, istenen_hastane: e.target.value})} />
                    </>
                )}

                {/* --- PROPERTY FORM --- */}
                {isProperty && (
                    <div className="grid grid-cols-2 gap-3">
                        <input placeholder="TC / VKN" className="border p-2 rounded text-sm" value={formData.tc_vkn} onChange={e => setFormData({...formData, tc_vkn: e.target.value})} />
                        <input 
                            placeholder="Doğum Tarihi (GG.AA.YYYY)"
                            className="border p-2 rounded text-sm" 
                            value={formData.dogum_tarihi} 
                            onChange={e => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val.length > 2) val = val.slice(0,2) + '.' + val.slice(2);
                                if (val.length > 5) val = val.slice(0,5) + '.' + val.slice(5);
                                if (val.length > 10) val = val.slice(0,10);
                                setFormData({...formData, dogum_tarihi: val});
                            }} 
                        />
                        <input placeholder="Adres Kodu (UAVT)" className="border p-2 rounded text-sm" value={formData.adres_kodu} onChange={e => setFormData({...formData, adres_kodu: e.target.value})} />
                        <input placeholder="M2 (Brüt)" className="border p-2 rounded text-sm" value={formData.m2} onChange={e => setFormData({...formData, m2: e.target.value})} />
                        <input placeholder="İnşa Yılı" className="border p-2 rounded text-sm" value={formData.insaa_yili} onChange={e => setFormData({...formData, insaa_yili: e.target.value})} />
                        <div className="flex gap-2">
                             <input placeholder="Kat Sayısı" className="border p-2 rounded text-sm w-1/2" value={formData.kat_sayisi} onChange={e => setFormData({...formData, kat_sayisi: e.target.value})} />
                             <input placeholder="Daire Katı" className="border p-2 rounded text-sm w-1/2" value={formData.daire_kati} onChange={e => setFormData({...formData, daire_kati: e.target.value})} />
                        </div>
                    </div>
                )}

                <hr className="border-gray-200 my-4"/>

                {/* Offer Details */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teklif Detayları (Şirket/Fiyat/Taksit)</label>
                    <textarea 
                        className="w-full border rounded p-2 text-sm font-mono h-24"
                        placeholder="ANADOLU SİGORTA ... 2500 TL ... 6 TAKSİT"
                        value={formData.offer_details}
                        onChange={e => setFormData({...formData, offer_details: e.target.value})}
                    />
                    <button onClick={() => handlePaste('offer-image')} className="text-blue-600 text-xs flex items-center mt-1 hover:underline">
                        <Clipboard size={12} className="mr-1"/> Panodan Resim Yapıştır
                    </button>
                </div>

                {/* Attachments Display */}
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {attachments.map((att, i) => (
                            <div key={i} className="bg-gray-100 p-1 rounded text-xs flex items-center">
                                <span className="truncate max-w-[100px]">{att.name}</span>
                                <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="ml-1 text-red-500"><X size={12}/></button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-2">
                    {/* Only show upload button for relevant products */}
                    {/* 3. Remove Duplicate Scan Button (It's already at the top) */}
                    
                    <label className="flex-1 border border-gray-300 rounded p-2 flex items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-600 text-sm">
                        <Upload size={18} className="mr-2"/>
                        Ek Belge
                        <input type="file" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], 'file')} />
                    </label>
                </div>

                <button 
                    onClick={handleComplete}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow mt-4 flex justify-center items-center"
                >
                    {loading ? <Loader2 className="animate-spin"/> : 'TAMAMLA & GÖNDER'}
                </button>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex overflow-hidden">
            {/* Left Side: Internal Messages Component */}
            <div className="hidden md:block w-1/2 lg:w-2/3 bg-gray-100 h-full border-r border-gray-200 overflow-hidden flex flex-col">
                 <EmployeeMessagesPage />
            </div>
            
            {/* Right: Quote Panel */}
            <div className="w-full md:w-1/2 lg:w-1/3 bg-white h-full flex flex-col shadow-2xl z-20">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-lg text-gray-800">
                        {step === 'product' ? 'Hızlı Teklif Oluştur' : `${selectedProduct} Teklifi`}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto flex-1">
                    {step === 'product' ? (
                        <div className="grid grid-cols-2 gap-3">
                            {['TRAFİK', 'KASKO', 'DASK', 'KONUT', 'İŞYERİ', 'TSS', 'ÖSS'].map(p => (
                                <button 
                                    key={p} 
                                    onClick={() => handleProductSelect(p)}
                                    className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left font-bold text-gray-700 transition-all flex flex-col items-center justify-center gap-2 h-24"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    ) : (
                        renderFormFields()
                    )}
                </div>

                {step === 'form' && (
                    <div className="p-3 border-t bg-gray-50 flex justify-start">
                        <button onClick={() => setStep('product')} className="text-gray-500 text-sm hover:underline">
                            &larr; Ürün Değiştir
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
