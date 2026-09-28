# Dennis Energy — Uygulamalar ve Yayın Rehberi

İki ayrı uygulama, aynı backend (DEVIR.md §2–§4):

| | Üretici paneli (`panel-uretici/`) | Müşteri uygulaması (`panel-musteri/`) |
|---|---|---|
| Kimin için | Üretim, servis, teknisyen | Ev / işletme sahibi |
| Giriş | Cognito, rol `uretici` / `admin` | Cognito, rol `musteri` (uygulamadan kayıt başvurusu → üretici onayı) |
| İçerik | Filo, harita, arıza öngörüsü, kaynak analizi, garanti kararı, üretim partileri, müşteri yönetimi, başvurular, sohbet | Sistemim (anlık durum), cihazlarım ve sağlıkları, cihaz detayı, sohbet, destek talebi, hesap |
| Veri | Tüm filo | Backend müşteriye süzer; yalnızca kendi cihazları |
| Mağaza kimliği | `com.dennisenerji.uretici` | `com.dennisenerji.musteri` |
| Geliştirme portu | 5173 | 5174 |

Her ikisi de: açılış animasyonu (oturum başına bir kez), siyah tema, DE logosu
(favicon, uygulama ikonu, paylaşım kapağı), telefon uyumlu, tarayıcıdan
kurulabilir (PWA) ve Capacitor ile App Store / Google Play'e hazır.

## Çalıştırma

```bash
cd panel-uretici && cp .env.example .env && npm install && npm run dev   # :5173
cd panel-musteri && cp .env.example .env && npm install && npm run dev   # :5174
```

`.env` olmadan derleme yapılırsa uygulama sessizce boş gelir (DEVIR §13.1);
`aws/panel-yayinla.ps1` `.env`'yi `.env.example`'dan kendisi oluşturur.

## Doğrulama

```bash
node test/e2e.mjs        # iki uygulama, sahte API, masaüstü + 390 px
node marka/ikon-uret.mjs # logo değişirse tüm ikonları yeniden üretir
```

`test/e2e.mjs` API Gateway çağrılarını `test/sahte-api.mjs` ile
yanıtlar (uygulamaya dahil değildir). Giriş formu kaptcha dahil doldurulur;
müşteri oturumunda yalnızca kendi 6 cihazının göründüğü, yeni müşteri, garanti
kararı, destek talebi ve kayıt başvurusunun çalıştığı, JS hatası / taşma /
"NaN" olmadığı denetlenir.

## AWS kurulumu — tek komut

Gerekenler: AWS CLI v2 (`aws sts get-caller-identity` hesap 346532553636'yı
göstermeli), Node.js LTS, Python 3.

```powershell
git clone -b claude/gifted-planck-7dptio https://github.com/jehewk/next-platform-starter.git C:\dennis
cd C:\dennis\aws
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\hepsini-kur.ps1
```

Betik önce ne yapacağını listeler ve onay ister, sonra:

1. **Backend ayarları** (DEVIR §2): tablo ve Cognito izinleri, şifreyle giriş
   akışı, kaptcha anahtarı. Mevcut Lambda ortam değişkenleri korunur.
