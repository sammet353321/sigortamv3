# Yeni Çalışan Paneli ve Poliçe Kesim Sistemi Planı

İstediğiniz kapsamlı değişiklikler için aşağıdaki planı hazırladım:

## 1. Çalışan Dashboard (Ana Sayfa) Yenilemesi
`src/pages/employee/Dashboard.tsx` dosyası tamamen yeniden tasarlanacak:
- **Kaldırılacak:** "Bekleyen İş Havuzu (Genel)" alanı.
- **Eklenecek:**
    - **Performans Kartları:** Günlük/Haftalık/Aylık Satış ve Komisyon Özetleri.
    - **Yaklaşan Yenilemeler Özeti:** Önümüzdeki 3 gün içinde biten poliçelerin kısa listesi.
    - **Son İşlemler:** Sizin tarafınızdan yapılan son teklif ve poliçeler.
    - **Hızlı Erişim:** Poliçe Kes, Teklif Ver gibi hızlı butonlar.

## 2. Yenilemeler Sayfası (Yeni)
`src/pages/employee/Renewals.tsx` oluşturulacak ve sol menüye eklenecek:
- **İşlev:** Bugünden itibaren **14 gün** içinde süresi dolacak olan poliçeleri listeleyecek.
- **Tasarım:** Teklifler/Poliçeler listesine benzer, kolay okunur bir tablo yapısı.
- **Özellik:** Listeden direkt teklif verme veya arama yapma imkanı.

## 3. Poliçe Kesim Ekranı (Sıfırdan)
`src/pages/employee/PolicyCut.tsx` oluşturulacak. Teklifler listesinden bir satıra tıklandığında bu ekran açılacak.
- **Düzen:** İkiye bölünmüş ekran.
    - **Sol Taraf:** Taliye gönderilen **Fiyat Listesi Görseli** (Otomatik gelecek). Eğer yoksa "Belge Yok" yazacak.
    - **Sağ Taraf:** İşlem Formu.
- **Form İçeriği:**
    - **Teklif Bilgileri:** Ad Soyad, TC, Plaka, Belge No vb. (Tali ve Tür hariç düzenlenebilir).
    - **Poliçe Yükleme:** "Yapıştır" butonu ile PDF/Resim yapıştırılacak ve **Otomatik Tarama (OCR)** ile aşağıdaki bilgiler doldurulacak.
    - **Poliçe Bilgileri:** Şirket, Bitiş Tarihi, Primler.
    - **Komisyon Hesaplama:**
        - `T` Butonu: Net Primin %10'unu hesaplar.
        - `K` Butonu: Net Primin %15'ini hesaplar.
    - **Kart Bilgisi & Notlar:** Düzenlenebilir alanlar.

## 4. Altyapı Güncellemeleri
- **Teklif Oluşturma (NewQuote):** Fiyat listesi yapıştırıldığında bu görseli veritabanına (`misafir_bilgi` içine) kaydedecek şekilde güncellenecek. Böylece Poliçe Kesim ekranında sol tarafta otomatik çıkacak.
- **Navigasyon:** Sol menüye "Yenilemeler" eklenecek ve Teklifler listesi tıklama davranışı değiştirilecek.

Bu planı onaylıyorsanız geliştirmeye başlayacağım.