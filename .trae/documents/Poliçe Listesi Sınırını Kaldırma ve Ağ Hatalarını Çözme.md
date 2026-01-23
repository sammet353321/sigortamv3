# Hata Düzeltme ve İyileştirme Planı

Kullanıcının bildirdiği "Excel aktarım sınırı" ve "Konsol hataları" konularını çözmek için aşağıdaki adımları izleyeceğim.

## 1. Excel/Poliçe Listesi Sınırının Kaldırılması
**Sorun:** Kullanıcı 3500 satırlık Excel yüklediğinde "bütün excel aktarılmamış" diyor.
**Analiz:** Kod incelemesinde, Excel yükleme (upsert) işleminin zaten parçalı (chunk) yapıldığı ve bir sınır olmadığı görüldü. Ancak, yükleme sonrasında listeyi gösteren `fetchPolicies` fonksiyonu Supabase'in varsayılan **1000 satır** sınırına takılıyor. Bu yüzden kullanıcı verilerin eksik yüklendiğini sanıyor.
**Çözüm:**
- `Policies.tsx` dosyasındaki `fetchPolicies` fonksiyonunu güncelleyeceğim.
- Tek seferlik `select` yerine, tüm verileri (örneğin 1000'erli paketler halinde) çekene kadar döngü kuran bir yapı (`fetchAllPolicies`) entegre edeceğim.
- Böylece 3500 veya daha fazla kayıt sorunsuz bir şekilde listede ve Excel çıktısında görünecek.

## 2. Ağ Hatalarının (`ERR_ABORTED`) Giderilmesi
**Sorun:** Dashboard'da sürekli `ERR_ABORTED` hataları görünüyor.
**Analiz:** Bu hatalar genellikle iptal edilen (aborted) isteklerden kaynaklanır. Önceki düzenlemede eklenen `AbortController`, 30 saniyelik yenileme aralığında eski isteği iptal ediyor olabilir.
**Çözüm:**
- `Dashboard.tsx` dosyasındaki `interval` (zamanlayıcı) içindeki `abort()` çağrısını kaldıracağım. Sadece sayfa kapatıldığında (unmount) iptal işlemi yapılacak.
- Bu değişiklik, isteklerin gereksiz yere iptal edilmesini ve konsolda kırmızı hata oluşturmasını önleyecektir.

## Uygulama Adımları
1.  `Policies.tsx`: `fetchPolicies` fonksiyonunu "Tüm veriyi çek" mantığıyla yeniden yaz.
2.  `Dashboard.tsx`: `useEffect` içindeki `abort()` mantığını sadeleştir (sadece unmount'ta çalışsın).
3.  Test ve kontrol.
