import React, { useState, useRef, useMemo } from 'react';
import { Grid, Willow } from "@svar-ui/react-grid";
import "@svar-ui/react-grid/all.css";
import { supabase } from '../lib/supabase';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  id: number;
  policy_no: string;
  customer_name: string;
  branch: string;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number;
  commission_amount: number;
  isValid: boolean;
  error?: string;
}

const CHUNK_SIZE = 500;

export default function PolicyImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'preview' | 'importing'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation Logic (Same as before)
  const validateRow = (row: any, index: number): ParsedRow => {
    // ... validation logic (kept same for brevity in this snippet, will include full in implementation)
    const errors: string[] = [];
    
    const normalizedRow = Object.keys(row).reduce((acc, key) => {
        acc[key.toLowerCase()] = row[key];
        return acc;
    }, {} as any);

    // Log detected keys for debugging
    if (index === 0) {
        console.log('Detected Headers:', Object.keys(normalizedRow));
        console.log('Original Row:', row);
    }

    // Helper to find value by possible keys
    const getValue = (...keys: string[]) => {
        for (const key of keys) {
            if (normalizedRow[key] !== undefined) return normalizedRow[key];
        }
        return undefined;
    };

    const policy_no = getValue('policy_no', 'poliçe no', 'police no', 'policeno', 'poliçe numarası', 'police numarasi', 'poliçe no.');
    const customer_name = getValue('customer_name', 'müşteri adı', 'musteri adi', 'ad soyad', 'sigortalı', 'sigortali', 'müşteri', 'musteri', 'unvan', 'ünvan', 'ad', 'soyad', 'isim');
    const premium_amount = getValue('premium_amount', 'prim', 'tutar', 'amount', 'brüt prim', 'brut prim', 'toplam prim', 'net prim', 'fiyat');
    const commission_amount = getValue('commission_amount', 'komisyon', 'commission', 'komisyon tutarı', 'acente komisyonu', 'net komisyon');
    const branch = getValue('branch', 'branş', 'brans', 'ürün', 'urun', 'branş adı');
    const start_date = getValue('start_date', 'başlangıç', 'baslangic', 'tanzim', 'tanzim tarihi', 'vade başı', 'başlangıç tarihi');
    const end_date = getValue('end_date', 'bitiş', 'bitis', 'vade', 'vade sonu', 'bitiş tarihi', 'yürürlük sonu');

    if (!policy_no) errors.push('Poliçe No eksik');
    if (!customer_name) errors.push('Müşteri adı eksik');
    if (!premium_amount || isNaN(Number(premium_amount))) errors.push('Prim tutarı geçersiz');
    
    const parseDate = (val: any) => {
        if (!val) return null;
        try {
            if (typeof val === 'number') {
                return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
            }
            if (typeof val === 'string' && val.includes('.')) {
                const parts = val.split('.');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
            }
            return new Date(val).toISOString();
        } catch {
            return null;
        }
    };

    const start = parseDate(start_date);
    const end = parseDate(end_date);
    if (start_date && !start) errors.push('Başlangıç tarihi formatı hatalı');

    return {
      id: index,
      policy_no: String(policy_no || ''),
      customer_name: String(customer_name || ''),
      branch: String(branch || 'genel'),
      start_date: start,
      end_date: end,
      premium_amount: Number(premium_amount || 0),
      commission_amount: Number(commission_amount || 0),
      isValid: errors.length === 0,
      error: errors.join(', ')
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRows([]);
    setStep('analyzing');
    setAnalyzeProgress(0);

    // Give UI a moment to update
    setTimeout(async () => {
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const total = jsonData.length;
            const chunkSize = 1000;
            let processed = 0;
            let allParsed: ParsedRow[] = [];

            const processChunk = () => {
                const chunk = jsonData.slice(processed, processed + chunkSize);
                const parsedChunk = chunk.map((row, idx) => validateRow(row, processed + idx));
                allParsed = [...allParsed, ...parsedChunk];
                processed += chunkSize;
                
                setAnalyzeProgress(Math.min(100, Math.round((processed / total) * 100)));

                if (processed < total) {
                    setTimeout(processChunk, 0);
                } else {
                    setRows(allParsed);
                    // If too many rows (e.g. > 1000) and errors exist, default to showing errors
                    if (allParsed.length > 1000 && allParsed.some(r => !r.isValid)) {
                        setShowOnlyErrors(true);
                    }
                    setStep('preview');
                }
            };

            processChunk();

        } catch (error) {
            console.error('File parsing error:', error);
            alert('Dosya okunamadı.');
            setStep('upload');
        }
    }, 100);
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) return;

    setStep('importing');
    setProgress(0);
    const totalChunks = Math.ceil(validRows.length / CHUNK_SIZE);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = validRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        
        // Call Edge Function
        const { error } = await supabase.functions.invoke('import-policies', {
          body: { rows: chunk }
        });

        if (error) throw error;

        setProgress(((i + 1) / totalChunks) * 100);
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Import hatası: ' + err.message);
      setStep('preview');
    }
  };

  const columns = [
    { id: "isValid", header: "", width: 50, template: (r: ParsedRow) => r.isValid ? <CheckCircle size={16} className="text-green-500" /> : <AlertTriangle size={16} className="text-red-500" /> },
    { id: "policy_no", header: "Poliçe No", width: 140 },
    { id: "customer_name", header: "Müşteri", width: 180 },
    { id: "branch", header: "Branş", width: 100 },
    { id: "premium_amount", header: "Prim", width: 100 },
    { id: "error", header: "Hata", width: 200, template: (r: ParsedRow) => <span className="text-red-500 text-xs">{r.error}</span> }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-[900px] h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-semibold text-lg text-gray-800">Toplu Poliçe Yükle</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 flex flex-col">
          {step === 'upload' && (
            <div 
              className="flex-1 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition gap-4"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="bg-blue-100 p-4 rounded-full">
                <FileSpreadsheet size={48} className="text-blue-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-700">Excel veya CSV dosyasını buraya sürükleyin</p>
                <p className="text-sm text-gray-500">veya dosya seçmek için tıklayın</p>
              </div>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".xlsx,.csv" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
               <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
               <div className="text-center">
                   <p className="text-gray-800 font-medium text-lg">Dosya Analiz Ediliyor...</p>
                   <p className="text-gray-500 text-sm mt-1">Lütfen bekleyiniz ({analyzeProgress}%)</p>
                   <div className="mt-4 w-64 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${analyzeProgress}%` }}></div>
                   </div>
               </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-600">Toplam: <b>{rows.length}</b></span>
                  <span className="text-green-600">Geçerli: <b>{rows.filter(r => r.isValid).length}</b></span>
                  <span className="text-red-600">Hatalı: <b>{rows.filter(r => !r.isValid).length}</b></span>
                </div>
                <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={showOnlyErrors} 
                            onChange={(e) => setShowOnlyErrors(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        Sadece Hatalıları Göster
                    </label>
                    <button 
                    onClick={() => { setRows([]); setStep('upload'); }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline ml-2"
                    >
                    Dosyayı Değiştir
                    </button>
                </div>
              </div>

              <div className="flex-1 border rounded-lg overflow-hidden relative">
                 <Willow>
                    <Grid 
                        data={showOnlyErrors ? rows.filter(r => !r.isValid) : rows} 
                        columns={columns} 
                        virtual={true}
                    />
                 </Willow>
              </div>
            </div>
          )}

          {step === 'importing' && (
             <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="w-24 h-24 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="text-center">
                    <h4 className="text-xl font-semibold text-gray-800">İçe Aktarılıyor...</h4>
                    <p className="text-gray-500 mt-2">Lütfen bekleyiniz, veriler sunucuya gönderiliyor.</p>
                    <div className="mt-4 w-64 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
             </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition"
                >
                    İptal
                </button>
                <button 
                    onClick={handleImport}
                    disabled={rows.filter(r => r.isValid).length === 0}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <Upload size={18} />
                    {rows.filter(r => r.isValid).length} Kaydı İçe Aktar
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
