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
