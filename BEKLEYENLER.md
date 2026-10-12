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
3. **E-posta (SES)** — Cognito varsayılanı ~50/gün; gerçek hacim için SES.
   - Betik: `aws/ses-kur.ps1 -Gonderen no-reply@<alan>` (ya da `-Alan`).
   - Kimlik doğrulanınca Cognito > Messaging > Email'den SES'e bağla (konsol).
   - **Sandbox'tan çık** (production access, ~24 sa) — gerçek müşteriye şart.

## Seri üretim öncesi (saha/fabrika)
- **Daly gerçek bataryada doğrulama** — `DALY_HATA_AYIKLA` ile ham çerçeveler.
- **5-10 cihazlık saha pilotu** (birkaç hafta) — kararlılık + motor kalibrasyonu.
- **Fabrika basma istasyonu** — `cihaz-uret.ps1 -AyarlaraYaz` + `yukle.ps1`.
- **iOS native app** (Capacitor) + App Store/Play yayını (Android Chrome hazır).
