# Hata Düzeltme ve İyileştirme Planı

Kullanıcının karşılaştığı `net::ERR_ABORTED` hatası ve ek geliştirme talepleri için aşağıdaki adımları izleyeceğim:

## 1. Hata Analizi ve Çözümü (`net::ERR_ABORTED`)
- **Sorun:** Supabase bağlantısında zaman zaman kopmalar veya sorgu hataları yaşanıyor olabilir.
- **Çözüm:** `loading` durumunu daha güvenli hale getirmek ve `try-catch` bloklarını gözden geçirerek hata mesajlarını daha anlaşılır hale getirmek. Mevcut kodda zaten `loading` hatasını düzelttik, bu ağ hatası geçici olabilir ancak kod tarafında `loading` kontrolünü sağlamlaştırdık.

## 2. Yenilemeler Sayfası İyileştirmesi (`src/pages/employee/Renewals.tsx`)
- **Tablo Yapısı:** `Quotes.tsx` ve `Policies.tsx` sayfalarındaki tablo yapısıyla birebir aynı olacak şekilde güncellenecek (Sütunlar: Ad Soyad, Tarih, Plaka, vb.).
- **Excel Export:** Tablodaki verileri `.csv` olarak indirme butonu eklenecek.
- **Filtreleme:** `searchTerm`'e ek olarak **TÜR** (Trafik, Kasko, vb.) filtrelemesi eklenecek.

## 3. Teklifler ve Poliçeler Sayfaları İyileştirmesi
- **TÜR Filtresi:** `Quotes.tsx` ve `Policies.tsx` sayfalarına, veritabanındaki mevcut türleri dinamik olarak listeleyen ve filtreleyen bir `select` kutusu eklenecek.

## 4. Poliçe Kesim Ekranı Düzenlemeleri (`src/pages/employee/PolicyCut.tsx`)
- **Tarih Formatı:** Doğum tarihi gibi alanların `YYYY-MM-DD` yerine `DD.MM.YYYY` formatında görünmesi sağlanacak.
- **Otomatik Tarama:** Poliçe görseli yapıştırıldığında/yüklendiğinde Gemini AI servisi tetiklenerek otomatik tarama işlemi başlatılacak.
- **Belge İkonu:** Görsel yüklenmediğinde veya önizleme hatası olduğunda şık bir "Dosya" ikonu gösterilecek.
- **Tarih Input:** HTML `date` input'u varsayılan olarak `YYYY-MM-DD` ister, ancak kullanıcıya gösterirken formatlayacağız veya text input + mask kullanacağız. En kolayı `date` input kullanıp, formata dokunmamak (tarayıcı yerel formatı gösterir) ama kullanıcı özellikle metin olarak istiyorsa text input'a çevireceğiz. Kullanıcı "24.08.2002" formatını istediği için text input olarak değiştirmek daha mantıklı.

Bu plan doğrultusunda dosyalarda gerekli güncellemeleri yapacağım.