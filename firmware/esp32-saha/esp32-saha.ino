// Dennis Energy — saha firmware'i (gerçek ESP32 + Daly BMS + BLE kurulum)
//
// Durumlar:
//   KURULUM : cihaz henuz bir musteriye bagli degil -> BLE provizyon acik,
//             telefondan {ssid, sifre, kod} bekler (kurulum.h).
//   IZLEME  : bagli -> Daly okunur, GONDERIM_ARALIGI_MS'de bir POST /de/aku/veri.
//
// Kutuphaneler: NimBLE-Arduino 1.4.x, ArduinoJson 7 (libraries.txt).

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "ayarlar.h"
#include "olcum.h"
#include "paket.h"
#include "direnc.h"
#include "sertifika.h"
#include "daly_bms.h"
#include "kurulum.h"

static const char* SURUM = "de-saha-fw 1.0.0";

Kurulum kurulum;
DalyBms daly(Serial2);
AkuOlcum sonOlcum;
DirencTahmini direnc;
uint32_t sonOkuma = 0, sonGonderim = 0, sonLed = 0;
uint32_t basarili = 0, basarisiz = 0;
bool anahtarTanimli = false;
static char govde[1536];

// ── Ölçüm ──────────────────────────────────────────────────────────────────

void olcumAl() {
  sonOkuma = millis();
  if (!daly.oku(sonOlcum)) {
    Serial.println("Daly BMS yanit vermedi (UART/baud/kablo?).");
    return;
  }
  direnc.besle(sonOlcum.gerilim, sonOlcum.akim);
}

void durumSatiri() {
  const AkuOlcum& o = sonOlcum;
  if (!o.gecerli) return;
  Serial.printf("SOC %5.1f%%  %6.2f V  %+6.1f A  fark %3d mV  T %d C  hata:%d\n",
                o.soc, o.gerilim, o.akim, o.enYuksekMv() - o.enDusukMv(),
                o.enYuksekSicaklik(), o.hataSayisi);
}

// ── Gönderim ────────────────────────────────────────────────────────────────

int gonder() {
  if (!sonOlcum.gecerli) { Serial.println("Gecerli olcum yok."); return 0; }
  const float r = direnc.al();
  const size_t n = paketOlustur(sonOlcum, r, CIHAZ_ID, CIHAZ_ANAHTARI, govde, sizeof(govde));
  if (!n) { Serial.println("Paket sigmadi"); return 0; }
  if (!kurulum.wifiBaglan()) { Serial.println("WiFi yok, gonderilmedi"); return 0; }

  WiFiClientSecure istemci;
  istemci.setCACert(KOK_SERTIFIKALAR);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(istemci, API_TABAN API_OLCUM)) { Serial.println("HTTP baslatilamadi"); return 0; }
  http.addHeader("Content-Type", "application/json");
  const int kod = http.POST((uint8_t*)govde, n);
  const String yanit = kod > 0 ? http.getString() : String();
  http.end();

  if (kod >= 200 && kod < 300) { Serial.printf("-> %d %s\n", kod, yanit.substring(0, 200).c_str()); return 1; }
  if (kod == 403) Serial.println("-> 403: cihaz dogrulanamadi (cihaz_id/anahtar fabrika degeriyle ayni mi?)");
  else if (kod > 0) Serial.printf("-> %d %s\n", kod, yanit.substring(0, 200).c_str());
  else Serial.printf("-> baglanti hatasi: %s\n", HTTPClient::errorToString(kod).c_str());
  return 0;
}

// ── Arduino ──────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_LED, OUTPUT);

  anahtarTanimli = strcmp(CIHAZ_ANAHTARI, "BURAYA-FABRIKA-ANAHTARI") != 0 && strlen(CIHAZ_ANAHTARI) > 0;
  Serial.printf("\n%s · cihaz %s · tip %s\n", SURUM, CIHAZ_ID, CIHAZ_TIP);
  if (!anahtarTanimli)
    Serial.println("UYARI: CIHAZ_ANAHTARI fabrika degeri degil; gonderim/kayit 403 alir.");

  daly.basla(PIN_DALY_RX, PIN_DALY_TX, PIN_DALY_DE);   // RS485 yön pini
  kurulum.basla();

  if (kurulum.musteriyeBagli()) {
    Serial.println("Durum: IZLEME (cihaz bir musteriye bagli).");
    kurulum.wifiBaglan();
    sonOkuma = millis();
    olcumAl();
    sonGonderim = millis() - GONDERIM_ARALIGI_MS + 5000;
  } else {
    Serial.println("Durum: KURULUM (musteriye bagli degil). BLE provizyon aciliyor...");
    kurulum.bleBasla();
  }
}

void loop() {
  const uint32_t simdi = millis();

  // Kurulum modundaysa: telefondan gelen bilgiyi isle; tamamlaninca izlemeye gec
  if (!kurulum.musteriyeBagli()) {
    const int s = kurulum.isle();
    if (s == 1) {                       // yeni baglandi -> izlemeye gec
      sonOkuma = millis(); olcumAl();
      sonGonderim = millis() - GONDERIM_ARALIGI_MS + 3000;
    }
    // Provizyon modunda LED yavaş yanıp söner
    if (simdi - sonLed >= 500) { sonLed = simdi; digitalWrite(PIN_LED, !digitalRead(PIN_LED)); }
    delay(10);
    return;
  }

  // İzleme modu
  digitalWrite(PIN_LED, HIGH);
  if (simdi - sonOkuma >= OKUMA_ARALIGI_MS) olcumAl();
  if (simdi - sonGonderim >= GONDERIM_ARALIGI_MS) {
    sonGonderim = simdi;
    durumSatiri();
    const int sonuc = gonder();
    if (sonuc) basarili++; else basarisiz++;
    Serial.printf("Gonderim: %lu basarili / %lu basarisiz\n", basarili, basarisiz);
  }
  delay(5);
}
