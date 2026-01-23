# Kurumsal VPN Uyumlu Masaüstü Uygulama Mimarisi

Bu belge, Fortinet gibi kurumsal VPN/Güvenlik duvarı kullanan ortamlarda masaüstü uygulamasının (Electron) sorunsuz çalışması için uygulanan mimariyi açıklar.

## 1. Mimari Genel Bakış (Architecture Overview)

Uygulama, "Hybrid Desktop-Web" mimarisini kullanır.
- **Frontend:** React tabanlı web uygulaması (Bulutta barındırılır).
- **Container:** Electron (Chromium motoru) tabanlı masaüstü kapsayıcı.
- **Network:** Sistem ağ yığını üzerinden tünellenmiş HTTPS trafiği.

### Diyagram
```
[ Kullanıcı Bilgisayarı (Windows) ]
       |
       |-- [ Fortinet VPN Client / Firewall ] <--- (Ağ Trafiğini İzler/Filtreler)
       |
       |-- [ Electron Uygulaması (Bizim App) ]
             |
             |-- [ Chromium Network Stack ]
                   |-- Protokol: HTTPS (TLS 1.2/1.3)
                   |-- QUIC/UDP: KAPALI (Engellemeyi önlemek için)
                   |-- Proxy: Sistem Ayarlarını Kullanır (Auto-Detect)
                   |
                   +---> [ İnternet / Bulut Sunucu ]
```

## 2. Yapılan Kritik Ayarlamalar (Implementation Details)

### A. Ağ Protokolü Optimizasyonu (UDP/QUIC Engelleme)
Fortinet ve kurumsal güvenlik duvarları genellikle UDP trafiğini (QUIC protokolü) veya standart dışı portları engeller. Bu nedenle `electron/main.cjs` dosyasında şu protokoller devre dışı bırakılmıştır:
- `disable-quic`: QUIC protokolünü kapatır, TCP'ye zorlar.
- `disable-http3`: HTTP/3'ü kapatır.

Bu, VPN tüneli içindeki paket kayıplarını ve bağlantı sıfırlamalarını (Connection Reset) engeller.

### B. SSL/TLS ve Sertifika Denetimi (SSL Inspection)
Kurumsal ağlar trafiği izlemek için "SSL Inspection" (Araya girme) yapar. Bu işlem sırasında orijinal sunucu sertifikası yerine, kurumun kendi ürettiği bir sertifika kullanılır.
- **Çözüm:** Electron, Windows Sertifika Deposunu (Windows Trust Store) kullanacak şekilde yapılandırılmıştır.
- **Kullanıcı Etkisi:** Kullanıcının bilgisayarında şirket sertifikası (Root CA) yüklü olduğu sürece uygulama hata vermeden çalışır. Ekstra bir ayar gerekmez.

### C. Barındırma (Hosting) Stratejisi
`*.vercel.app` veya `*.netlify.app` gibi alan adları, kurumsal filtrelerde genellikle "Uncategorized" veya "Personal Hosting" kategorisine girdiği için engellenir.
- **Öneri:** Uygulamayı Cloudflare DNS arkasında, **özel bir alan adı (Custom Domain)** ile yayınlayın (örneğin: `app.sirketiniz.com`).
- **Cloudflare Ayarı:** SSL modunu "Full (Strict)" yapın. Bu, hem güvenliği sağlar hem de kurumsal filtrelere takılma riskini azaltır.

## 3. Kurulum ve Dağıtım

### Geliştirici Tarafı
Uygulama `electron-updater` ile GitHub Releases üzerinden otomatik güncellenir.
Build almak için:
```bash
npm run electron:build
```
Bu komut `dist-electron` klasöründe imzalanmamış bir `.exe` oluşturur.

### Kullanıcı Tarafı
1. Kurulum dosyasını çalıştırır.
2. İlk açılışta web uygulamasının URL'sini girer (Örn: `https://app.sirketiniz.com`).
3. Uygulama bu URL'i yerel konfigürasyona kaydeder ve sonraki açılışlarda hatırlar.
4. VPN açık olsa bile, TCP tabanlı trafik sayesinde kesintisiz çalışır.

## 4. Sorun Giderme (Troubleshooting)

Eğer kullanıcı "Beyaz Ekran" veya "Bağlantı Hatası" alırsa:
1. Sağ üstteki **Çark** ikonuna tıklayıp URL'i kontrol etmelidir.
2. VPN'in "Split Tunneling" ayarlarının Electron uygulamasına izin verip vermediği (nadiren gerekir) kontrol edilebilir, ancak mevcut TCP ayarlarıyla buna gerek kalmamalıdır.
