# Yönetim Paneli Düzeltme ve Geliştirme Planı

Yönetim panelinde tespit edilen hataları gidermek ve istenen yeni özellikleri eklemek için aşağıdaki adımları izleyeceğim.

## 1. Veri Çekme ve Ağ Hatalarının Giderilmesi (Network Errors)
**Sorun:** Dashboard yüklenirken `ERR_ABORTED` hataları alınıyor ve bazı sayaçlar 0 görünüyor.
**Çözüm:**
- `fetchDashboardData` fonksiyonundaki tüm Supabase çağrılarını bağımsız `try-catch` bloklarına alacağım. Böylece bir isteğin başarısız olması diğerlerini etkilemeyecek.
- `head: true` (sadece sayı getirme) kullanılan sorgulardan `.maybeSingle()` ifadesini kaldıracağım. Bu kullanım hatalı sonuçlara veya isteğin iptal edilmesine yol açabiliyor.
- Tarih filtrelerini (`gte`) ve saat dilimi ayarlarını kontrol ederek sorguların doğru zaman aralığını (UTC/Yerel) kapsadığından emin olacağım.

## 2. "Bu Yıl" Bölümünün Eklenmesi ve Panel Yapısı
**İstek:** "Bugün" ve "Bu Ay" kalsın, "Bu Yıl" eklensin. "Bu Ay" içeriği düzeltilsin.
**Yapılacaklar:**
- **Yeni Bölüm:** "Bu Yıl" başlığı altında yeni bir satır eklenecek.
- **Veri:** Yılbaşından (`01-01-YYYY`) bugüne kadar olan:
  - Toplam Teklif Sayısı
  - Toplam Poliçe Sayısı
  - Toplam Prim
  - Toplam Komisyon
- "Bu Ay" verilerinin sadece mevcut ayı kapsadığından emin olunacak (mevcut kod doğru görünüyor ama veri gelmiyor olabilir, sorgu `startOfMonth` değişkeni kontrol edilecek).

## 3. Ekip İstatistikleri (Tali ve Aktiflik)
**İstek:** "Tali Sayısı" -> "WP Grup Sayısı", "Aktif Tali" -> "Son 1 hafta mesaj yazanlar".
**Yapılacaklar:**
- **WP Grup Sayısı:** `users` tablosu yerine `chat_groups` tablosundan toplam grup sayısı çekilecek.
- **Aktif Grup:** `messages` tablosundan son 7 gün içinde mesaj atılmış (`created_at >= 7 gün önce`) benzersiz grup sayısı (`group_id`) hesaplanacak.

## 4. UI/UX Düzenlemeleri
- **Özet Kartları (StatCard):**
  - "6.30..." şeklinde kesilen sayıların tamamının görünmesi için metin boyutu dinamikleştirilecek ve `truncate` kaldırılarak alt satıra geçmesine izin verilecek.
- **Personel Performansı Tablosu:**
  - Yazıların iç içe girmesini önlemek için hücrelere `whitespace-nowrap` eklenecek ve tablo düzeni iyileştirilecek.

## 5. Grafikler ve Görselleştirmeler
- **Ürün Dağılımı:**
  - Toplam sayının 0 görünme sorunu (yüzde hesaplama hatası) düzeltilecek.
  - Liste varsayılan olarak **ilk 4 ürünü** gösterecek.
  - Altına "Tümünü Göster/Gizle" (çentik/ok) butonu eklenecek.
  - Anlamsız yüzdeler (%47400 gibi) düzeltilecek (Bölme işlemi mantığı `adet / toplam` olarak güncellenecek).
- **Aylık Prim Trendi:**
  - Sabit (hardcoded) veriler yerine, son 6 ayın `policeler` verisi çekilerek aylık bazda toplanacak ve grafiğe yansıtılacak.
- **Günlük Aktivite:**
  - Grafiğin boyutu küçültülecek (`h-40` -> daha kompakt).
  - Çubukların aşırı uzaması engellenecek.

## Uygulama Adımları
1.  `Dashboard.tsx` dosyasında veri çekme fonksiyonunu (`fetchDashboardData`) yeniden yapılandır.
2.  Yeni veri setleri için (`yearStats`, `trendStats`, `groupStats`) state tanımla.
3.  Supabase sorgularını güncelle (Yıllık veriler, Grup sayıları, Trend verileri).
4.  UI bileşenlerini (Kartlar, Tablo, Grafikler) revize et.
5.  Test et ve doğrula.
