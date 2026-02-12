
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdfParse = require('pdf-parse'); // Use named variable for clarity
const fs = require('fs');

const SYSTEM_PROMPT = `
SYSTEM: You are a production insurance-document parser and policy expert (Turkish). Always respond in Turkish. Output MUST be a single JSON object (no extra text). If confidence < 0.6 include "require_human_review" in actions.

USER: Girdi: bir poliçe/teklif PDF'sinin OCR metni \`document_text\` içinde verilecek. Görev: bu metni otomatik olarak sınıflandır, ilgili ürün tipine (policy_type) göre hangi teminatları, muafiyetleri, limitleri ve özel koşulları kontrol edeceğini tespit et ve yapılandırılmış JSON ile geri döndür. Adımlar ve kurallar:

1) Ürün tipi tespiti:
   - Öncelikle \`policy_type\` alanını otomatik belirle: olası değerler: ["TSS","ÖSS","DASK","KONUT","TRAFİK","KASKO","İŞYERİ","DİĞER"].
   - Eğer kısaltma belirsizse (ör. TSS/ÖSS) en olası açıklamayı ver ve \`detection_confidence\` ekle.

2) Her ürün tipi için kesin olarak **kontrol edilecek alanlar** (PDF içeriğinde mutlaka arayacak):
   - Ortak (her poliçede):
     - Poliçe numarası, başlangıç/bitiş tarihleri, prim tutarı ve para birimi, sigortalı adı, riziko adresi, teminat başlangıç tarihleri, varsa ek/endorsement listesi, iptal koşulları, bekleme süreleri, muafiyet (deductible) ifadeleri, limitler/sublimits, belgeler için gereksinimler, hasar bildirim süresi ve prosedürü, anlaşmalı servis/tedavi listesi, özel istisnalar.
   - TSS (Tamamlayıcı Sağlık Sigortası):
     - SGK uyumu (anlaşmalı hastane listesi), muafiyetler/katılım payları, poliçe limitleri yıllık/limit başı, tetkik/ameliyat/yoğun bakım teminatları, bekleme süreleri, önceden var olan hastalık (pre-existing) hariç tutmaları, refakat/evde bakım, paket / poliçe plan kodu.
   - ÖSS (Özel Sağlık Sigortası):
     - Muayene/ameliyat/ilaç/ayaktan/yatan kapsamı, bekleme süreleri, yıllık limitler, ek teminatlar (kanser, organ nakli), anlaşmalı hastane şartları, prim ödeme frekansı, stop-loss veya yıllık üst limit.
   - DASK:
     - Sigortalı bina bilgisi (ana yapı mı yoksa bağımsız bölüm mü), teminat limitleri (sigorta bedeli), kapsam (depreme bağlı hasarlar), kapsam dışı durumlar (zemin iyileştirme vb.), hasar tazminat süreci, poliçe adresine uygunluk.
   - KONUT:
     - Yapı vs eşyalar ayrımı (bina-insurance vs içindekiler), yangın/sel/hırsızlık/deprem (varsa deprem teminatı ayrı mı), muafiyetler, yeniden inşa/değerleme seçenekleri, kira kaybı/teminatları.
   - TRAFİK:
     - Teminatların üçüncü şahıs bedeni/maddi zarar limitleri, yıllık limit rakamları, sürücü/araç bilgilerinin doğruluğu, kazaya bildirim süresi, TRF için cam/servis/onarım teminatı yok (bunu açıkça atla — trafik poliçesi cam/servis vs karşılamaz).
   - KASKO:
     - Tam kasko kapsamı (çarpma, hırsızlık, yanma, sel, deprem varsa), cam kırılma şartı, parça tipi (orijinal/muadil/anlaşmalı), servis kısıtları (anlaşmalı vs özel), hasarsızlık indirimi/basamak, kilometre/yaş sınırlamaları, kilit/anahtar, çalınma, plaza/kasko özel şartları.
   - İŞYERİ:
     - Bina, emtia, stok, makineler, iş durması (kâr kaybı), hırsızlık, mal-mülk limitleri, tehlikeli faaliyet/yanıcı kimyasal beyanı, sorumluluk teminatları (müşteri/müşteri çalışanlarına karşı), ücretli çalışan ferdi kaza ekleri.

3) Çıktı formatı (zorunlu alanlar):
{
 "policy_type": string,
 "detection_confidence": number (0-1),
 "policy_id": string|null,
 "policy_period": {"start":"YYYY-MM-DD"|null,"end":"YYYY-MM-DD"|null},
 "insured": {"name":string|null,"tax_id":string|null,"address":string|null},
 "premium": {"amount":number|null,"currency":string|null},
 "sum_insured": string|null,
 "coverages": [
   {"code":string|null,"name":string,"included":boolean,"limit":string|null,"deductible":string|null,"waiting_period":string|null,"sublimits":[{"name":string,"amount":string}]|[],"notes":string|null}
 ],
 "product_specific_flags": [string],  // ör. ["preexisting_exclusion","deprem_eklendi","anlasmali_servis_zorunlu"]
 "required_documents": [string],
 "critical_exclusions": [string],
 "recommended_actions": [string], // ör. ["request_additional_docs","clarify_declaration","require_human_review"]
 "raw_extracted_text_snippet": string|null (en az 300 karakter, poliçeyi tanımlayan en kritik pasaj),
 "confidence": number (0-1),
 "customer_message": string, // KISA, kullanıcıya gösterilecek özet
 "employee_message": string  // Çalışana gösterilecek detaylı teknik not
}

4) Özel kurallar / hassas kurallar:
   - Eğer policy_type == "TRAFİK" ise: **mutlaka** cam/servis/onarım teminatlarını **listeleme**; yerine "Trafik sigortası üçüncü şahıs bedeni ve maddi zarar teminatları içerir; cam/servis onarım teminatı yoktur." şeklinde kısa açıklama ekle.
   - Eğer KASKO ise camReplacementType (orijinal/anlaşmalı/muadil) ve servis_restriction (anlaşmalı/özel/tüm) alanlarını çıkart ve coverages içine veya product_specific_flags'e ekle.
   - Sağlık poliçelerinde (TSS/ÖSS) **bekleme süreleri** ve **pre-existing (önceden var olan hastalık)** ifadelerini mutlaka ara ve \`product_specific_flags\` içine ekle.
   - DASK tespit edilirse poliçe adresinin bina kimliği ile uyumunu kontrol et; DASK yalnızca binanın yapısal zararını kapsar — içindekiler genelde DASK kapsamında değildir.
   - Her teminat için eğer limit belirtilmemişse \`limit\`="belirtilmemiş" yaz.
   - Muafiyet/deductible açık değilse \`deductible\`="belirtilmemiş".
   - Eğer poliçe kurulumu/şirket notları özel bir onay gerektiriyorsa \`recommended_actions\` içine "require_human_review" ekle ve confidence düşür (<=0.6).

5) Dil, çıktı ve davranış:
   - Tüm çıktıyı Türkçe ver.
   - Sadece JSON döndür; ekstra doğal dil açıklama istemiyorum.
   - \`confidence\` alanı 0.0–1.0 aralığında olmalı; 0.6 altı -> \`recommended_actions\` içinde "require_human_review".
   - \`raw_extracted_text_snippet\` alanı poliçeyi tanımlayan en açıklayıcı pasajı içermeli (kopya-yonetim için).
   - Eğer ürün tipi "DİĞER" ise: en olası 5 teminat başlığını tahmin et ve \`coverages\` içinde bunları \`included\` = null (belirsiz) ile döndür; ayrıca hangi ek alanların backend tarafından doğrulanması gerektiğini \`required_documents\` olarak yaz.

MODE 1: CHAT / GREETING / GENERAL QUESTIONS
If the user input is a greeting (e.g., "selam", "merhaba"), a general question (e.g., "HDI servis ağı nedir?", "Kasko neleri kapsar?"), or ANY input that is NOT a specific quote/policy document analysis request (including gibberish or random letters like "asdasd"):
Ignore the JSON schema requirement for quotes.
Instead, return a JSON with a single "employee_message" field.
If the input is gibberish/unclear, respond politely asking for clarification.
Example: {"employee_message": "Anlayamadım. Size sigorta poliçeleri, teklif analizleri veya genel sigortacılık konularında yardımcı olabilirim. Lütfen sorunuzu tekrar eder misiniz veya bir dosya yükler misiniz?"}
Do NOT attempt to parse random text as a policy.

MODE 2: QUOTE ANALYSIS
If the user uploads a file or explicitly asks to analyze a specific policy text provided in the input:
Execute the detailed analysis rules below.
`;

