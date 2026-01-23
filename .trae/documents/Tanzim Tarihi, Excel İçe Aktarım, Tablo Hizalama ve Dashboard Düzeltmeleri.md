## Veritabanı
- Teklifler ve Poliçeler tablolarına `tanzim_tarihi DATE NULL` ekle (mevcut `tarih` alanı korunur). Eğer yoksa migration ile ekleyip index’ini hazırlarız.
- Ay filtresi için `bitis_tarihi` zaten mevcut; filtrelemeyi bu alana taşıyacağız (yoksa `tanzim_tarihi`/`tarih`e geri düşer).
- İsteğiniz doğrultusunda tüm `teklifler` ve `policeler` verisini sıfırlamadan önce CSV yedek alıp ardından temizleyeceğiz.

## Excel Yükleme
- Tarih alanı: `tanzim_tarihi` boş bırakılır (NULL); `tarih` veya `bitis_tarihi` yalnızca varsa doldurulur.
- Tutar dönüştürme: "3.525,88" → parse edilip DB’de numerik olarak `3525.88` saklanacak; UI gösterimi "3525,88" (binlik ayırıcı olmadan, virgül ile).
- Çift kontrol: `ad_soyad + police_no + brut_prim` eşleşirse satır üzerine yaz (update), değilse insert; toplu importta satır bazlı kontrol uygulanır.

## Tablo Hizalama
- Yönetici teklifler/poliçeler sayfalarının sütun sırası ve başlıkları, Çalışan sayfasındaki tablo yapısıyla bire bir hale getirilecek (ör. AD SOYAD’dan KOMİSYON’a tutarlı sıralama, ortak formatlar).

## Ay Filtresi
- Ay filtresi `bitis_tarihi`ne göre çalışır; seçilen ay için `gte(ayBaşlangıç) && lt(ayBitiş)` uygulanır; alan yoksa `tanzim_tarihi`/`tarih` fallback.

## Dashboard Düzeltmeleri
- ERR_ABORTED logları: periyodik yenilemeyi 60sn yapıp `AbortController` ile tüm istekleri iptal yönetimi ekli; aborted hatalar loglanmaz.
- Toplam Prim/Komisyon: yalnızca `durum='aktif'` kayıtlar toplanır; negatif değerler hariç tutulur; gösterimde kesir ve virgül formatı düzeltilir.
- Ürün Dağılımı: toplamı `monthPoliciesData.length`; yüzdeler 0–100, iki ondalık; adet bazlı azalan sırada; ilk 4 üstte, “Diğerleri” aç/kapa.

## Personel Performansı
- Hücre stil düzeltmeleri (nowrap/truncate) korunur; ek metrikler eklenir: Dönüşüm Oranı (%), Ay Net Prim ve Ay Komisyon; daha okunaklı başlıklar ve sütun genişlikleri uygulanır.

## Uygulama Adımları
1) Migration yaz: `tanzim_tarihi` ekle, indeksle.
2) Admin/Employee sayfalarda ay filtresini `bitis_tarihi`ne taşı.
3) Excel import mantığını güncelle: tarih/tutar parsing, duplicate update.
4) Admin tablo yapısını çalışan tablo yapısıyla hizala.
5) Dashboard: log yönetimi, prim/komisyon hesapları ve ürün dağılımı düzelt.
6) Son test: sayfa yüklenirken log yok, primler düzgün, yüzdeler 100’e normalize, tablolar hizalı.

Onayınızla bu adımları uygulayıp değişiklikleri doğrulayacağım.