2. **Müşteri düzenleme ucu**: canlı Lambda kodu indirilir, `/de/musteri/guncelle`
   otomatik eklenir (`ekler/yamala.py`; kod beklenen yapıda değilse hiçbir şeye
   dokunmaz). Canlı kod `aws\yedekler\` altına yedeklenir, zip'teki diğer
   dosyalar korunur. Yüklemeden sonra `/de/kaptcha` ile sağlık kontrolü yapılır;
   geçmezse önceki kod **otomatik** geri yüklenir.
3. **Üretici hesabı**: sorulan e-posta ve şifreyle (kalıcı şifre).
4. **Web yayını** — varsayılan **AWS Amplify Hosting (HTTPS)**: tek Amplify
   uygulamasının iki dalı — müşteri `https://main.<id>.amplifyapp.com`, üretici
   `https://uretici.<id>.amplifyapp.com` (yeni hesaplarda Amplify tek uygulamaya
   izin verir; dallar bu sınıra takılmaz). Alan adı Amplify konsolundan
   (Hosting > Custom domains) ücretsiz sertifikayla bağlanır.

   **Telefonlar neden S3 adresini açmıyor**: S3 web sitesi yalnızca http sunar;
   telefon tarayıcıları (Chrome "Her zaman güvenli bağlantı", Safari) adresi
   https'e çevirir ve bağlantı zaman aşımına uğrar. S3 yöntemi yalnızca
   `-WebYontemi S3Web` ile kullanılır:

   S3 statik web sitesi: her uygulama için bir
   kova, web sitesi barındırma açık, herkese açık okuma (yazma yalnızca sizde),
   `index.html` hem giriş hem hata sayfası (tek sayfa yönlendirme). Adres:
   `http://<kova>.s3-website.eu-central-1.amazonaws.com`, tarayıcıda açılır.

   **Alan adı bağlamak**: S3, kova adının alan adıyla birebir aynı olmasını şart
   koşar. Betiği alan adlarıyla çalıştırın; kovalar bu adlarla açılır ve DNS'e
   eklenecek CNAME kayıtları sonda yazılır:

   ```powershell
   .\hepsini-kur.ps1 -Atla backend,lambda,hesap -MusteriAlan app.dennisenerji.com -UreticiAlan panel.dennisenerji.com
   ```

   Sonraki çalıştırmalarda alan adını tekrar yazmak gerekmez (kurulum-durumu.json).
   Kök alan (`dennisenerji.com`) CNAME alamaz; alt alan kullanın ya da Route 53
   "alias" kaydı açın.

   S3 web sitesi yalnızca **http** sunar: tarayıcı "Güvenli değil" gösterir,
   PWA olarak ana ekrana ekleme ve çevrimdışı önbellek çalışmaz (uygulama çalışır;
   API çağrıları yine https). Mağaza uygulamaları (Capacitor) bundan etkilenmez.
   HTTPS için `-WebYontemi Otomatik` (CloudFront; hesap doğrulanmamışsa
   Amplify, `https://main.<id>.amplifyapp.com`) ya da `CloudFront` / `Amplify`.

   Hesap düzeyinde "Block Public Access" açıksa betik durur ve nasıl
   kapatılacağını yazar.

Tekrar çalıştırmak güvenlidir: var olan hiçbir şey yeniden oluşturulmaz.
Güncelleme yayınlamak için aynı komut ya da yalnızca web adımı:
`.\hepsini-kur.ps1 -Atla backend,lambda,hesap`.

