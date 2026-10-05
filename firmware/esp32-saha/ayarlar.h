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

// BLE
#define BLE_AD            "Dennis-Aku"      // telefonun gorecegi ad
// Nordic UART benzeri özel servis/karakteristik UUID'leri
#define BLE_SERVIS_UUID   "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define BLE_YAZ_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // telefon -> cihaz (WiFi+kod)
#define BLE_BILDIR_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // cihaz -> telefon (durum)

// Gönderim / okuma
#define GONDERIM_ARALIGI_MS  600000UL   // sahada 10 dk
#define OKUMA_ARALIGI_MS     1000UL     // Daly okuma / iç direnç

// Pinler (Daly UART2)
#define PIN_DALY_RX   16   // Daly TX -> ESP32 RX
#define PIN_DALY_TX   17   // Daly RX <- ESP32 TX
#define PIN_LED       2    // dahili LED: kurulum/baglanti durumu
