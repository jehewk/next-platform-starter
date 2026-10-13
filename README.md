# Dennis Energy — Akü/İnverter İzleme Platformu

LiFePO4 akü ve inverterler için uçtan uca izleme sistemi: sahadaki cihaz
(ESP32 + Daly BMS) ölçümleri buluta gönderir, fizik motoru sağlık/arıza
analizini yapar, müşteri ve üretici panelleri gösterir.

## Yapı
- **panel-uretici/** — Üretici paneli (React/Vite): cihaz filosu, garanti,
  arıza kaynağı analizi, asistan.
- **panel-musteri/** — Müşteri uygulaması (React/Vite, PWA + Capacitor):
  izleme, BLE ile "Cihaz Ekle", harita, bildirim.
- **backend/motor/** — Fizik motoru (saf Python): sağlık, yaşlanma, hücre
  dengesizliği, kalan ömür, arıza kaynağı (üretim/kullanım/dış etken).
- **aws/** — Dağıtım ve işletme betikleri (PowerShell): backend/Lambda kurulumu,
  cihaz üretimi/atama, eşleştirme, izleme, güvenlik.
  - `hepsini-kur.ps1` ana dağıtım; diğerleri tekil işler.
- **firmware/** — ESP32 firmware'i (`esp32-saha/` gerçek donanım; `wokwi-*/`
  simülasyon) + Daly BMS okuyucu, BLE provizyon, TLS.
- **test/** — Backend ve fizik motoru testleri (`python3 test/backend/*.py`).
- **codemagic.yaml** — Mac'siz iOS/Android bulut derleme (Capacitor).

## Akış
```
ESP32 (Daly BMS, RS485) → WiFi/TLS → AWS (API Gateway + Lambda + DynamoDB)
   → fizik motoru analizi → müşteri & üretici panelleri
Kurulum: müşteri app "Cihaz Ekle" → BLE ile WiFi + eşleşme kodu
```

## Belgeler
- **YAYIN.md** — dağıtım/yayın notları.
- **BEKLEYENLER.md** — netleşmeyi bekleyen kararlar ve üretim öncesi liste.
- **backend/motor/KALIBRASYON.md** — fizik motoru kalibrasyon takibi.
