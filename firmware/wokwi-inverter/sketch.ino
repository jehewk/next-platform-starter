// Dennis Energy — inverter izleme firmware'i (ESP32)
//
// Saniyede bir ölçüm alınır, GONDERIM_ARALIGI_MS'de bir
// POST /de/inverter/veri ile backend'e gönderilir.
//
// Ölçüm kaynağı ayarlar.h'deki KAYNAK_SIMULASYON ile seçilir:
//   1 → Wokwi: LiFePO4 inverter simülatörü; sol pot yük oranını, sağ pot
//       ortam sıcaklığını, düğme kondansatör/IGBT yaşlanma senaryosunu yönetir
//   0 → saha: gerçek inverter (Modbus/RS485 — henüz yazılmadı)
//
// Kütüphane: ArduinoJson 7 (libraries.txt)

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "ayarlar.h"
#include "olcum.h"
#include "paket.h"
#include "sertifika.h"

#if KAYNAK_SIMULASYON
  #include "inverter_model.h"
  InverterSimulator simulator(CIHAZ_ID, ANMA_GUC_KW);
#else
  #error "Saha (gerçek inverter) kaynağı henüz yazılmadı; KAYNAK_SIMULASYON 1 kullanın."
#endif

static const char* SURUM = "de-inverter-fw 1.0.0";

InverterOlcum sonOlcum;
uint32_t sonOkuma = 0, sonGonderim = 0, sonDurumSatiri = 0;
uint32_t basarili = 0, basarisiz = 0;
bool anahtarTanimli = false;

static char govde[1024];

// ── Wi-Fi ve saat ────────────────────────────────────────────────────────

void wifiBaglan() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Wi-Fi: %s bağlanılıyor", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SIFRE);
  const uint32_t bas = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - bas < 20000) {
    delay(250);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" tamam (%s)\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println(" başarısız, sonraki gönderimde tekrar denenecek");
  }
}

// ── Ölçüm ────────────────────────────────────────────────────────────────

float potOku(int pin, float alt, float ust) {
  return alt + (ust - alt) * analogRead(pin) / 4095.0f;
}

void arizaDugmesiniKontrolEt() {
  static bool oncekiBasili = false;
  static uint32_t sonDegisim = 0;
  const bool basili = digitalRead(PIN_BUTON_ARIZA) == LOW;
  if (basili != oncekiBasili && millis() - sonDegisim > 40) {
    sonDegisim = millis();
    oncekiBasili = basili;
    if (basili) {
      simulator.arizaAyarla(!simulator.arizaAcik());
      Serial.printf(">> Arıza senaryosu (kondansatör/IGBT yaşlanması): %s\n",
                    simulator.arizaAcik() ? "AÇIK" : "KAPALI");
    }
  }
}

void olcumAl() {
  const uint32_t simdi = millis();
  const float dt = (simdi - sonOkuma) / 1000.0f;
  sonOkuma = simdi;

  const float yuk = potOku(PIN_POT_YUK, 0.0f, 1.0f);
  const float ortam = potOku(PIN_POT_ORTAM, -10.0f, 50.0f);
  simulator.adim(dt, yuk, ortam, SAAT_HIZLANDIRMA);
  simulator.oku(sonOlcum);
}

void durumSatiri() {
  const InverterOlcum& o = sonOlcum;
  if (!o.gecerli) return;
  Serial.printf("saat %4.1f  %5.2f kW  IGBT %5.1f °C  soğ %5.1f °C  DC %5.1f V  "
                "pf %.2f  THD %4.1f%%  gün %6.2f kWh  hata:%d\n",
                simulator.simSaat(), o.anlik_kw, o.igbt, o.sogutucu, o.dc_gerilim,
                o.guc_faktoru, o.thd, o.gunluk_kwh, o.hataSayisi);
}

// ── Gönderim ─────────────────────────────────────────────────────────────

void ledGoster(bool iyi) {
  digitalWrite(PIN_LED_YESIL, iyi);
  digitalWrite(PIN_LED_KIRMIZI, !iyi);
}

