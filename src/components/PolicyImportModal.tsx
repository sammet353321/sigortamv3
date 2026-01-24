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

const CHUNK_SIZE = 100; // Reduced from 500 for safer/more stable processing

export default function PolicyImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'upload' | 'analyzing' | 'importing'>('upload');
  const [progress, setProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- UTILS ---

  // Turkish character normalization for header matching
  const normalizeHeader = (header: string) => {
    return String(header)
      .toLocaleLowerCase('tr-TR')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
  };

  const parseDate = (val: any): Date | undefined => {
      if (!val) return undefined;
      try {
          // 1. Handle Excel Serial Date (Number)
          if (typeof val === 'number') {
              // Excel base date: Dec 30, 1899
              // Convert to UTC milliseconds
              // (val - 25569) gives days since 1970-01-01
              // * 86400 * 1000 gives milliseconds
              // We add 12 hours (43200000 ms) to set time to Noon (12:00) to avoid timezone shifting
              const utcMs = Math.round((val - 25569) * 86400 * 1000) + 43200000;
              const d = new Date(utcMs);
              if (!isNaN(d.getTime())) return d;
          }

          let strVal = String(val).trim();
          if (!strVal || strVal === '-' || strVal === '0') return undefined;

          // 2. Remove time and extra chars
          strVal = strVal.split(' ')[0].replace(/[^0-9./-]/g, '');

          // 3. Try to match DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
          // Regex to capture Day, Month, Year
          const match = strVal.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
          
          if (match) {
              let day = parseInt(match[1]);
              let month = parseInt(match[2]);
              let year = parseInt(match[3]);

              // Handle 2 digit year
              if (year < 100) year += 2000;

              // USE UTC NOON (12:00) to prevent timezone shift issues
              const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
              if (!isNaN(d.getTime())) return d;
          }

          // 4. Fallback: Try ISO YYYY-MM-DD
          const isoMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) {
               let year = parseInt(isoMatch[1]);
               let month = parseInt(isoMatch[2]);
               let day = parseInt(isoMatch[3]);
               const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
               if(!isNaN(d.getTime())) return d;
          }

          // 5. Fallback: Excel often gives 24.01.2024 as string
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

  // Helper to format Date object to YYYY-MM-DD string for DB
  const toDBDate = (d: Date | undefined): string | null => {
      if (!d) return null;
      // Use toISOString() which returns UTC. Since we set time to 12:00 UTC, this will always be correct date.
      // e.g. 2026-01-01T12:00:00.000Z -> 2026-01-01
      return d.toISOString().split('T')[0];
  };

  const parseMoney = (val: any): number => {
      // 1. Basic cleaning
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      
      let strVal = String(val).trim();
      if (!strVal || strVal === '-') return 0;

      // 2. Remove currency symbols and spaces
      // '1.234,56 TL' -> '1.234,56'
      strVal = strVal.replace(/[^\d.,-]/g, '');

      // 3. Detect Format
      const lastDot = strVal.lastIndexOf('.');
      const lastComma = strVal.lastIndexOf(',');

      // If no separators, direct parse
      if (lastDot === -1 && lastComma === -1) {
          return parseFloat(strVal) || 0;
      }

      // Turkish Format: 1.234,56 or 1234,56
      // Comma is the decimal separator
      // HEURISTIC: If comma is AFTER dot, or if only comma exists and it looks like decimal
      if (lastComma > lastDot) {
          // Turkish style confirmed: 1.234,56 -> remove dots, replace comma with dot
          strVal = strVal.replace(/\./g, '').replace(',', '.');
      } 
      else if (lastComma === -1 && lastDot > -1) {
          // Only dot exists: 1.234 (Thousand) OR 12.34 (Decimal)
          // TR context: Dot is usually thousand separator.
          // BUT if it has 2 decimals (12.34), it might be a price.
          // Safe bet for premiums: remove dots.
          strVal = strVal.replace(/\./g, '');
      }
      else {
           // English style: 1,234.56 -> remove commas
           strVal = strVal.replace(/,/g, '');
      }

      const num = parseFloat(strVal);
      return isNaN(num) ? 0 : num;
  };

  // --- CORE LOGIC ---

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
            
            // 1. Get ALL data as arrays to find the header
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            
            if (!rawData || rawData.length === 0) {
                alert("Dosya boş.");
                setStep('upload');
                return;
            }

            // 2. Find Header Row
            let headerRowIndex = -1;
            let headerMap: Record<string, number> = {}; // normalized_name -> column_index

            // EXPANDED ALIAS LIST for broader matching
            const targetHeaders = [
                'policeno', 'adsoyad', 'musteri', 'sigortali', 'unvan', 'plaka', 'tc', 'vkn', 'tcvkn', 'brutprim', 'tarih', 'sirket', 'acente', 'belgeno'
            ];

            // Increased scan depth to 100 for larger files with metadata headers
            for (let i = 0; i < Math.min(rawData.length, 100); i++) {
                const row = rawData[i];
                if (!Array.isArray(row)) continue;

                const normalizedRow = row.map(cell => normalizeHeader(String(cell || '')));
                const matchCount = normalizedRow.filter(h => targetHeaders.some(th => h.includes(th))).length;

                // Lower threshold to 2 if needed, but 3 is safer. 
                if (matchCount >= 2) { 
                    headerRowIndex = i;
                    // Build map
                    normalizedRow.forEach((h, colIdx) => {
                        if (h) headerMap[h] = colIdx;
                    });
                    break;
                }
            }

            if (headerRowIndex === -1) {
                setDebugInfo(`Başlık satırı bulunamadı. İlk 5 satır:\n${JSON.stringify(rawData.slice(0,5), null, 2)}`);
                alert("Başlık satırı bulunamadı! Lütfen dosyanızı kontrol edin.");
                setStep('upload');
                return;
            }

            // 3. Parse Data using the Header Map
            const dataRows = rawData.slice(headerRowIndex + 1);
            const total = dataRows.length;
            const parsedRows: ParsedRow[] = [];
            
            // Helper to get value by possible keys - STRICT MODE
            const getVal = (row: any[], keys: string[]) => {
                for (const key of keys) {
                    // Try exact match first
                    let colIdx = headerMap[key];
                    
                    // DISABLED FUZZY MATCHING to prevent wrong column mapping (e.g. 'Ek Bilgiler' matching 'bilgi')
                    /*
                    if (colIdx === undefined) {
                         const foundKey = Object.keys(headerMap).find(k => k.includes(key));
                         if (foundKey) colIdx = headerMap[foundKey];
                    }
                    */
                    
                    if (colIdx !== undefined && row[colIdx] !== undefined) {
                        return row[colIdx];
                    }
                }
                return undefined;
            };

            let processed = 0;
            
            // Process all rows in one go to keep it simple, or chunked for UI update
            const processChunk = async () => {
                 const end = Math.min(processed + 2000, total);
                 for (let i = processed; i < end; i++) {
                     const row = dataRows[i];
                     if (!row || row.length === 0) continue;

                     // Skip if it looks like a repeated header
                     const firstCell = normalizeHeader(String(row[0] || ''));
                     if (firstCell.includes('policeno') || firstCell.includes('adsoyad')) continue;

                     // Mapping with EXTENDED aliases
                     const police_no = String(getVal(row, ['policeno', 'police', 'policenumara']) || '').trim();
                     
                     // Name Logic: Try all aliases
                     // Added more specific aliases to cover common Excel headers without relying on fuzzy match
                     let ad_soyad = String(getVal(row, [
                         'adsoyad', 'musteriadi', 'unvan', 'sigortali', 'sigortaliadi', 'musteri', 
                         'adi', 'soyadi', 'adisoyadi', 'sigortaliadsoyad', 'isim', 'musteriunvani', 'sigortaliunvani'
                     ]) || '').trim();
                     
                     // Fallback 1: Separate Ad and Soyad columns
                     if (!ad_soyad || ad_soyad === '-' || ad_soyad === '0') {
                         const ad = String(getVal(row, ['ad', 'adi', 'isim']) || '').trim();
                         const soyad = String(getVal(row, ['soyad', 'soyadi']) || '').trim();
                         if (ad || soyad) {
                             ad_soyad = `${ad} ${soyad}`.trim();
                         }
                     }

                     const plaka = String(getVal(row, ['plaka', 'aracplaka']) || '').trim().toUpperCase();

                     // Validation: Must have at least Policy No OR Plaka OR Ad Soyad to be considered a row
                     if (!police_no && !plaka && !ad_soyad) continue;

                     const tur = String(getVal(row, ['tur', 'brans', 'urun', 'policecinsi']) || '').trim();
                     let durum = 'POLİÇE';
                     // Case insensitive check for "iptal" in TUR column
                     if (tur.toLocaleLowerCase('tr-TR').includes('iptal')) {
                         durum = 'İPTAL';
                     }

                     // --- DATE LOGIC v8.0 ---
                     // 1. Get the Raw Date from Excel
                     const dateRaw = getVal(row, ['tarih', 'bitis', 'bitistarihi', 'vadebitis', 'son', 'tanzimtarihi', 'baslangic', 'duzenlemetarihi', 'baslamatarihi', 'policetarihi', 'baslama']);
                     let endDate = parseDate(dateRaw) || new Date();
                     
                     let tanzimDate = new Date(endDate);
                     
                     if (durum === 'İPTAL') {
                         // Cancelled: Use Date AS IS
                     } else {
                         // Normal: Subtract 1 Year
                         tanzimDate.setFullYear(tanzimDate.getFullYear() - 1);
                     }
                     
                     // 3. Map to DB Fields using toDBDate helper (YYYY-MM-DD)
                     const dbTarihStr = toDBDate(endDate) || new Date().toISOString().split('T')[0];
                     const dbTanzimTarihiStr = toDBDate(tanzimDate);

                     const dogumDate = parseDate(getVal(row, ['dogumtarihi', 'dogum']));

                     parsedRows.push({
                         id: i,
                         police_no: police_no,
                         ad_soyad: ad_soyad || '-',
                         plaka: plaka || '-',
                         dogum_tarihi: toDBDate(dogumDate) || undefined,
                         sirket: String(getVal(row, ['sirket', 'sigortasirketi', 'firma']) || '-'),
                         tarih: dbTarihStr,
                         tanzim_tarihi: dbTanzimTarihiStr, 
                         sasi: String(getVal(row, ['sasi', 'sasino', 'sase']) || '-'),

                         tc_vkn: String(getVal(row, ['tc', 'vkn', 'tcvkn', 'kimlikno', 'verginumarasi']) || '-'),
                         belge_no: String(getVal(row, ['belgeno', 'ruhsatserino', 'tescilbelgeno']) || '-'),
                         arac_cinsi: String(getVal(row, ['araccinsi', 'marka', 'model', 'tipi']) || '-'),
                         brut_prim: parseMoney(getVal(row, ['brutprim', 'brut', 'toplamprim', 'prim', 'tutar', 'bruttutar', 'policeprimi', 'toplam'])),
                         net_prim: parseMoney(getVal(row, ['netprim', 'net', 'nettutar'])),
                         komisyon: parseMoney(getVal(row, ['komisyon', 'acentekomisyonu'])),
                         tur: tur || '-',
                         kesen: String(getVal(row, ['kesen', 'duzenleyen']) || '-'),
                         ilgili_kisi: String(getVal(row, ['ilgilikisi', 'tali']) || '-'),
                         acente: String(getVal(row, ['acente']) || '-'),
                         kart: String(getVal(row, ['kart', 'odemetipi']) || '-'),
                         ek_bilgiler_iletisim: String(getVal(row, ['ekbilgiler', 'iletisim', 'telefon']) || '-'),
                         durum: durum,
                         isValid: !!police_no, // Valid only if we have a Policy Number
                         error: !police_no ? 'Poliçe No Eksik' : undefined
                     });
                 }
                 
                 processed = end;
                 setAnalyzeProgress(Math.min(100, Math.round((processed / total) * 100)));

                 if (processed < total) {
                     // Add a small delay (10ms) to prevent UI freezing and allow browser to breathe
                     setTimeout(processChunk, 10);
                 } else {
                     // DONE ANALYZING -> START IMPORT DIRECTLY
                     const validRows = parsedRows.filter(r => r.isValid);
                     if (validRows.length === 0) {
                         alert("Başlıklar bulundu ancak geçerli poliçe numarası içeren kayıt okunamadı. Sütun isimlerini kontrol ediniz.");
                         setStep('upload');
                     } else {
                         // Direct Call to Import
                         await startAutoImport(validRows);
                     }
                 }
            };
            processChunk();

        } catch (error: any) {
            console.error(error);
            alert("Hata: " + error.message);
            onClose(); // Close on error as requested
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
              
              // DEDUPLICATION LOGIC
              // Create a Map to ensure unique police_no in this batch
              const uniqueBatchMap = new Map();
              
              // 1. Fetch existing policies for this batch to check constraints
              const policeNos = batch.map(b => b.police_no);
              const { data: existingPolicies } = await supabase
                .from('policeler')
                .select('police_no, ad_soyad, tur, brut_prim')
                .in('police_no', policeNos);

              const existingMap = new Map();
              if (existingPolicies) {
                  existingPolicies.forEach(p => existingMap.set(p.police_no, p));
              }

              const rowsToUpsert: any[] = [];

              batch.forEach(r => {
                  const existing = existingMap.get(r.police_no);
                  
                  // LOGIC: If policy exists, check if CRITICAL fields match.
                  // If they match -> Update (overwrite)
                  // If they DON'T match -> Still Update (overwrite) based on user request "Upsert"
                  // User said: "sadece poliçe no değil ama tür brüt prim ve adı soyadıda aynı olması lazım"
                  // This usually implies: "If these 4 fields match, then update. If not, maybe create new?"
                  // BUT police_no is UNIQUE. We cannot have two rows with same police_no.
                  // So we must overwrite. The user probably means:
                  // "Only update if it looks like the SAME policy (same person, same amount, same type)".
                  // If it's a different person with same policy number, that's a conflict/error?
                  // OR, maybe user means "Skip update if fields are identical to avoid redundant writes?"
                  
                  // Let's interpret "üstüne yazsın" as "Overwrite it". 
                  // And "aynı olması lazım" as a condition? 
                  // If user says "Ad Soyad, Tur, Prim, PoliceNo must be SAME to overwrite", 
                  // then what happens if they are DIFFERENT? We can't insert (unique constraint).
                  // We can't update (condition failed). So we SKIP?
                  
                  // Re-reading: "sadece poliçe no değil ama tür brüt prim ve adı soyadıda aynı olması lazım"
                  // "varsa onun üstüne yazsın" -> If there is a row where ALL 4 match, overwrite it?
                  // That makes no sense (why overwrite if it's already same?).
                  
                  // Context: Maybe user thinks we are duplicating data?
                  // "kontrol ekliyelim ADI SOYADI TÜR POLİÇE NO PRİM BU 4 aynı olduğu bir satır varsa onun üstüne yazsın o satırı"
                  // This likely means: "If a record exists with SAME PolicyNo + Name + Type + Prim, then UPDATE it (or skip, effect is same)."
                  // "If PolicyNo is same but Name is different -> This is a collision, maybe don't touch?"
                  
                  // ACTUAL INTERPRETATION FOR SAFETY:
                  // The user wants to prevent overwriting a policy if the new Excel row has the SAME Policy Number but DIFFERENT Name/Prim/Type.
                  // i.e. "Only update if it is indeed the same policy". 
                  // BUT if we don't update, we can't insert. So we skip.
                  
                  // Let's implement: 
                  // If Policy exists:
                  //    Check if (AdSoyad == Existing.AdSoyad AND Tur == Existing.Tur AND Prim == Existing.Prim)
                  //    If YES -> Update (Safe to overwrite)
                  //    If NO -> SKIP (Don't overwrite, because it might be a wrong match or collision)
                  // If Policy does NOT exist:
                  //    Insert.

                  let shouldUpsert = true;

                  if (existing) {
                      const nameMatch = existing.ad_soyad === r.ad_soyad;
                      const turMatch = existing.tur === r.tur;
                      // Float comparison with small epsilon
                      const primMatch = Math.abs((existing.brut_prim || 0) - (r.brut_prim || 0)) < 0.01;

                      // If ANY of these important fields is different, we assume it's a different/wrong policy 
                      // sharing the same number (or user wants to protect old data), so we SKIP.
                      // "bu 4 aynı olduğu bir satır varsa onun üstüne yazsın" -> Write ONLY if they are same.
                      if (!nameMatch || !turMatch || !primMatch) {
                          shouldUpsert = false;
                      }
                  }

                  if (shouldUpsert) {
                      // Key by police_no. If duplicates exist, the last one wins.
                        uniqueBatchMap.set(r.police_no, {
                            police_no: r.police_no,
                            ad_soyad: r.ad_soyad,
                            plaka: r.plaka,
                            tc_vkn: r.tc_vkn,
                            sirket: r.sirket,
                            tarih: r.tarih,
                            tanzim_tarihi: r.tanzim_tarihi, // Correctly use the calculated start date
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

              // Convert map values back to array
              const dbRows = Array.from(uniqueBatchMap.values());
              
              if (dbRows.length > 0) {
                  const { error } = await supabase.from('policeler').upsert(dbRows, { onConflict: 'police_no' });
                  if (error) throw error;
              }
              
              // Small delay between DB writes to be safer
              await new Promise(resolve => setTimeout(resolve, 50));
              
              setProgress(Math.round(((i + 1) / chunks) * 100));
          }
          
          // Success
          onSuccess();
          onClose();
          
      } catch (err: any) {
          console.error(err);
          alert("Import Hatası: " + err.message);
          onClose(); // Close on error as requested
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600" />
            Toplu Poliçe Yükleme Sihirbazı
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20}/></button>
        </div>

        {/* Body */}
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
