## Genel Not
- "tanzim/tenzim tarihi" olarak policeler/teklifler tablolarındaki `tarih` kolonu esas alınır.
- Hata loglarındaki `net::ERR_ABORTED` için veri çekimi ve hataya dayanıklı istek yönetimi iyileştirilecek.

## Dashboard Ölçümleri
1. Bugün/Bu Ay mevcut hesaplamalar korunur; Bu Yıl ve Toplam kartları eklenir.
2. Sorgular (Admin Dashboard): [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx)
   - Bu Yıl: `gte('tarih', startOfYear)`; teklifler/poliçeler adet + poliçelerden `net_prim` ve `komisyon` toplamı.
   - Toplam: filtre olmadan tüm kayıtlar için adet/toplamlar.
3. State genişletme: `yearQuotes, yearPolicies, yearPremium, yearCommission, totalQuotes, totalPolicies, totalPremium, totalCommission`.
4. Kart yerleşimi: "Bugün", "Bu Ay" altına "Bu Yıl" ve "Toplam" satırları; mevcut `StatCard` ile aynı stil.

## Ekip Alanı (WP Grup Tabanlı)
1. Tali Sayısı: Supabase `chat_groups` içinde `is_whatsapp_group=true` grup sayısı.
2. Aktif Tali: Son 7 günde `messages` tablosunda ilgili `group_id` için en az 1 kayıtı olan grup sayısı.
3. Uygulama: [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx) ekip kartlarında `subAgentsTotal` ve `subAgentsActive` alanları bu yeni mantıkla doldurulur.
   - İlgili tablolar: [whatsapp groups migration](file:///c:/Users/Administrator/Desktop/SİGORTAA/supabase/migrations/20240101000020_whatsapp_groups.sql), [messages migration](file:///c:/Users/Administrator/Desktop/SİGORTAA/supabase/migrations/20240101000011_whatsapp_messages.sql).

## Günlük Aktivite (Düzeltme)
1. Kaynak: `teklifler` tablosundan son 7 gün kayıtlarını `gte('tarih', sevenDaysAgoIso)` ile çek.
2. Gruplama: Client tarafında `YYYY-MM-DD` güne göre sayım; chart veri seti `[{day, date, count}]` oluşturulur.
3. Kod noktası: [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx#L350-L367). Mevcut `monthQuotesData` bağı kırılıp doğrudan son 7 gün verisi kullanılacak.

## Ürün Dağılımı (Top 4 + Diğerleri)
1. Kaynak: Bu ay poliçeleri `monthPoliciesData` üzerinden tür sayımı.
2. Sıralama: İnen sırada `value` ile sort.
3. Render: İlk 4 ürün listelenir; altında "Diğer ürünleri göster" açılır/kapanır kontrolü ile kalanlar.
4. Yüzde: Mevcut `%` hesaplama korunur; daha tutarlı için toplam `monthPolicies` ile normalize edilir.
5. Kod noktası: [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx#L370-L397).

## Aylık Prim Trendi (Gerçek Veri)
1. Kaynak: Son 12 ay `policeler` için `sum(net_prim)`; ay bazlı gruplanır.
2. Uygulama: Client tarafı aggregation (çekim `gte('tarih', twelveMonthsAgoIso)`) veya PostgREST `date_trunc('month', tarih)` ile grup.
3. Chart: Mevcut sütun grafiğine gerçek değerler (K TL) beslenir.
4. Kod noktası: [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx#L400-L421). Hardcoded değerler kaldırılır.

## Personel Performansı Tablosu (Çakışma Düzeltme)
1. Hücre stilleri: `whitespace-nowrap`, `truncate`, `max-w-[...]` ile genişlik kontrolü.
2. Küçük ekranlarda: `overflow-x-auto` zaten var; başlık ve hücre padding dengelenir.
3. Kod noktası: [admin/Dashboard.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx#L426-L469).

## ERR_ABORTED (Supabase İyileştirme)
1. `select`+`count` sorgularını sadeleştir: `select('id', { count: 'exact', head: true })` kullan; `maybeSingle()` kaldır.
2. İstek yönetimi: `AbortController` ekle; her 30 sn refresh öncesi önceki istek cancel edilir.
3. Hata yakalama: `AbortError` ve `error.code===20` loglanmaz; UI düşmez.
4. Gerekirse interval 30sn → 60sn; veya ilk sürümde otomatik refresh kaldırılabilir.
5. Kod noktası: [admin/Dashboard.tsx fetchDashboardData](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Dashboard.tsx#L64-L217).

## Admin Quotes Hizalama (Bu Ay varsayılanı)
1. Arama: plaka + poliçe no; placeholder uyumu.
2. Ay filtresi: Varsayılan "Bu Ay"; toggle ile "Tümü"ne geçiş.
3. Sütun başlığı: "İlgilenen" → "Kesen"; tarih formatı `d MMM yyyy`.
4. Kod noktası ve öneriler: [admin/Quotes.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Quotes.tsx#L90-L123). Arama/filtreden mantık örnekleri hazır.

## Poliçeler Sayfası (Excel Yükleme + Ay Filtresi + Yükleme Animasyonu)
1. Excel Yükleme
   - UI: "Excel Yükle" butonu.
   - Okuma: `xlsx` ile sheet → JSON; kolon eşlemesi (ör. police_no, plaka, tarih, tur, net_prim, komisyon, kesen_id, ilgili_kisi).
   - Dönüşüm: Tarih `dd.MM.yyyy` → ISO, tutarlar `12.345,67` → `12345.67`.
   - Insert: Boş alanlar DB’ye `null`; UI’da `'-'` gösterilir.
   - Hata özeti: Eksik zorunlu alanlar için satır bazlı rapor.
   - Kod noktaları: Admin [Policies.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/admin/Policies.tsx), Personel [Policies.tsx](file:///c:/Users/Administrator/Desktop/SİGORTAA/src/pages/employee/Policies.tsx).
2. Ay Filtresi
   - UI: Ocak–Aralık + "Tümü" select; default: mevcut ay.
   - Sorgu: `gte('tarih', ayBaslangic).lt('tarih', ayBitis)`; sayfa açılışında yalnızca ilgili ay çekilir.
   - Ek: Personel sayfasında tür filtresi `uniqueTypes` ve `filterType` aktif edilir.
3. Yükleme Animasyonu
   - State: `loadingPolicies`/`loadingQuotes` → true/false.
   - UI: Skeleton satırlar veya spinner; tablo fetch bitene kadar göster.
4. Sıralama ve Kolon Dizilimi
   - Sütun sırası "Ad-Soyad"dan "Komisyon"a kadar çalışan sayfalarıyla aynı hale getirilir; Admin ve Personel tablolarında tutarlılık.

## Doğrulama
- Dashboard tüm kartlar veriyle doluyor; ERR_ABORTED konsol logları düşmüyor.
- Ürün dağılımı ilk 4 + diğerleri toggle çalışıyor; yüzde ve adet doğru.
- Günlük Aktivite ve Aylık Prim Trendi gerçek verilere dayanıyor.
- Personel Performansı tablo metinleri taşmıyor/çakışmıyor.
- Poliçeler sayfasında Excel import başarı/hata özeti veriyor; ay filtresi default mevcut ay; yükleme sırasında animasyon görünüyor.

Onay verirseniz bu adımları tek tek uygulayıp, değişiklikleri doğrulayıp size sonuçları göstereceğim.