// 1 = gönderildi, 0 = başarısız, -1 = kuru çalışma (anahtar tanımlı değil)
int gonder() {
  if (!sonOlcum.gecerli) {
    Serial.println("Geçerli ölçüm yok, gönderim atlandı");
    return 0;
  }
  simulator.arizaIlerlet();

  // Seri porta anahtarsız kopya — hata ayıklarken anahtar günlüğe düşmesin.
  if (paketOlustur(sonOlcum, CIHAZ_ID, nullptr, govde, sizeof(govde)))
    Serial.printf("Paket: %s\n", govde);

  if (!anahtarTanimli) {
    Serial.println("Kuru çalışma: ayarlar.h'de CIHAZ_ANAHTARI tanımlı değil, gönderilmedi");
    return -1;
  }
  const size_t n = paketOlustur(sonOlcum, CIHAZ_ID, CIHAZ_ANAHTARI, govde, sizeof(govde));
  if (!n) {
    Serial.println("Paket tampona sığmadı");
    return 0;
  }

  wifiBaglan();
  if (WiFi.status() != WL_CONNECTED) return 0;

  WiFiClientSecure istemci;
  istemci.setCACert(KOK_SERTIFIKALAR);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(istemci, API_TABAN API_YOL)) {
    Serial.println("HTTP başlatılamadı");
    return 0;
  }
  http.addHeader("Content-Type", "application/json");
  const int kod = http.POST((uint8_t*)govde, n);
  const String yanit = kod > 0 ? http.getString() : String();
  http.end();

  if (kod >= 200 && kod < 300) {
    Serial.printf("→ %d %s\n", kod, yanit.substring(0, 240).c_str());
    return 1;
  }
  if (kod == 403) {
    Serial.println("→ 403: cihaz doğrulanamadı. CIHAZ_ID ve CIHAZ_ANAHTARI, "
                   "/de/cihaz/uret'in döndürdüğü değerlerle aynı olmalı.");
  } else if (kod > 0) {
    Serial.printf("→ %d %s\n", kod, yanit.substring(0, 240).c_str());
  } else {
    Serial.printf("→ bağlantı hatası: %s\n", HTTPClient::errorToString(kod).c_str());
  }
  return 0;
}

// ── Arduino ──────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_LED_YESIL, OUTPUT);
  pinMode(PIN_LED_KIRMIZI, OUTPUT);
  pinMode(PIN_BUTON_ARIZA, INPUT_PULLUP);

  anahtarTanimli = strcmp(CIHAZ_ANAHTARI, "BURAYA-CIHAZ-ANAHTARI") != 0 && strlen(CIHAZ_ANAHTARI) > 0;

  Serial.printf("\n%s · cihaz %s · anma %.1f kW · aralık %lu sn\n", SURUM, CIHAZ_ID,
                (double)ANMA_GUC_KW, GONDERIM_ARALIGI_MS / 1000);
  Serial.printf("Hedef: %s%s\n", API_TABAN, API_YOL);
  Serial.println("Sol pot: yük oranı  ·  sağ pot: ortam sıcaklığı  ·  düğme: kondansatör/IGBT arızası");

  wifiBaglan();
  sonOkuma = millis();
  olcumAl();
  sonGonderim = millis() - GONDERIM_ARALIGI_MS + 5000;
}

void loop() {
  arizaDugmesiniKontrolEt();
  const uint32_t simdi = millis();

  if (simdi - sonOkuma >= OKUMA_ARALIGI_MS) olcumAl();

  if (simdi - sonDurumSatiri >= 5000) {
    sonDurumSatiri = simdi;
    durumSatiri();
  }

  if (simdi - sonGonderim >= GONDERIM_ARALIGI_MS) {
    sonGonderim = simdi;
    const int sonuc = gonder();
    if (sonuc >= 0) {
      if (sonuc) basarili++; else basarisiz++;
      ledGoster(sonuc == 1);
      Serial.printf("Gönderim: %lu başarılı / %lu başarısız\n", basarili, basarisiz);
    }
  }
  delay(5);
}
