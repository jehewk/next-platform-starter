#pragma once
// ── Cihaza göre değişen ayarlar ─────────────────────────────────────────

// Ölçüm kaynağı: 1 = Wokwi simülatörü (inverter_model.h), 0 = gerçek inverter
// (Modbus/RS485, saha entegrasyonu henüz yazılmadı — aşağıya bak).
#define KAYNAK_SIMULASYON 1

// Wi-Fi — Wokwi'nin sanal ağı şifresizdir
#define WIFI_SSID   "Wokwi-GUEST"
#define WIFI_SIFRE  ""

// Backend
#define API_TABAN   "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"
#define API_YOL     "/de/inverter/veri"

// Cihaz kimliği. Cihaz üretim hattında POST /de/cihaz/uret ile kaydedilir;
// dönen cihaz_id ve anahtar buraya yazılır. dennis-cihazlar tablosunda
// olmayan bir kimlik 403 "Cihaz dogrulanamadi" alır.
// Anahtar yer tutucu olarak kaldıkça firmware paketi yalnızca seri porta basar,
// sunucuya göndermez (kuru çalışma).
#define CIHAZ_ID       "INV-DENEME-0001"
#define CIHAZ_ANAHTARI "BURAYA-CIHAZ-ANAHTARI"

// Anma gücü (kW) — yük oranı ve ısınma bundan hesaplanır. Gerçek cihazın
// etiket değeriyle değiştir.
#define ANMA_GUC_KW   5.0f

// Gönderim aralığı. Sahada 10 dakika. Wokwi'de beklememek için 30 sn;
// simüle saat de SAAT_HIZLANDIRMA kadar hızlı akar, böylece 30 sn'lik her
// gönderim sahadaki ~10 dakikalık değişime karşılık gelir ve bir "gün"
// birkaç dakikada dolar (günlük kWh sayacını görebilmek için).
#if KAYNAK_SIMULASYON
  #define GONDERIM_ARALIGI_MS  30000UL
  #define SAAT_HIZLANDIRMA     120.0f   // akü firmware'inden hızlı: bir gün ~6 dk
#else
  #define GONDERIM_ARALIGI_MS  600000UL
  #define SAAT_HIZLANDIRMA     1.0f
#endif

#define OKUMA_ARALIGI_MS  1000UL   // ölçüm / kWh entegrasyonu

// ── Pinler (diagram.json ile aynı) ──
#define PIN_POT_YUK       34   // Wokwi: yük oranı (0…%100 anma gücü)
#define PIN_POT_ORTAM     35   // Wokwi: ortam sıcaklığı (−10…50 °C)
#define PIN_BUTON_ARIZA   25   // Wokwi: kondansatör/IGBT yaşlanma senaryosu aç/kapat
#define PIN_LED_YESIL     26   // son gönderim başarılı
#define PIN_LED_KIRMIZI   27   // son gönderim başarısız
