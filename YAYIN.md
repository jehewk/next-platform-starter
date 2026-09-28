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
`aws/panel-yayinla.ps1` bunu engeller.

## Doğrulama

```bash
node test/e2e.mjs        # iki uygulama, sahte API, masaüstü + 390 px
node marka/ikon-uret.mjs # logo değişirse tüm ikonları yeniden üretir
```

`test/e2e.mjs` API Gateway çağrılarını `panel-uretici/test/sahte-api.mjs` ile
yanıtlar (uygulamaya dahil değildir). Giriş formu kaptcha dahil doldurulur;
müşteri oturumunda yalnızca kendi 6 cihazının göründüğü, yeni müşteri, garanti
kararı, destek talebi ve kayıt başvurusunun çalıştığı, JS hatası / taşma /
"NaN" olmadığı denetlenir.

## Web yayını (AWS)

1. S3 kovası + CloudFront dağıtımı oluştur (her uygulama için ayrı). CloudFront'ta
   403 ve 404 hata yanıtlarını `/index.html` (200) olarak ayarla.
2. `.\aws\panel-yayinla.ps1 -Panel panel-musteri -Kova <kova> -DagitimId <id>`

## Backend ayarları (PowerShell)

```powershell
cd aws
.\backend-ayarlari.ps1            # kuru çalışma: neyin eksik olduğunu yazar
.\backend-ayarlari.ps1 -Uygula    # DEVIR §2'deki 4 ayarı uygular
.\kullanici-olustur.ps1 -Eposta teknisyen@dennisenerji.com -Rol uretici
```

**Müşteri düzenleme** için backend'e bir uç eklenmeli:
`aws/ekler/musteri_guncelle.py` içindeki bloğu `lambda_function.py`'ye ekleyip
`.\lambda-yukle.ps1 -Dosya <yol>\lambda_function.py` ile yükleyin (canlı kod önce
yedeklenir, numpy kontrolü yapılır). Eklenene kadar üretici panelinde "Düzenle"
kaydederken sunucu hatası gösterir; diğer her şey mevcut uçlarla çalışır.

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
| 🔴 | `musteri_guncelle` ekini backend'e yüklemek |
| 🔴 | Hesap silme sayfası ve gizlilik politikası (mağaza için zorunlu) |
| 🟡 | Sohbet için dil modeli ucu (`VITE_ASISTAN_YOLU`); şu an kural tabanlı |
| 🟡 | Anlık bildirim (push): "cihaz sustu", "kritik durum" — backend + Firebase/APNs |
| 🟡 | Müşteri rolünün `/de/cihaz/detay`, `/de/cihaz/gecmis`, `/de/musteri/liste` uçlarına erişimi gerçek backend'de doğrulanmalı |