**Kayıt başvurusu "Kayit olusturulamadi" diyorsa**: Cognito hesap açmayı
reddediyordur (asıl neden CloudWatch'ta). `.\kayit-teshis.ps1` nedeni gösterir,
`.\kayit-teshis.ps1 -Duzelt` giderir (kendi kendine kaydı açma, eksik
`custom:musteri_id` özniteliği, istemci okuma/yazma izinleri; önce yedek alır).

**Otomatik onay**: Lambda yaması kayıt başvurusunu anında onaylar (üreticinin
"Onayla" düğmesiyle aynı iş: Cognito hesabı onaylanır, müşteri kaydı onaylı
duruma geçer); müşteri hemen giriş yapar. Onay tamamlanamazsa başvuru Başvurular
sayfasında bekler. Kapatmak için Lambda konsolu > Configuration > Environment
variables > `OTOMATIK_ONAY` = `0` (kod değişikliği gerekmez; CLI ile
`update-function-configuration --environment` TÜM değişkenleri değiştirir,
kullanmayın).

Tekil betikler: `backend-ayarlari.ps1` (kuru çalışma için `-Uygula`'sız),
`lambda-yukle.ps1` (`-GeriYukle <zip>` ile geri dönüş), `kullanici-olustur.ps1`,
`panel-yayinla.ps1`.

Betikler Windows PowerShell 5.1 ve PowerShell 7 ile uyumludur; PowerShell 7'de
sahte bir AWS CLI ile uçtan uca test edildi (ilk kurulum, ikinci çalıştırmada
hiçbir şeyin yeniden oluşturulmaması, bozuk kodda otomatik geri alma,
CloudFront reddinde Amplify'a geçiş).

## Sohbet asistanı (her soruya yanıt)

`aws\asistan-kur.ps1` sohbeti Claude'a bağlar: veri ya da cihaz olmasa da her konuda
yanıt verir, güncel bilgi için web araması yapar, kullanıcının kendi sistem özetini
bilir. Anthropic API anahtarı gerekir (console.anthropic.com > API Keys); betik sorar
(ekranda görünmez), ücretsiz bir çağrıyla doğrular ve Lambda ortamına yazar.

```powershell
.\asistan-kur.ps1                                        # varsayılan: claude-opus-5-5
.\asistan-kur.ps1 -KullaniciGunlukLimit 50 -ToplamGunlukLimit 500
.\asistan-kur.ps1 -AnahtarYenile                         # anahtarı değiştir
```

Maliyet: soru başına ~2-4 cent + web araması başına ~1 cent. Kişi başı (30) ve toplam
(300) günlük soru sınırı vardır; varsayılanlarla en kötü durum ~270 USD/ay. Gerçek
tavan için Anthropic Console > Settings > Limits'ten aylık harcama sınırı koyun.
Daha ucuz model: `-Model claude-sonnet-5-5` (~yarı fiyat) ya da `claude-haiku-4-5`.

## Maliyet koruması

AWS'de kesin bir harcama tavanı yoktur; `aws\maliyet-koruma.ps1` uyarı ve fren
katmanlarını kurar (`-Uygula` olmadan yalnızca rapor verir):

| | Ne yapar |
|---|---|
| Bütçe | Aylık bütçe; %50/%80/%100 ve ay sonu tahmini aşımında e-posta |
| Anomali | Normal dışı harcama artışında günlük e-posta (etkisi ≥ 5 USD) |
| API sınırı | Saniyede en fazla X istek, fazlası 429 |
| Lambda sınırı | Aynı anda en fazla N kopya (yeni hesaplarda hesap sınırı zaten 10) |
| DynamoDB tavanı | İsteğe bağlı tablolarda okuma/yazma tavanı |
| Günlük saklama | Süresiz günlük grupları 30 gün |
| Ölçüm TTL | Ölçümler 180 gün sonra ücretsiz silinir (Lambda yamasıyla) |

Sınırlar cihaz sayısı ve gönderim aralığından, cihaz verisi reddedilmesin diye
paylı hesaplanır. Cihaz sayısı arttıkça tekrar çalıştırın:

```powershell
.\maliyet-koruma.ps1 -CihazSayisi 100 -GonderimSaniye 20 -AylikButce 500 -Uygula
```

Ölçüm TTL'i kapatmak: `-OlcumSaklamaGun 0`. TTL yalnızca bundan sonra yazılan
ölçümleri siler.

## Mağaza yayını (Capacitor)

Her uygulama klasöründe, bir kez:

```bash
npm run build
npx cap add android            # Android Studio gerekir
npx cap add ios                # yalnızca macOS + Xcode
npm run mobil:ikonlar          # marka/cikti/ → tüm ikon ve açılış görselleri
```

Her sürümde: `npm run mobil:hazirla` (derle + kopyala), ardından `npm run android`
veya `npm run ios` ile IDE'de imzalayıp yükleyin.

Mağaza incelemesinden önce:

- **Hesap silme (Apple 5.1.1(v))**: müşteri uygulaması hesap açtırdığı için
  uygulama içinden silme yolu zorunlu. `VITE_HESAP_SILME_URL` ile bir silme talebi
  sayfası verin; Hesabım sayfasında bağlantı görünür.
- **Gizlilik politikası** adresi (iki mağaza da ister) ve veri güvenliği formu:
  toplanan veri e-posta, telefon, adres, cihaz ölçümleri.
- **İnceleme hesabı**: Apple/Google inceleyicisi için onaylı bir müşteri hesabı
  ve bu hesaba bağlı en az bir cihaz.
- **CORS**: backend şu an `*` döndürüyor; daraltılırsa yerel uygulama
  kökenleri `capacitor://localhost` (iOS) ve `https://localhost` (Android)
  izin listesinde olmalı.
- Sürüm numarası: `package.json` `version` + Android `versionCode` / iOS build
  numarası her yüklemede artırılmalı.

## Açık kalanlar

| | İş |
|---|---|
| 🔴 | Hesap silme sayfası ve gizlilik politikası (mağaza için zorunlu) |
| 🟡 | Sohbet için dil modeli ucu (`VITE_ASISTAN_YOLU`); şu an kural tabanlı |
| 🟡 | Anlık bildirim (push): "cihaz sustu", "kritik durum" — backend + Firebase/APNs |
| 🟡 | Müşteri rolünün `/de/cihaz/detay`, `/de/cihaz/gecmis`, `/de/musteri/liste` uçlarına erişimi gerçek backend'de doğrulanmalı |
