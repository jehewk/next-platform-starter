// Dennis Energy — akü izleme firmware'i (ESP32)
//
// Saniyede bir BMS okunur, GONDERIM_ARALIGI_MS'de bir ölçüm
// POST /de/aku/veri ile backend'e gönderilir (DEVIR.md §4).
//
// Ölçüm kaynağı ayarlar.h'deki KAYNAK_SIMULASYON ile seçilir:
//   1 → Wokwi: 16S LiFePO4 simülatörü; potansiyometreler akım ve ortam
//       sıcaklığını, düğme "hücre 7 ayrışıyor" arıza senaryosunu yönetir
//   0 → saha: Daly BMS, UART2 (GPIO16/17, 9600 baud)
//
// Kütüphane: ArduinoJson 7 (libraries.txt)

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "ayarlar.h"
#include "olcum.h"
#include "paket.h"
#include "direnc.h"
#include "sertifika.h"

#if KAYNAK_SIMULASYON
  #include "aku_model.h"
  AkuSimulator simulator(CIHAZ_ID, AKU_KAPASITE_AH);
#else
  #include "daly_bms.h"
  DalyBms daly(Serial2);
#endif

static const char* SURUM = "de-aku-fw 1.0.0";

AkuOlcum sonOlcum;
DirencTahmini direnc;
uint32_t sonOkuma = 0, sonGonderim = 0, sonDurumSatiri = 0;
uint32_t basarili = 0, basarisiz = 0;
bool anahtarTanimli = false;

static char govde[1536];

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
    // TLS sertifika tarih doğrulaması geçerli saat ister; NTP otursun diye ilk
    // HTTPS'ten ÖNCE beklenir (aksi halde ilk el sıkışma assert ile çöker).
    // backend zamanı yine kendisi damgalar; bu yalnızca TLS için.
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    struct tm zt;
    const uint32_t t0 = millis();
    Serial.print("Saat eşitleniyor");
    while (time(nullptr) < 1700000000UL && millis() - t0 < 12000) {
      Serial.print('.'); delay(300); getLocalTime(&zt, 0);
    }
    Serial.println(time(nullptr) >= 1700000000UL ? " tamam" : " (eşitlenemedi)");
  } else {
    Serial.println(" başarısız, sonraki gönderimde tekrar denenecek");
  }
}

// ── Ölçüm ────────────────────────────────────────────────────────────────

#if KAYNAK_SIMULASYON
float potOku(int pin, float alt, float ust) {
  return alt + (ust - alt) * analogRead(pin) / 4095.0f;
}

void arizaDugmesiniKontrolEt() {
  static bool oncekiBasili = false;
  static uint32_t sonDegisim = 0;
  const bool basili = digitalRead(PIN_BUTON_ARIZA) == LOW;
  if (basili != oncekiBasili && millis() - sonDegisim > 40) {   // basit sıçrama önleme
    sonDegisim = millis();
    oncekiBasili = basili;
    if (basili) {
      simulator.arizaAyarla(!simulator.arizaAcik());
      Serial.printf(">> Arıza senaryosu (hücre 7 ayrışması): %s\n",
                    simulator.arizaAcik() ? "AÇIK" : "KAPALI");
    }
  }
}
#endif

void olcumAl() {
  const uint32_t simdi = millis();
  const float dt = (simdi - sonOkuma) / 1000.0f;
  sonOkuma = simdi;

#if KAYNAK_SIMULASYON
  float akim = potOku(PIN_POT_AKIM, -60.0f, 60.0f);
  if (fabsf(akim) < 3.0f) akim = 0;                // ortada ölü bölge: boşta
  const float ortam = potOku(PIN_POT_ORTAM, -10.0f, 50.0f);
  simulator.adim(dt, akim, ortam, SAAT_HIZLANDIRMA);
  simulator.oku(sonOlcum);
#else
  (void)dt;
  if (!daly.oku(sonOlcum)) {
    Serial.println("Daly BMS yanıt vermedi (kablo / baud / adres kontrol edin)");
    return;
  }
#endif
  direnc.besle(sonOlcum.gerilim, sonOlcum.akim);
}

void durumSatiri() {
  const AkuOlcum& o = sonOlcum;
  if (!o.gecerli) return;
  Serial.printf("SOC %5.1f%%  %6.2f V  %+6.1f A  fark %3d mV  T %d °C  MOS ş:%d d:%d  hata:%d\n",
                o.soc, o.gerilim, o.akim, o.enYuksekMv() - o.enDusukMv(),
                o.enYuksekSicaklik(), o.sarjMos, o.desarjMos, o.hataSayisi);
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
#if KAYNAK_SIMULASYON
  simulator.arizaIlerlet();
#endif
  const float r = direnc.al();

  // Seri porta anahtarsız kopya — hata ayıklarken anahtar günlüğe düşmesin.
  if (paketOlustur(sonOlcum, r, CIHAZ_ID, nullptr, govde, sizeof(govde)))
    Serial.printf("Paket: %s\n", govde);

  if (!anahtarTanimli) {
    Serial.println("Kuru çalışma: ayarlar.h'de CIHAZ_ANAHTARI tanımlı değil, gönderilmedi");
    return -1;
  }
  const size_t n = paketOlustur(sonOlcum, r, CIHAZ_ID, CIHAZ_ANAHTARI, govde, sizeof(govde));
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

  anahtarTanimli = strcmp(CIHAZ_ANAHTARI, "BURAYA-CIHAZ-ANAHTARI") != 0 && strlen(CIHAZ_ANAHTARI) > 0;

  Serial.printf("\n%s · cihaz %s · kaynak: %s · aralık %lu sn\n", SURUM, CIHAZ_ID,
                KAYNAK_SIMULASYON ? "Wokwi simülatörü" : "Daly BMS (UART2)",
                GONDERIM_ARALIGI_MS / 1000);
  Serial.printf("Hedef: %s%s\n", API_TABAN, API_YOL);

#if KAYNAK_SIMULASYON
  pinMode(PIN_BUTON_ARIZA, INPUT_PULLUP);
  Serial.println("Sol pot: akım (orta = boşta)  ·  sağ pot: ortam sıcaklığı  ·  düğme: hücre 7 arızası");
#else
  daly.basla(PIN_DALY_RX, PIN_DALY_TX);
#endif

  wifiBaglan();
  sonOkuma = millis();
  olcumAl();
  // İlk paket, açılıştan birkaç saniye sonra gider (ölçüm otursun).
  sonGonderim = millis() - GONDERIM_ARALIGI_MS + 5000;
}

void loop() {
#if KAYNAK_SIMULASYON
  arizaDugmesiniKontrolEt();
#endif
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
