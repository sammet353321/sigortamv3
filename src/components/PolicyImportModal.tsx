import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { X, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  id: number;
  ad_soyad: string;
  dogum_tarihi?: string;
  sirket?: string;
  tarih?: string;
  sasi?: string;
  plaka: string;
  tc_vkn?: string;
  belge_no?: string;
  arac_cinsi?: string;
  brut_prim?: number;
  tur?: string;
  kesen?: string;
  ilgili_kisi?: string;
  police_no: string;
  acente?: string;
  kart?: string;
  ek_bilgiler_iletisim?: string;
  net_prim?: number;
  komisyon?: number;
  tanzim_tarihi?: string | null;
  durum: string;
  isValid: boolean;
  error?: string;
}

const CHUNK_SIZE = 100;

// STRICT HEADER MAPPING (User Defined)
const STRICT_MAPPING: Record<string, keyof ParsedRow> = {
    'adsoyad': 'ad_soyad',
    'dogumtarihi': 'dogum_tarihi',
    'sirket': 'sirket',
    'tarih': 'tarih',
    'sasi': 'sasi',
    'plaka': 'plaka',
    'tcvkn': 'tc_vkn',
    'belgeno': 'belge_no',
    'araccinsi': 'arac_cinsi',
    'brutprim': 'brut_prim',
    'tur': 'tur',
    'kesen': 'kesen',
    'ilgilikisi': 'ilgili_kisi',
    'policeno': 'police_no',
    'acente': 'acente',
    'kart': 'kart',
    'ekbilgileriletisim': 'ek_bilgiler_iletisim',
    'netprim': 'net_prim',
    'komisyon': 'komisyon'
};

const REQUIRED_HEADERS = Object.keys(STRICT_MAPPING);

