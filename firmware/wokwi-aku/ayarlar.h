#pragma once
// ── Cihaza göre değişen ayarlar ─────────────────────────────────────────

// Ölçüm kaynağı: 1 = Wokwi simülatörü (aku_model.h), 0 = gerçek Daly BMS (UART2)
#define KAYNAK_SIMULASYON 1

// Wi-Fi — Wokwi'nin sanal ağı şifresizdir
#define WIFI_SSID   "Wokwi-GUEST"
#define WIFI_SIFRE  ""

// Backend (DEVIR.md §2)
#define API_TABAN   "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"
#define API_YOL     "/de/aku/veri"

// Cihaz kimliği. Cihaz, üretim hattında POST /de/cihaz/uret ile kaydedilir;
// dönen cihaz_id ve anahtar buraya yazılır. dennis-cihazlar tablosunda
// olmayan bir kimlik 403 "Cihaz dogrulanamadi" alır.
// Anahtar yer tutucu olarak kaldıkça firmware paketi yalnızca seri porta basar,
// sunucuya göndermez (kuru çalışma).
#define CIHAZ_ID       "AKU-DENEME-0001"
#define CIHAZ_ANAHTARI "BURAYA-CIHAZ-ANAHTARI"

// Gönderim aralığı. Sahada 10 dakika (DEVIR.md §1). Wokwi'de beklememek için
// 30 sn; simüle saat de SAAT_HIZLANDIRMA kadar hızlı akar, böylece 30 sn'lik
// her gönderim sahadaki ~10 dakikalık değişime karşılık gelir.
#if KAYNAK_SIMULASYON
  #define GONDERIM_ARALIGI_MS  30000UL
  #define SAAT_HIZLANDIRMA     20.0f
#else
  #define GONDERIM_ARALIGI_MS  600000UL
  #define SAAT_HIZLANDIRMA     1.0f
#endif

#define OKUMA_ARALIGI_MS  1000UL   // BMS okuma / iç direnç tahmini
#define AKU_KAPASITE_AH   100.0f

// ── Pinler (diagram.json ile aynı) ──
#define PIN_POT_AKIM      34   // Wokwi: yük / şarj akımı isteği (−60…+60 A)
#define PIN_POT_ORTAM     35   // Wokwi: ortam sıcaklığı (−10…50 °C)
#define PIN_BUTON_ARIZA   25   // Wokwi: hücre 7 arıza senaryosunu aç/kapat
#define PIN_LED_YESIL     26   // son gönderim başarılı
#define PIN_LED_KIRMIZI   27   // son gönderim başarısız
#define PIN_DALY_RX       16   // saha: Daly UART TX → ESP32 RX
#define PIN_DALY_TX       17   // saha: Daly UART RX ← ESP32 TX
