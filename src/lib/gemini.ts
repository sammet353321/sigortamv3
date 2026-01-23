
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

export const analyzeLicenseWithGemini = async (file: File) => {
  if (!API_KEY) {
    throw new Error("Google Gemini API Key is missing. Please check your .env file.");
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Use gemini-2.0-flash as requested
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Convert file to base64
    const base64Data = await fileToGenerativePart(file);

    const prompt = `
      Bu bir Türk Araç Tescil Belgesi (Ruhsat). Lütfen aşağıdaki bilgileri görselden okuyup JSON formatında çıkar.
      Eğer bir alanı okuyamazsan boş string ("") döndür.
      
      İstenen Alanlar:
      - tc_vkn: TC Kimlik No (11 hane) veya Vergi No (10 hane). Genellikle (C.1) alanında yazar.
      - plaka: Araç Plakası. (A) alanında yazar. (Örn: 34ABC123). Boşlukları kaldır.
      - belge_no: Belge Seri ve Sıra No. (Örn: AB123456). Genellikle sağ altta yazar.
        ÖNEMLİ KURAL: 
        1. İlk iki karakteri (Seri Harfleri) al. (Örn: 'IG', 'AB', 'NA')
        2. Sonraki 6 haneli sayıyı al. (Örn: '030032')
        3. Araya giren 'N', 'No', '№', 'Seri' gibi kelimeleri veya sembolleri SİL.
        4. Sadece HARFLER + RAKAMLAR şeklinde birleştir.
        Örnekler:
        - "Seri: IG No: 030032" -> "IG030032"
        - "NA 123456" -> "NA123456"
        - "AB № 987654" -> "AB987654"
      - sasi_no: Şasi Numarası (VIN). (E) alanında yazar. 17 hanelidir.
      - arac_cinsi: Araç Cinsi. (D.5) alanında yazar. (Örn: OTOMOBİL, KAMYONET).
      - marka: Araç Markası. (D.1) alanında yazar.
      - model: Araç Modeli/Tipi. (D.2) veya (D.3) alanında yazar.

      Yanıt sadece geçerli bir JSON objesi olmalıdır. Markdown kullanma ('\`\`\`json' ekleme).
    `;

    const result = await model.generateContent([prompt, base64Data]);
    const response = await result.response;
    const text = response.text();

    console.log("Gemini Raw Response:", text);

    // Clean up markdown code blocks if present (just in case)
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return JSON.parse(cleanText);
  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    if (error.toString().includes("429")) {
        throw new Error("Günlük tarama limitiniz doldu (Quota Exceeded).");
    }
    throw error;
  }
};

export const analyzePolicyWithGemini = async (file: File) => {
    if (!API_KEY) throw new Error("API Key missing");
    
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const base64Data = await fileToGenerativePart(file);
        
        const prompt = `
            Bu bir Sigorta Poliçesi (PDF veya Görsel). Lütfen aşağıdaki bilgileri çıkar ve JSON döndür:
            
            - sirket: Sigorta Şirketi Adı (Örn: NEOVA, ANADOLU, AXA, BEREKET, vb.)
            - acente: Acente Adı. (Örn: KOÇ SİGORTA, WİN GRUP, TİMURLAR vb.)
            - bitis_tarihi: Poliçe Bitiş Tarihi (En ileri tarih). Format: DD.MM.YYYY (Örn: 24.08.2026).
            - police_no: Poliçe Numarası.
            - brut_prim: Toplam/Brüt Prim Tutarı (Sayısal String, Örn: "19600,48" veya "1000,00").
            - net_prim: Net Prim Tutarı (Vergiler hariç).
            - komisyon: Acente Komisyon Tutarı (Varsa).
            
            Not:
            - Acente adı "KOÇ", "ACAR" içeriyorsa tam adını olduğu gibi al.
            - "WİN" veya "WIN" içeriyorsa "TİMURLAR" olarak al.
            - Tarihleri KESİNLİKLE GG.AA.YYYY formatında döndür (Örn: 24.08.2026). Asla YYYY-MM-DD kullanma.
            - Sayısal değerlerde binlik ayracı kullanma, ondalık ayracı olarak VİRGÜL (,) kullan. (Örn: 15000,50).
            
            Yanıt JSON olmalı. Markdown kullanma.
        `;
        
        const result = await model.generateContent([prompt, base64Data]);
        const response = await result.response;
        const text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(text);
        
    } catch (error: any) {
        console.error("Policy Scan Error:", error);
        throw error;
    }
}

async function fileToGenerativePart(file: File) {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  
  return {
    inlineData: {
      data: await base64EncodedDataPromise as string,
      mimeType: file.type,
    },
  };
}