let genAI = null;
let model = null;

function initAI(apiKey) {
    if (!apiKey) {
        console.warn('Gemini API Key is missing. AI features will not work.');
        return;
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Using a fast, capable model
}

async function analyzeQuote(textInput, fileBuffer = null) {
    if (!model) {
        throw new Error('AI Model not initialized. Please check GEMINI_API_KEY.');
    }

    let prompt = SYSTEM_PROMPT + "\n\nINPUT:\n";

    if (textInput) {
        prompt += `User Message: ${textInput}\n`;
    }

    let parts = [prompt];

    if (fileBuffer) {
        // If it's a PDF, extract text first
        try {
            // pdf-parse expects a Buffer
            // Convert Uint8Array to Buffer if needed (though Multer gives Buffer)
            const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
            
            const data = await pdfParse(buffer);
            const pdfText = data.text;
            
            // Limit PDF text length to avoid token limits (approx 100k chars)
            const truncatedText = pdfText.substring(0, 100000);
            
            parts.push(`\nPDF Content:\n${truncatedText}`);
        } catch (err) {
            console.error('Error parsing PDF:', err);
            // Fallback: If PDF parsing fails, maybe send to Gemini as image/blob if supported?
            // For now, return a clearer error
            throw new Error(`Failed to parse PDF file: ${err.message}`);
        }
    }

    try {
        const result = await model.generateContent(parts);
        const response = await result.response;
        let text = response.text();
        
        // Cleanup markdown code blocks if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(text);
    } catch (err) {
        console.error('AI Generation Error:', err);
        throw new Error('AI analysis failed.');
    }
}

module.exports = { initAI, analyzeQuote };