export default function PolicyImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'upload' | 'analyzing' | 'importing'>('upload');
  const [progress, setProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- UTILS ---
  const normalizeHeader = (header: string) => {
    return String(header)
      .toLocaleLowerCase('tr-TR')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  };

  const parseDate = (val: any): Date | undefined => {
      if (!val) return undefined;
      try {
          if (typeof val === 'number') {
              const utcMs = Math.round((val - 25569) * 86400 * 1000) + 43200000;
              const d = new Date(utcMs);
              if (!isNaN(d.getTime())) return d;
          }

          let strVal = String(val).trim();
          if (!strVal || strVal === '-' || strVal === '0') return undefined;
          strVal = strVal.split(' ')[0].replace(/[^0-9./-]/g, '');

          const match = strVal.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
          if (match) {
              let day = parseInt(match[1]);
              let month = parseInt(match[2]);
              let year = parseInt(match[3]);
              if (year < 100) year += 2000;
              const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
              if (!isNaN(d.getTime())) return d;
          }

          const isoMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) {
               let year = parseInt(isoMatch[1]);
               let month = parseInt(isoMatch[2]);
               let day = parseInt(isoMatch[3]);
               const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
               if(!isNaN(d.getTime())) return d;
          }

          if (strVal.includes('.')) {
              const parts = strVal.split('.');
              if (parts.length === 3) {
                  let d = parseInt(parts[0]);
                  let m = parseInt(parts[1]);
                  let y = parseInt(parts[2]);
                  if (y < 100) y += 2000;
                  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                  if (!isNaN(dateObj.getTime())) return dateObj;
              }
          }
          return undefined;
      } catch {
          return undefined;
      }
  };

  const toDBDate = (d: Date | undefined): string | null => {
      if (!d) return null;
      return d.toISOString().split('T')[0];
  };

  const parseMoney = (val: any): number => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      
      let strVal = String(val).trim();
      if (!strVal || strVal === '-') return 0;
      strVal = strVal.replace(/[^\d.,-]/g, '');

      const lastDot = strVal.lastIndexOf('.');
      const lastComma = strVal.lastIndexOf(',');

      if (lastDot === -1 && lastComma === -1) {
          return parseFloat(strVal) || 0;
      }

      if (lastComma > lastDot) {
          strVal = strVal.replace(/\./g, '').replace(',', '.');
      } 
      else if (lastComma === -1 && lastDot > -1) {
          strVal = strVal.replace(/\./g, '');
      }
      else {
           strVal = strVal.replace(/,/g, '');
      }

      const num = parseFloat(strVal);
      return isNaN(num) ? 0 : num;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('analyzing');
    setAnalyzeProgress(0);
    setDebugInfo("");

    setTimeout(async () => {
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            
            if (!rawData || rawData.length === 0) {
                alert("Dosya boş.");
                setStep('upload');
                return;
            }

            let headerRowIndex = -1;
            let dbColMap: Record<string, number> = {};

            for (let i = 0; i < Math.min(rawData.length, 100); i++) {
                const row = rawData[i];
                if (!Array.isArray(row)) continue;

                const normalizedRow = row.map(cell => normalizeHeader(String(cell || '')));
                const missingHeaders = REQUIRED_HEADERS.filter(req => !normalizedRow.includes(req));

                if (missingHeaders.length === 0) {
                    headerRowIndex = i;
                    normalizedRow.forEach((h, colIdx) => {
                        const dbField = STRICT_MAPPING[h];
                        if (dbField) {
                            dbColMap[dbField] = colIdx;
                        }
                    });
                    break;
                }
            }

            if (headerRowIndex === -1) {
                setDebugInfo(`Başlık satırı bulunamadı. İlk 5 satır:\n${JSON.stringify(rawData.slice(0,5), null, 2)}`);
                alert("HATA: Excel formatı uyumsuz! Sadece izin verilen şablon yüklenebilir.\n\n" + 
                      "Beklenen Başlıklar (Sırası önemli değil):\n" +
                      "AD SOYAD, DOĞUM TARİHİ, ŞİRKET, TARİH, ŞASİ, PLAKA, TC/VKN, BELGE NO, ARAÇ CİNSİ, BRÜT PRİM, TÜR, KESEN, İLGİLİ KİŞİ, POLİÇE NO, ACENTE, KART, EK BİLGİLER / İLETİŞİM, NET PRİM, KOMİSYON");
                setStep('upload');
                return;
            }

            const dataRows = rawData.slice(headerRowIndex + 1);
            const total = dataRows.length;
            const parsedRows: ParsedRow[] = [];
            
            const getCol = (row: any[], field: keyof ParsedRow | string) => {
                const idx = dbColMap[field as string];
                if (idx !== undefined && row[idx] !== undefined) {
                    return row[idx];
                }
                return undefined;
            };

            let processed = 0;
            
            const processChunk = async () => {
                 const end = Math.min(processed + 2000, total);
                 for (let i = processed; i < end; i++) {
                     const row = dataRows[i];
                     if (!row || row.length === 0) continue;

                     const firstCell = normalizeHeader(String(row[0] || ''));
                     if (firstCell.includes('policeno') || firstCell.includes('adsoyad')) continue;

                     const police_no = String(getCol(row, 'police_no') || '').trim();
                     const ad_soyad = String(getCol(row, 'ad_soyad') || '').trim();
                     const plaka = String(getCol(row, 'plaka') || '').trim().toUpperCase();

                     if (!police_no && !plaka && !ad_soyad) continue;

                     const tur = String(getCol(row, 'tur') || '').trim();
                     let durum = 'POLİÇE';
                     if (tur.toLocaleLowerCase('tr-TR').includes('iptal')) {
                         durum = 'İPTAL';
                     }

                     const dateRaw = getCol(row, 'tarih');
                     let endDate = parseDate(dateRaw) || new Date();
                     
                     let tanzimDate = new Date(endDate);
                     if (durum !== 'İPTAL') {
                         tanzimDate.setFullYear(tanzimDate.getFullYear() - 1);
                     }
                     
                     const dbTarihStr = toDBDate(endDate) || new Date().toISOString().split('T')[0];
                     const dbTanzimTarihiStr = toDBDate(tanzimDate);
                     const dogumDate = parseDate(getCol(row, 'dogum_tarihi'));

                     parsedRows.push({
                         id: i,
                         police_no: police_no,
                         ad_soyad: ad_soyad || '-',
                         plaka: plaka || '-',
                         dogum_tarihi: toDBDate(dogumDate) || undefined,
                         sirket: String(getCol(row, 'sirket') || '-'),
                         tarih: dbTarihStr,
                         tanzim_tarihi: dbTanzimTarihiStr, 
                         sasi: String(getCol(row, 'sasi') || '-'),
                         tc_vkn: String(getCol(row, 'tc_vkn') || '-'),
                         belge_no: String(getCol(row, 'belge_no') || '-'),
                         arac_cinsi: String(getCol(row, 'arac_cinsi') || '-'),
                         brut_prim: parseMoney(getCol(row, 'brut_prim')),
                         net_prim: parseMoney(getCol(row, 'net_prim')),
                         komisyon: parseMoney(getCol(row, 'komisyon')),
                         tur: tur || '-',
                         kesen: String(getCol(row, 'kesen') || '-'),
                         ilgili_kisi: String(getCol(row, 'ilgili_kisi') || '-'),
                         acente: String(getCol(row, 'acente') || '-'),
                         kart: String(getCol(row, 'kart') || '-'),
                         ek_bilgiler_iletisim: String(getCol(row, 'ek_bilgiler_iletisim') || '-'),
                         durum: durum,
                         isValid: !!police_no, 
                         error: !police_no ? 'Poliçe No Eksik' : undefined
                     });
                 }
                 
                 processed = end;
                 setAnalyzeProgress(Math.min(100, Math.round((processed / total) * 100)));

                 if (processed < total) {
                     setTimeout(processChunk, 10);
                 } else {
                     const validRows = parsedRows.filter(r => r.isValid);
                     if (validRows.length === 0) {
                         alert("Başlıklar bulundu ancak geçerli poliçe numarası içeren kayıt okunamadı. Sütun isimlerini kontrol ediniz.");
                         setStep('upload');
                     } else {
                         await startAutoImport(validRows);
                     }
                 }
            };
            processChunk();

        } catch (error: any) {
            console.error(error);
            alert("Hata: " + error.message);
            onClose();
        }
    }, 100);
  };

  const startAutoImport = async (validRows: ParsedRow[]) => {
      if (!user) { alert("Oturum yok."); return; }
      setStep('importing');
      setProgress(0);
      
      const total = validRows.length;
      const chunks = Math.ceil(total / CHUNK_SIZE);

      try {
          for (let i = 0; i < chunks; i++) {
              const batch = validRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
              
              const uniqueBatchMap = new Map();
              
              const policeNos = batch.map(b => b.police_no);
              const { data: existingPolicies } = await supabase
                .from('policeler')
                .select('police_no, ad_soyad, tur, brut_prim')
                .in('police_no', policeNos);

              const existingMap = new Map();
              if (existingPolicies) {
                  existingPolicies.forEach(p => existingMap.set(p.police_no, p));
              }

              batch.forEach(r => {
                  const existing = existingMap.get(r.police_no);
                  let shouldUpsert = true;

                  if (existing) {
                      const nameMatch = existing.ad_soyad === r.ad_soyad;
                      const turMatch = existing.tur === r.tur;
                      const primMatch = Math.abs((existing.brut_prim || 0) - (r.brut_prim || 0)) < 0.01;

                      if (!nameMatch || !turMatch || !primMatch) {
                          shouldUpsert = false;
                      }
                  }

                  if (shouldUpsert) {
                        uniqueBatchMap.set(r.police_no, {
                            police_no: r.police_no,
                            ad_soyad: r.ad_soyad,
                            plaka: r.plaka,
                            tc_vkn: r.tc_vkn,
                            sirket: r.sirket,
                            tarih: r.tarih,
                            tanzim_tarihi: r.tanzim_tarihi,
                            dogum_tarihi: r.dogum_tarihi,
                            sasi: r.sasi,
                            belge_no: r.belge_no,
                            arac_cinsi: r.arac_cinsi,
                            brut_prim: r.brut_prim,
                            net_prim: r.net_prim,
                            komisyon: r.komisyon,
                            tur: r.tur,
                            kesen: r.kesen,
                            ilgili_kisi: r.ilgili_kisi,
                            acente: r.acente,
                            kart: r.kart,
                            ek_bilgiler_iletisim: r.ek_bilgiler_iletisim,
                            durum: r.durum,
                            employee_id: user.id,
                            updated_at: new Date().toISOString()
                        });
                  }
              });

              const dbRows = Array.from(uniqueBatchMap.values());
              
              if (dbRows.length > 0) {
                  const { error } = await supabase.from('policeler').upsert(dbRows, { onConflict: 'police_no' });
                  if (error) throw error;
              }
              
              await new Promise(resolve => setTimeout(resolve, 50));
              
              setProgress(Math.round(((i + 1) / chunks) * 100));
          }
          
          onSuccess();
          onClose();
          
      } catch (err: any) {
          console.error(err);
          alert("Import Hatası: " + err.message);
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600" />
            Toplu Poliçe Yükleme Sihirbazı
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20}/></button>
        </div>

        <div className="p-8 bg-gray-50/30 flex flex-col items-center">
          {step === 'upload' && (
             <div 
               className="w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all gap-4 bg-white"
               onClick={() => fileInputRef.current?.click()}
             >
               <Upload size={48} className="text-blue-600" />
               <div className="text-center">
                 <h4 className="text-xl font-semibold text-gray-800">Excel Dosyası Seçin</h4>
                 <p className="text-gray-500">Otomatik analiz ve yükleme başlatılacak.</p>
               </div>
               <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
               {debugInfo && (
                   <div className="mt-4 p-4 bg-red-50 text-red-700 text-xs font-mono whitespace-pre-wrap max-w-lg border border-red-200 rounded text-left">
                       {debugInfo}
                   </div>
               )}
             </div>
          )}

          {(step === 'analyzing' || step === 'importing') && (
              <div className="w-full flex flex-col items-center justify-center gap-6 bg-white rounded-2xl border border-gray-100 p-8">
                  <div className="w-32 h-32 relative">
                      <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-xl text-blue-600">
                          {step === 'analyzing' ? analyzeProgress : Math.round(progress)}%
                      </div>
                  </div>
                  <div className="text-center">
                      <h4 className="font-semibold text-lg">{step === 'analyzing' ? 'Dosya Analiz Ediliyor...' : 'Veritabanına Yazılıyor...'}</h4>
                      <p className="text-gray-500">Lütfen bekleyiniz, pencereyi kapatmayınız.</p>
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
