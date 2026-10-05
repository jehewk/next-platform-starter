# Saha firmware'i (gerçek ESP32 + Daly BMS + BLE kurulum)

Bu, **gerçek donanım** içindir (Wokwi değil — BLE gerektirir). Akü verisini
gerçek Daly BMS'ten UART ile okur, HTTPS ile AWS'ye gönderir; ilk kurulumda
müşteriye **BLE üzerinden** bağlanır.

`wokwi-aku` Wokwi/simülasyon içindi; bu klasör sahada çalışan sürümdür. Okuma ve
paket kodu (`daly_bms.h`, `olcum.h`, `paket.h`, `direnc.h`, `sertifika.h`) ikisinde
ortaktır.

## Kurulum akışı (BLE eşleştirme)

```
Fabrika: /de/cihaz/uret -> cihaz_id + anahtar  (cihaza flashlanir)
Musteri app "Cihaz Ekle": POST /de/kurulum/basla -> 8 haneli eslesme kodu
Telefon --BLE--> cihaz: {"ssid","sifre","kod"}
Cihaz: WiFi'ye baglan -> POST /de/kurulum/tanit {cihaz_id, anahtar, eslesme_kodu}
       -> backend cihazi o musteriye baglar, durum=aktif
Sonra: her 10 dk Daly oku -> POST /de/aku/veri
```

İki durum:
- **KURULUM** — cihaz bir müşteriye bağlı değil → BLE reklamı açık (ad: `Dennis <cihaz_id>` — her cihaza özgü),
  LED yavaş yanıp söner, telefondan WiFi+kod bekler.
- **İZLEME** — bağlı → LED sabit, ölçüm gönderir. Bağlanma durumu NVS'de saklanır;
  elektrik gidip gelse de tekrar kurulum istemez.

## 1) Fabrika kimliği

Üretim hattında `aws/cihaz-uret.ps1` (ya da `/de/cihaz/uret`) ile bir cihaz üret,
dönen değerleri `ayarlar.h`'ye yaz:
```c
#define CIHAZ_ID       "AKU-..."
#define CIHAZ_ANAHTARI "DEV-..."
```
(Gelişmiş: seri programlama ile NVS'ye yazılıp firmware tek tip kalabilir.)

## 2) Donanım bağlantısı (Daly BMS — RS485)

Daly'nin **RS485** çıkışı kullanılır. Araya bir **MAX485/MAX3485 alıcı-verici**
modülü girer (RS485 yarı çift yöneldir; yön pini gerekir).

| MAX485 modülü | ESP32 | Açıklama |
|---|---|---|
| RO | GPIO16 (RX2) | alınan veri |
| DI | GPIO17 (TX2) | gönderilen veri |
| DE + RE (birleşik) | GPIO4 | **yön**: gönderirken HIGH, dinlerken LOW (firmware yönetir) |
| A / B | Daly RS485 A / B | diferansiyel hat |
| VCC | 3.3V | **3.3V mantıklı modül** kullan (5V modülde RO'ya seviye çevirici gerekir) |
| GND | GND | ortak toprak |

- Baud **9600**. Uzun/gürültülü hatta **A–B arası 120 Ω** sonlandırma direnci.
- DE+RE pinleri modülde birleştirilip tek GPIO'ya (`PIN_DALY_DE`, GPIO4) bağlanır.
  Firmware gönderirken HIGH, bitince (TX boşalınca) LOW yapar — sen uğraşmazsın.
- Daly'nin **düz TTL UART**'ını kullanacaksan RS485 modülü gerekmez; `ayarlar.h`'de
  `PIN_DALY_DE` değerini `-1` yap (yön kontrolü kapanır).
- İlk bağlantıda `daly_bms.h`'de `DALY_HATA_AYIKLA` tanımlayıp ham çerçeveleri kontrol et.

## 3) Derleme (Arduino IDE / PlatformIO)

- Kart: **ESP32 Dev Module** (esp32 Arduino core).
- Kütüphaneler (`libraries.txt`): **ArduinoJson** 7, **NimBLE-Arduino** 1.4.x.
- Dosyalar: `sketch.ino` + tüm `.h`'ler.
- Flash: TLS + BLE birlikte RAM ister; **Partition Scheme: "Huge APP"** (ya da min SPIFFS) seç.

## 4) Çalıştırma / test

İlk açılışta cihaz **KURULUM** modundadır (`Dennis <cihaz_id>` adıyla BLE reklamı; her cihaz benzersiz).

**Müşteri uygulaması tarafı henüz yazılmadıysa**, BLE'yi bir telefon aracıyla
(ör. **nRF Connect**) elle test edebilirsin:
1. Önce bir eşleşme kodu al: müşteri olarak giriş yapıp `POST /de/kurulum/basla`
   çağır (app'te "Cihaz Ekle" bunu yapacak). Dönen `eslesme_kodu`'yu not et.
2. nRF Connect → `Dennis ...` (cihazın kimliği) adlı cihaza bağlan → yazılabilir karakteristiğe
   (`6e400002-...`) şu JSON'u yaz:
   ```json
   {"ssid":"EvWifi","sifre":"parola","kod":"ABCD2345"}
   ```
3. Bildirim karakteristiğinden (`6e400003-...`) durum akışını izle:
   `baglaniyor → wifi → kayit → tamam`. "tamam" gelince cihaz İZLEME'ye geçer,
   seri monitörde `-> 200` ile ölçüm gönderir ve dashboard'da görünür.

**NVS sıfırlama** (yeniden kurulum için): firmware'i `nvs_flash_erase` ile ya da
Arduino "Erase Flash: All" seçeneğiyle sil; cihaz tekrar KURULUM moduna döner.

## BLE sözleşmesi (müşteri uygulaması için)

Müşteri uygulamasının Capacitor/Web Bluetooth ile yapacağı iş:
- Servis `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Yaz** `6e400002-...`: `{"ssid","sifre","kod"}` (UTF-8 JSON)
- **Bildirim** `6e400003-...`: `{"durum": "...", "mesaj": "..."}`

> Not: Bu firmware **cihaz tarafıdır**. Telefon/uygulama tarafındaki BLE gönderimi
> (Web Bluetooth ya da Capacitor BLE eklentisi) ayrı bir iştir; sözleşme yukarıda.
