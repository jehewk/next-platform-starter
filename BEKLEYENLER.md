# Bekleyen kararlar / Dennis'ten öğrenilecekler

Bu dosya, netleşmeyi bekleyen (Dennis'ten / sahadan bilgi gelince
uygulanacak) kararları tutar.

## Garanti süresi
- **Durum:** Dennis'ten kesin süre öğrenilecek, sonra güncellenecek.
- **Şu anki değer:** 60 ay (5 yıl), akü ve inverter için aynı.
- **Kodda yeri:** `panel-uretici/src/veri/yardimci.js` →
  `GARANTI_SURESI_AY = { aku: 60, inverter: 60 }`.
- **Nasıl sayılıyor:** cihazın `uretim_tarihi`'nden itibaren.
- **Not:** Panoda bazen "61 ay" görünmesi gerçek politika değil; kalan
  süre gün→ay çevriminde (ay = 30.4 gün) yukarı yuvarlanmasından. Kesin
  süre gelince hem değeri hem gösterimi (tam ay) birlikte düzeltiriz.
- **Yapılacak:** Dennis süreyi söyleyince `GARANTI_SURESI_AY`'ı güncelle
  (akü/inverter farklıysa ayrı ayrı) ve gösterim yuvarlamasını düzelt.

## Üretim öncesi güvenlik/altyapı (lansman-blocker)
1. **AWS IAM** — root anahtarı yerine yönetici IAM kullanıcısı.
   - Betik: `aws/iam-kur.ps1` → kullanıcı + erişim anahtarı üretir.
   - Sonra: `aws configure` ile geç, `aws sts get-caller-identity` doğrula,
     **root erişim anahtarını konsoldan sil.**
2. **Üretim anahtarı** — ✅ GEREK YOK. Sistem her cihaza benzersiz rastgele
   anahtar (`DEV-<guid>`, `cihaz-uret.ps1`) veriyor; paylaşılan sır yok.
3. **E-posta (SES)** — ERTELENDİ: **domain alınınca** yapılacak.
   - Şu an Cognito varsayılan e-postası kullanılıyor (~50/gün, çalışıyor).
   - Tarayıcı şifre kaydı zaten açık (autocomplete doğru) → "şifremi unuttum"a
     nadiren ihtiyaç olur, bu yüzden acil değil.
   - Domain gelince: `aws/ses-kur.ps1 -Alan <alanadi>` (DKIM'li) → Cognito >
     Messaging > Email'den bağla → **sandbox'tan çık** (production access).

4. **Özel domain (alınınca)** — uygulamaları amplifyapp.com yerine kendi
   alan adına taşı (ör. app.<alan>, panel.<alan>): Amplify custom domain +
   DNS kayıtları. API için de istenirse özel alan adı.

## Seri üretim öncesi (saha/fabrika)
> Zaman notu: Daly gerçek veri + fabrika testi ~20 gün sonra planlı (2026-10-13 itibarıyla).
> O güne kadar donanım adımları beklemede; yazılım/platform hazır.
- **Daly gerçek bataryada doğrulama** — `DALY_HATA_AYIKLA` ile ham çerçeveler.
- **5-10 cihazlık saha pilotu** (birkaç hafta) — kararlılık + motor kalibrasyonu.
- **Fabrika basma istasyonu** — `cihaz-uret.ps1 -AyarlaraYaz` + `yukle.ps1`.
- **iOS/Android native app** (Capacitor) — mağaza yayını + iPhone'da BLE.
  - Gerekli: iOS için **Mac + Xcode + Apple Developer** ($99/yıl); Android için
    Google Play hesabı (tek sefer $25). Build bu makinede yapılamaz.
  - `panel-musteri/`'de: `npx cap add ios` / `npx cap add android`, sonra
    `npm run build && npx cap sync`.
  - **BLE izinleri (kurulumun çalışması için şart):**
    - iOS `ios/App/App/Info.plist`:
      `NSBluetoothAlwaysUsageDescription` = "Cihaz kurulumu için Bluetooth
      gerekir." (gerekirse `NSBluetoothPeripheralUsageDescription` de).
    - Android `android/app/src/main/AndroidManifest.xml`:
      `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT`,
      ve Android ≤11 için `ACCESS_FINE_LOCATION`.
  - Xcode'da arşivle → App Store Connect; Android `./gradlew bundleRelease` → Play.
  - **Mac'siz yol (önerilen): Codemagic.** `codemagic.yaml` repo kökünde hazır.
    Adımlar: (1) Apple Developer hesabı aç ($99/yıl), App Store Connect'te
    `com.dennisenerji.musteri` uygulamasını kaydet. (2) codemagic.io → GitHub
    repo'yu bağla. (3) App Store Connect API anahtarını Codemagic'e bağla
    (entegrasyon adı: `dennis_appstore`). (4) "Start build" → IPA → TestFlight.
    BLE izinleri yaml'da otomatik ekleniyor. Mac gerekmez.

- **Garanti gösterimi** — ✅ "61 ay" yuvarlama düzeltildi (kalanGün/30.4 ile
  tutarlı; 60 ay artık 60 görünür). Süre değeri hâlâ Dennis'ten bekleniyor.

- **SoC tutarlılık kontrolü (LiFePO4)** — ✅ motora eklendi
  (`fizik.soc_tutarlilik`): dinlenmede + eğri dizlerinde BMS SoC'sinin
  sürüklenmesini yakalar (aşırı deşarj riski), düz bölgede "doğrulanamaz" der.
  `aku_degerlendir` çıktısında ayrı `soc_kontrol` alanı (sağlık skorunu
  etkilemez). Testler: `test_fizik.py` §10 (8 senaryo).
  - ✅ **Canlıya deploy hazır** — `yamala.py` N yaması gömülü motora
    `soc_tutarlilik`'i + `aku_degerlendir` kancasını (try/except'li, sağlık
    skorunu bozmaz) enjekte eder; idempotent, gömülü değilse güvenle atlanır.
    Komut: `cd C:\dennis\aws; git pull; .\hepsini-kur.ps1 -Atla backend,hesap,web`
    (yalnız lambda adımı — yedekli, `/de/kaptcha` sağlık kontrollü, otomatik
    geri-dönüşlü). Gerçek Daly verisi henüz yok; fabrika testinden önce
    çalıştırmak yeterli.
  - ⏳ (opsiyonel) Panelde `soc_kontrol.durum == surukleme_*` ise
    "BMS kalibrasyonu: tam şarj yapın" rozeti gösterilebilir.

- **Kopuk sensör sahte alarmı** — ✅ düzeltildi + canlıya deploy hazır.
  Daly kopuk sıcaklık sensörünü -40 °C bildiriyor; motor bunu gerçek soğuk
  sanıp "kritik termal" sahte alarmı veriyordu (dogruluk_zor.py buldu).
  `fizik.gecerli_sicakliklar` -40 nöbetçisini ayıklar; `yamala.py` O yaması
  gömülü `aku_degerlendir` girişine aynı ayıklamayı enjekte eder (idempotent,
  try/except'li). Aynı komutla canlıya gider:
  `cd C:\dennis\aws; git pull; .\hepsini-kur.ps1 -Atla backend,hesap,web`
  (SoC yaması N + sensör yaması O birlikte uygulanır, yedekli + sağlık
  kontrollü). Akü yolu canlıda aktif olduğu için fabrika öncesi çalıştırılmalı.
