import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// 1. Strict Header Validation List
const EXPECTED_HEADERS = [
  'AD SOYAD', 'DOĞUM TARİHİ', 'ŞİRKET', 'TARİH', 'ŞASİ', 'PLAKA', 
  'TC/VKN', 'BELGE NO', 'ARAÇ CİNSİ', 'BRÜT PRİM', 'TÜR', 'KESEN', 
  'İLGİLİ KİŞİ', 'POLİÇE NO', 'ACENTE', 'KART', 'EK BİLGİLER / İLETİŞİM', 
  'NET PRİM', 'KOMİSYON'
];

const CHUNK_SIZE = 1000;

export default function PolicyImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'upload' | 'analyzing' | 'importing' | 'success' | 'error'>('upload');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- UTILS ---

  // Helper to convert Excel date (serial or string) to ISO 8601 (YYYY-MM-DD)
  // Returns Date object for calculations, or null
  const parseDateObj = (val: any): Date | null => {
    if (!val) return null;
    try {
        if (typeof val === 'number') {
            const utcMs = Math.round((val - 25569) * 86400 * 1000) + 43200000;
            return new Date(utcMs);
        }
        
        const strVal = String(val).trim();
        if (!strVal || strVal === '-' || strVal === '0') return null;

        const parts = strVal.split(/[./-]/);
        if (parts.length === 3) {
            let d = parseInt(parts[0]);
            let m = parseInt(parts[1]);
            let y = parseInt(parts[2]);
            if (y < 100) y += 2000;
            return new Date(Date.UTC(y, m - 1, d));
        }
        
        const d = new Date(strVal);
        if (!isNaN(d.getTime())) return d;
    } catch (e) { console.warn(e); }
    return null;
  };

  const toISO = (d: Date | null): string | null => {
      return d ? d.toISOString().split('T')[0] : null;
  };

  // Helper to clean numbers (remove currency symbols, handle Turkish format)
  const parseNumber = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;

    let strVal = String(val).trim();
    // Remove all non-numeric chars except . , -
    strVal = strVal.replace(/[^\d.,-]/g, '');
    
    if (!strVal) return 0;

    // TURKISH FORMAT PRIORITY
    // 1. If contains comma (,), it is the decimal separator.
    if (strVal.includes(',')) {
        // Remove all dots (thousands separators)
        strVal = strVal.replace(/\./g, '');
        // Replace comma with dot for JS parseFloat
        strVal = strVal.replace(',', '.');
    }
    // 2. If contains ONLY dots (e.g. 1.500 or 1.000.000 or 12.50)
    else if (strVal.includes('.')) {
        const parts = strVal.split('.');
        
        // If multiple dots (1.000.000), they are definitely thousands separators
        if (parts.length > 2) {
             strVal = strVal.replace(/\./g, '');
        }
        // If single dot (1.500 or 12.50)
        else {
            const decimalPart = parts[1];
            // Heuristic: If exactly 3 digits after dot, assume it's a thousands separator (1.500 -> 1500)
            // This fixes "Brüt Prim" issue where 1.500 was read as 1.5
            if (decimalPart && decimalPart.length === 3) {
                 strVal = strVal.replace(/\./g, '');
            }
            // Otherwise (12.50, 1.5, 10.99) treat as decimal
        }
    }

    const num = parseFloat(strVal);
    return isNaN(num) ? 0 : num;
  };

  const cleanString = (val: any): string => {
    return val ? String(val).trim() : '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('analyzing');
    setStatusMessage("Dosya okunuyor...");
    setErrorDetails([]);

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to JSON (Array of Arrays) to check headers first
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!rawData || rawData.length === 0) {
            throw new Error("Dosya boş.");
        }

        // 1. Strict Header Validation
        const fileHeaders = (rawData[0] as any[]).map(h => String(h).trim());
        const missingHeaders = EXPECTED_HEADERS.filter(h => !fileHeaders.includes(h));

        if (missingHeaders.length > 0) {
            setStep('error');
            setErrorDetails([
                `HATA: Excel başlıkları beklenen formatla uyuşmuyor.`,
                `Eksik veya Hatalı Başlıklar: ${missingHeaders.join(', ')}`,
                `Beklenen: ${EXPECTED_HEADERS.join(', ')}`
            ]);
            return;
        }

        // Map headers to indices
        const headerMap: Record<string, number> = {};
        fileHeaders.forEach((h, i) => {
            if (EXPECTED_HEADERS.includes(h)) {
                headerMap[h] = i;
            }
        });

        // 2. Process Data
        setStep('importing');
        const dataRows = rawData.slice(1) as any[][]; // Skip header
        const totalRows = dataRows.length;
        
        if (totalRows === 0) {
            throw new Error("Başlıklar doğru ancak veri bulunamadı.");
        }

        let processedCount = 0;
        
        // Process in chunks
        for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
            const chunk = dataRows.slice(i, i + CHUNK_SIZE);
            // Use Map for deduplication based on police_no
            const uniqueRowsMap = new Map();

            for (const row of chunk) {
                // Skip empty rows
                if (!row || row.length === 0) continue;

                const getVal = (header: string) => row[headerMap[header]];
                
                const policeNo = cleanString(getVal('POLİÇE NO'));
                // Skip if no policy number (crucial identifier)
                if (!policeNo) continue;

                const tur = cleanString(getVal('TÜR'));
                const bitisDateObj = parseDateObj(getVal('TARİH'));
                const dogumDateObj = parseDateObj(getVal('DOĞUM TARİHİ'));

                // --- 2. Tanzim Tarihi Calculation Logic ---
                // If TÜR contains 'İPTAL', tanzim_tarihi = TARİH (End Date)
                // Else, tanzim_tarihi = TARİH - 1 Year
                let tanzimDateObj: Date | null = null;
                const isIptal = tur.toLocaleLowerCase('tr-TR').includes('iptal');

                if (bitisDateObj) {
                    if (isIptal) {
                        tanzimDateObj = new Date(bitisDateObj);
                    } else {
                        tanzimDateObj = new Date(bitisDateObj);
                        tanzimDateObj.setFullYear(tanzimDateObj.getFullYear() - 1);
                    }
                }

                // --- 3. Status Logic ---
                const durum = isIptal ? 'İPTAL' : 'POLİÇE';

                // Prepare DB Object
                // Overwrite if exists (last one wins)
                uniqueRowsMap.set(policeNo, {
                    ad_soyad: cleanString(getVal('AD SOYAD')),
                    dogum_tarihi: toISO(dogumDateObj),
                    sirket: cleanString(getVal('ŞİRKET')),
                    tarih: toISO(bitisDateObj), // This is the End Date (Bitiş Tarihi)
                    tanzim_tarihi: toISO(tanzimDateObj), // Calculated Start Date
                    sasi: cleanString(getVal('ŞASİ')),
                    plaka: cleanString(getVal('PLAKA')),
                    tc_vkn: cleanString(getVal('TC/VKN')),
                    belge_no: cleanString(getVal('BELGE NO')),
                    arac_cinsi: cleanString(getVal('ARAÇ CİNSİ')),
                    brut_prim: parseNumber(getVal('BRÜT PRİM')),
                    tur: tur,
                    durum: durum, // Calculated Status
                    kesen: cleanString(getVal('KESEN')),
                    ilgili_kisi: cleanString(getVal('İLGİLİ KİŞİ')),
                    police_no: policeNo,
                    acente: cleanString(getVal('ACENTE')),
                    kart: cleanString(getVal('KART')),
                    ek_bilgiler_iletisim: cleanString(getVal('EK BİLGİLER / İLETİŞİM')),
                    net_prim: parseNumber(getVal('NET PRİM')),
                    komisyon: parseNumber(getVal('KOMİSYON')),
                    // System Fields
                    employee_id: user?.id,
                    updated_at: new Date().toISOString()
                });
            }

            const dbRows = Array.from(uniqueRowsMap.values());

            if (dbRows.length > 0) {
                // Upsert to Supabase
                const { error } = await supabase
                    .from('policeler')
                    .upsert(dbRows, { onConflict: 'police_no' });

                if (error) {
                    throw new Error(`Veritabanı hatası (Satır ${i + 1}-${i + chunk.length}): ${error.message}`);
                }
            }

            processedCount += chunk.length;
            const progressPercent = Math.min(100, Math.round((processedCount / totalRows) * 100));
            setProgress(progressPercent);
            setStatusMessage(`${processedCount} / ${totalRows} satır işlendi...`);
            
            // Small delay to allow UI updates and prevent freezing
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        setStep('success');
        setStatusMessage("Tüm kayıtlar başarıyla yüklendi!");
        setTimeout(() => {
            onSuccess();
            onClose();
        }, 2000);

    } catch (err: any) {
        console.error(err);
        setStep('error');
        setErrorDetails([err.message || "Bilinmeyen bir hata oluştu."]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600" />
            Toplu Poliçe Yükleme
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20}/></button>
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center justify-center flex-1 overflow-y-auto">
            
            {/* STEP: UPLOAD */}
            {step === 'upload' && (
                <div 
                    className="w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all gap-4 bg-white group"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="p-4 rounded-full bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                        <Upload size={40} />
                    </div>
                    <div className="text-center">
                        <h4 className="text-lg font-bold text-gray-800">Excel Dosyası Seçin</h4>
                        <p className="text-sm text-gray-500 mt-1">.xlsx veya .csv formatında</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
                    
                    <div className="text-xs text-gray-400 mt-4 max-w-sm text-center">
                        * Dosya başlıkları zorunlu formatta olmalıdır.
                    </div>
                </div>
            )}

            {/* STEP: PROCESSING */}
            {(step === 'analyzing' || step === 'importing') && (
                <div className="w-full text-center space-y-6">
                    <div className="relative w-32 h-32 mx-auto">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle className="text-gray-200 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                            <circle className="text-blue-600 progress-ring__circle stroke-current transition-all duration-300" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * progress) / 100} transform="rotate(-90 50 50)"></circle>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-2xl font-bold text-blue-600">{progress}%</span>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-lg font-bold text-gray-800 flex items-center justify-center gap-2">
                            <Loader2 className="animate-spin" size={20} />
                            {step === 'analyzing' ? 'Dosya Analiz Ediliyor...' : 'Veriler Yükleniyor...'}
                        </h4>
                        <p className="text-gray-500 mt-2 font-mono text-sm">{statusMessage}</p>
                    </div>
                </div>
            )}

            {/* STEP: SUCCESS */}
            {step === 'success' && (
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={48} />
                    </div>
                    <h4 className="text-2xl font-bold text-gray-800">İşlem Başarılı!</h4>
                    <p className="text-gray-500">Tüm veriler güvenli bir şekilde veritabanına aktarıldı.</p>
                </div>
            )}

            {/* STEP: ERROR */}
            {step === 'error' && (
                <div className="w-full space-y-4">
                    <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-lg border border-red-100">
                        <AlertTriangle size={24} className="flex-shrink-0" />
                        <h4 className="font-bold">Yükleme Başarısız</h4>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm font-mono text-gray-700 max-h-60 overflow-y-auto">
                        {errorDetails.map((err, idx) => (
                            <div key={idx} className="mb-2 last:mb-0 border-b last:border-0 border-gray-200 pb-2 last:pb-0">
                                {err}
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={() => setStep('upload')}
                        className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 transition-colors"
                    >
                        Tekrar Dene
                    </button>
                </div>
            )}

        </div>
      </div>
    </div>
  );
}
