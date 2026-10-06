#pragma once
// ── Dennis Energy saha firmware'i (gerçek ESP32 + Daly BMS + BLE kurulum) ──
//
// Bu firmware GERÇEK DONANIM icindir (Wokwi degil; BLE ister). Akis:
//   1. Fabrikada cihaza cihaz_id + anahtar yazilir (uretim hatti, /de/cihaz/uret).
//   2. Musteri uygulamada "Cihaz Ekle" der -> backend 8 haneli eslesme kodu verir.
//   3. Musteri telefonla cihaza BLE ile baglanir, {ssid, sifre, kod} gonderir.
//   4. Cihaz WiFi'ye baglanir, POST /de/kurulum/tanit ile kendini o musteriye
//      baglar; ardindan Daly'yi okuyup POST /de/aku/veri ile olcum gonderir.

// Backend
#define API_TABAN   "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"
#define API_OLCUM   "/de/aku/veri"
#define API_TANIT   "/de/kurulum/tanit"

// ── Fabrika kimligi ──────────────────────────────────────────────────────
// Uretim hattinda /de/cihaz/uret'in dondurdugu degerler buraya yazilir ve
// cihaza flashlanir. (Gelismis: NVS'ye seri programlama ile yazilabilir.)
#define CIHAZ_ID       "AKU-FABRIKA-0001"
#define CIHAZ_ANAHTARI "BURAYA-FABRIKA-ANAHTARI"
#define CIHAZ_TIP      "aku"

// Cihaz tipi / akü
#define AKU_KAPASITE_AH   100.0f

// BLE — her cihaz BENZERSIZ ad yayinlar: "<onek> <cihaz_id>" (or. "Dennis AKU-..-CB10").
// Musteri, cihazin uzerindeki etikette yazan kimlikle eslesen adi secer. Uygulama
// "Dennis" onekiyle suzer. (Reklam adi en fazla ~29 bayt; cihaz_id buna sigar.)
#define BLE_AD_ONEK       "Dennis"
// Nordic UART benzeri özel servis/karakteristik UUID'leri
#define BLE_SERVIS_UUID   "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define BLE_YAZ_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // telefon -> cihaz (WiFi+kod)
#define BLE_BILDIR_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // cihaz -> telefon (durum)

// Gönderim / okuma
#define GONDERIM_ARALIGI_MS  600000UL   // sahada 10 dk
#define OKUMA_ARALIGI_MS     1000UL     // Daly okuma / iç direnç

// ── Daly baglantisi: RS485 (MAX485/MAX3485 alici-verici) ──
// RS485 yari cift yoneldir; bir DE/RE (yon) pini gonderirken HIGH, dinlerken
// LOW olmali. Modulde DE ve RE pinleri birlestirilip tek GPIO'ya baglanir.
// MAX485 modulu:  RO->ESP RX(16),  DI->ESP TX(17),  DE+RE->GPIO(4),
//                 A/B -> Daly RS485 hatti,  GND ortak,  VCC 3.3V (3.3V mantikli modul).
#define PIN_DALY_RX   16   // MAX485 RO  -> ESP32 RX2
#define PIN_DALY_TX   17   // MAX485 DI  <- ESP32 TX2
#define PIN_DALY_DE   4    // MAX485 DE+RE (yon kontrolu); duz TTL UART ise -1 yap
#define PIN_LED       2    // dahili LED: kurulum/baglanti durumu

// ── Paylasimli RS485 hatti (ic hat; baska cihaz da konusuyor olabilir) ──
// Gonder-once-dinle: ESP32 istek gondermeden once hatti bu kadar ms sessiz
// bekler (listen-before-talk) -> paylasimli hatta carpisma azalir. 0 = kapali
// (hatta baska master yoksa gerekmez). Tipik 30-50 ms.
#define HAT_BOS_BEKLE_MS  40
