// Dennis Energy — akü firmware'i, TEK DOSYA (Wokwi DALY emülatör testi için).
//
// Bu dosya, wokwi-aku'daki ayri .h dosyalarinin HEPSININ birlestirilmis halidir;
// davranis birebir aynidir. Amac Wokwi'de tek tek dosya yapistirmak yerine tek
// metni yapistirmak. KAYNAK_SIMULASYON 0 (gercek DALY yolu) ve 30 sn gonderim
// ONCEDEN ayarli. Yalniz asagidaki CIHAZ_ID + CIHAZ_ANAHTARI'ni degistir.
//
// Wokwi projesine gereken 4 dosya:
//   1) bu dosya            -> sketch.ino
//   2) saha-daly/diagram.json
//   3) saha-daly/daly.chip.json
//   4) saha-daly/daly.chip.c

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <ArduinoJson.h>
#include <math.h>
#include <stdint.h>
#include <string.h>

// ══════════════════ AYARLAR ══════════════════

#define WIFI_SSID   "Wokwi-GUEST"
#define WIFI_SIFRE  ""

#define API_TABAN   "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"
#define API_YOL     "/de/aku/veri"

// ↓↓↓ cihaz-uret.ps1'in bastigi degerlerle DEGISTIR ↓↓↓
#define CIHAZ_ID       "AKU-DENEME-0001"
#define CIHAZ_ANAHTARI "BURAYA-CIHAZ-ANAHTARI"
// ↑↑↑ degistirilmezse firmware KURU CALISIR (gondermez, sadece seri porta basar)

#define GONDERIM_ARALIGI_MS  30000UL    // Wokwi testi; sahada 600000 (10 dk)
#define OKUMA_ARALIGI_MS     1000UL
#define AKU_KAPASITE_AH      100.0f

#define PIN_LED_YESIL     26
#define PIN_LED_KIRMIZI   27
#define PIN_DALY_RX       16   // Daly (emülatör çip) TX → ESP32 RX
#define PIN_DALY_TX       17   // Daly RX ← ESP32 TX

// ══════════════════ OLCUM ══════════════════

#define EN_FAZLA_HUCRE     24
#define EN_FAZLA_SICAKLIK  8
#define EN_FAZLA_HATA      8
#define SENSOR_BAGLI_DEGIL (-40)

enum HataSeviye : uint8_t { SEVIYE_BILGI, SEVIYE_UYARI, SEVIYE_KRITIK };

struct HataKodu { const char* kod; const char* mesaj; HataSeviye seviye; };

struct AkuOlcum {
  float    gerilim = 0;
  float    akim = 0;
  float    soc = 0;
  uint32_t cevrim = 0;
  uint8_t  hucreSayisi = 0;
  uint16_t hucreMv[EN_FAZLA_HUCRE] = {};
  uint8_t  sicaklikSayisi = 0;
  int16_t  sicaklik[EN_FAZLA_SICAKLIK] = {};
  bool     sarjMos = true;
  bool     desarjMos = true;
  uint8_t  hataSayisi = 0;
  HataKodu hatalar[EN_FAZLA_HATA] = {};
  bool     gecerli = false;

  void hataEkle(const char* kod, const char* mesaj, HataSeviye s) {
    for (uint8_t i = 0; i < hataSayisi; i++) {
      if (strcmp(hatalar[i].kod, kod) == 0) {
        if (s > hatalar[i].seviye) hatalar[i] = {kod, mesaj, s};
        return;
      }
    }
    if (hataSayisi < EN_FAZLA_HATA) hatalar[hataSayisi++] = {kod, mesaj, s};
  }
  uint16_t enYuksekMv() const {
    uint16_t m = 0;
    for (uint8_t i = 0; i < hucreSayisi; i++) if (hucreMv[i] > m) m = hucreMv[i];
    return m;
  }
  uint16_t enDusukMv() const {
    uint16_t m = 0xFFFF;
    for (uint8_t i = 0; i < hucreSayisi; i++) if (hucreMv[i] < m) m = hucreMv[i];
    return hucreSayisi ? m : 0;
  }
  int16_t enYuksekSicaklik() const {
    int16_t m = SENSOR_BAGLI_DEGIL;
    for (uint8_t i = 0; i < sicaklikSayisi; i++) if (sicaklik[i] > m) m = sicaklik[i];
    return m;
  }
};

#define HUCRE_FARK_UYARI_MV   80
#define HUCRE_FARK_KRITIK_MV  150
#define SICAKLIK_UYARI_C      45

inline void ortakUyarilariEkle(AkuOlcum& o) {
  if (o.hucreSayisi > 1) {
    const int fark = o.enYuksekMv() - o.enDusukMv();
    if (fark >= HUCRE_FARK_KRITIK_MV)
      o.hataEkle("H01", "Hücre gerilim farkı kritik seviyede", SEVIYE_KRITIK);
    else if (fark >= HUCRE_FARK_UYARI_MV)
      o.hataEkle("H01", "Hücre gerilim farkı eşik üzerinde", SEVIYE_UYARI);
  }
  if (o.enYuksekSicaklik() >= SICAKLIK_UYARI_C)
    o.hataEkle("T01", "Paket sıcaklığı yüksek", SEVIYE_UYARI);
}

// ══════════════════ IC DIRENC TAHMINI ══════════════════

class DirencTahmini {
 public:
  static constexpr float ADIM_A = 10.0f;
  static constexpr float EN_AZ_OHM = 0.001f;
  static constexpr float EN_COK_OHM = 0.5f;

  void besle(float gerilim, float akim) {
    if (onceki_) {
      const float dI = akim - oncekiI_;
      if (fabsf(dI) >= ADIM_A) {
        const float r = fabsf((gerilim - oncekiV_) / dI);
        if (r >= EN_AZ_OHM && r <= EN_COK_OHM) {
          ornek_[yaz_] = r;
          yaz_ = (yaz_ + 1) % N;
          if (adet_ < N) adet_++;
          taze_ = true;
        }
      }
    }
    oncekiV_ = gerilim; oncekiI_ = akim; onceki_ = true;
  }
  float al() {
    if (!taze_ || adet_ == 0) return 0;
    taze_ = false;
    const uint8_t n = adet_;
    float d[N];
    for (uint8_t i = 0; i < n; i++) d[i] = ornek_[i];
    for (uint8_t i = 1; i < n; i++)
      for (uint8_t j = i; j > 0 && d[j - 1] > d[j]; j--) { float t = d[j]; d[j] = d[j - 1]; d[j - 1] = t; }
    return n % 2 ? d[n / 2] : 0.5f * (d[n / 2 - 1] + d[n / 2]);
  }
 private:
  static const uint8_t N = 5;
  float ornek_[N] = {};
  uint8_t yaz_ = 0, adet_ = 0;
  bool taze_ = false, onceki_ = false;
  float oncekiV_ = 0, oncekiI_ = 0;
};

// ══════════════════ SERTIFIKA (Amazon Root CA 1 + Starfield G2) ══════════════════

static const char KOK_SERTIFIKALAR[] =
"-----BEGIN CERTIFICATE-----\n"
"MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n"
"ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n"
"b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n"
"MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n"
"b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n"
"ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n"
"9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n"
"IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n"
"VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n"
"93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n"
"jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n"
"AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n"
"A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n"
"U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n"
"N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n"
"o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n"
"5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n"
"rqXRfboQnoZsG4q5WTP468SQvvG5\n"
"-----END CERTIFICATE-----\n"
"-----BEGIN CERTIFICATE-----\n"
"MIID7zCCAtegAwIBAgIBADANBgkqhkiG9w0BAQsFADCBmDELMAkGA1UEBhMCVVMx\n"
"EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxJTAjBgNVBAoT\n"
"HFN0YXJmaWVsZCBUZWNobm9sb2dpZXMsIEluYy4xOzA5BgNVBAMTMlN0YXJmaWVs\n"
"ZCBTZXJ2aWNlcyBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAtIEcyMB4XDTA5\n"
"MDkwMTAwMDAwMFoXDTM3MTIzMTIzNTk1OVowgZgxCzAJBgNVBAYTAlVTMRAwDgYD\n"
"VQQIEwdBcml6b25hMRMwEQYDVQQHEwpTY290dHNkYWxlMSUwIwYDVQQKExxTdGFy\n"
"ZmllbGQgVGVjaG5vbG9naWVzLCBJbmMuMTswOQYDVQQDEzJTdGFyZmllbGQgU2Vy\n"
"dmljZXMgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgLSBHMjCCASIwDQYJKoZI\n"
"hvcNAQEBBQADggEPADCCAQoCggEBANUMOsQq+U7i9b4Zl1+OiFOxHz/Lz58gE20p\n"
"OsgPfTz3a3Y4Y9k2YKibXlwAgLIvWX/2h/klQ4bnaRtSmpDhcePYLQ1Ob/bISdm2\n"
"8xpWriu2dBTrz/sm4xq6HZYuajtYlIlHVv8loJNwU4PahHQUw2eeBGg6345AWh1K\n"
"Ts9DkTvnVtYAcMtS7nt9rjrnvDH5RfbCYM8TWQIrgMw0R9+53pBlbQLPLJGmpufe\n"
"hRhJfGZOozptqbXuNC66DQO4M99H67FrjSXZm86B0UVGMpZwh94CDklDhbZsc7tk\n"
"6mFBrMnUVN+HL8cisibMn1lUaJ/8viovxFUcdUBgF4UCVTmLfwUCAwEAAaNCMEAw\n"
"DwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFJxfAN+q\n"
"AdcwKziIorhtSpzyEZGDMA0GCSqGSIb3DQEBCwUAA4IBAQBLNqaEd2ndOxmfZyMI\n"
"bw5hyf2E3F/YNoHN2BtBLZ9g3ccaaNnRbobhiCPPE95Dz+I0swSdHynVv/heyNXB\n"
"ve6SbzJ08pGCL72CQnqtKrcgfU28elUSwhXqvfdqlS5sdJ/PHLTyxQGjhdByPq1z\n"
"qwubdQxtRbeOlKyWN7Wg0I8VRw7j6IPdj/3vQQF3zCepYoUz8jcI73HPdwbeyBkd\n"
"iEDPfUYd/x7H4c7/I9vG+o1VTqkC50cRRj70/b17KSa7qWFiNyi2LSr2EIZkyXCn\n"
"0q23KXB56jzaYyWf/Wi3MOxw+3WKt21gZ7IeyLnp2KhvAotnDU0mV3HaIPzBSlCN\n"
"sSi6\n"
"-----END CERTIFICATE-----\n"
;

// ══════════════════ PAKET ══════════════════

static const char* seviyeAdi(HataSeviye s) {
  switch (s) {
    case SEVIYE_KRITIK: return "kritik";
    case SEVIYE_UYARI:  return "uyari";
    default:            return "bilgi";
  }
}

inline size_t paketOlustur(const AkuOlcum& o, float icDirencOhm,
                           const char* cihazId, const char* anahtar,
                           char* cikti, size_t boyut) {
  JsonDocument d;
  d["cihaz_id"] = cihazId;
  if (anahtar) d["anahtar"] = anahtar;
  d["gerilim"] = o.gerilim;
  d["akim"] = o.akim;
  d["soc"] = o.soc;
  d["cevrim"] = o.cevrim;
  JsonArray h = d["hucreler"].to<JsonArray>();
  for (uint8_t i = 0; i < o.hucreSayisi; i++) h.add(o.hucreMv[i]);
  JsonArray t = d["sicakliklar"].to<JsonArray>();
  for (uint8_t i = 0; i < o.sicaklikSayisi; i++) t.add(o.sicaklik[i]);
  d["sarj_mos"] = o.sarjMos;
  d["desarj_mos"] = o.desarjMos;
  JsonArray e = d["hata_kodlari"].to<JsonArray>();
  for (uint8_t i = 0; i < o.hataSayisi; i++) {
    JsonObject k = e.add<JsonObject>();
    k["kod"] = o.hatalar[i].kod;
    k["mesaj"] = o.hatalar[i].mesaj;
    k["seviye"] = seviyeAdi(o.hatalar[i].seviye);
  }
  if (icDirencOhm > 0) d["ic_direnc"] = roundf(icDirencOhm * 1e5f) / 1e5f;
  if (d.overflowed()) return 0;
  const size_t n = serializeJson(d, cikti, boyut);
  return n < boyut ? n : 0;
}

// ══════════════════ DALY BMS OKUYUCU ══════════════════

class DalyBms {
 public:
  explicit DalyBms(HardwareSerial& port) : port_(port) {}
  void basla(int rxPin, int txPin) { port_.begin(9600, SERIAL_8N1, rxPin, txPin); }

  bool oku(AkuOlcum& o) {
    o = AkuOlcum();
    uint8_t v[8];
    if (!sor(0x90, v)) return false;
    o.gerilim = u16(v, 0) / 10.0f;
    o.akim = ((int32_t)u16(v, 4) - 30000) / 10.0f;
    o.soc = u16(v, 6) / 10.0f;
    if (!sor(0x93, v)) return false;
    o.sarjMos = v[1] != 0;
    o.desarjMos = v[2] != 0;
    if (!sor(0x94, v)) return false;
    o.hucreSayisi = v[0] < EN_FAZLA_HUCRE ? v[0] : EN_FAZLA_HUCRE;
    o.sicaklikSayisi = v[1] < EN_FAZLA_SICAKLIK ? v[1] : EN_FAZLA_SICAKLIK;
    o.cevrim = u16(v, 5);
    if (!hucreleriOku(o)) return false;
    sicakliklariOku(o);
    arizalariOku(o);
    ortakUyarilariEkle(o);
    o.gecerli = true;
    return true;
  }
 private:
  static uint16_t u16(const uint8_t* v, int i) { return (uint16_t)(v[i] << 8 | v[i + 1]); }
  void gonder(uint8_t komut) {
    uint8_t c[13] = {0xA5, 0x40, komut, 0x08};
    uint8_t toplam = 0;
    for (int i = 0; i < 12; i++) toplam += c[i];
    c[12] = toplam;
    while (port_.available()) port_.read();
    port_.write(c, sizeof(c));
  }
  bool cerceveAl(uint8_t komut, uint8_t* veri, uint32_t zamanAsimiMs = 120) {
    uint8_t c[13]; uint8_t n = 0;
    const uint32_t bas = millis();
    while (millis() - bas < zamanAsimiMs) {
      if (!port_.available()) { delay(1); continue; }
      const uint8_t b = port_.read();
      if (n == 0 && b != 0xA5) continue;
      c[n++] = b;
      if (n < 13) continue;
      uint8_t toplam = 0;
      for (int i = 0; i < 12; i++) toplam += c[i];
      if (toplam == c[12] && c[2] == komut && c[3] == 0x08) { memcpy(veri, c + 4, 8); return true; }
      n = 0;
    }
    return false;
  }
  bool sor(uint8_t komut, uint8_t* veri) {
    for (int deneme = 0; deneme < 2; deneme++) { gonder(komut); if (cerceveAl(komut, veri)) return true; }
    return false;
  }
  bool hucreleriOku(AkuOlcum& o) {
    const uint8_t cerceve = (o.hucreSayisi + 2) / 3;
    gonder(0x95);
    uint8_t v[8]; uint8_t alinan = 0;
    for (uint8_t k = 0; k < cerceve; k++) {
      if (!cerceveAl(0x95, v, 200)) break;
      const uint8_t no = v[0];
      for (uint8_t j = 0; j < 3; j++) {
        const int h = (no - 1) * 3 + j;
        if (no >= 1 && h < o.hucreSayisi) { o.hucreMv[h] = u16(v, 1 + j * 2); alinan++; }
      }
    }
    return alinan == o.hucreSayisi;
  }
  void sicakliklariOku(AkuOlcum& o) {
    if (!o.sicaklikSayisi) return;
    const uint8_t cerceve = (o.sicaklikSayisi + 6) / 7;
    gonder(0x96);
    uint8_t v[8];
    for (uint8_t k = 0; k < cerceve; k++) {
      if (!cerceveAl(0x96, v, 200)) { o.sicaklikSayisi = 0; return; }
      const uint8_t no = v[0];
      for (uint8_t j = 0; j < 7; j++) {
        const int s = (no - 1) * 7 + j;
        if (no >= 1 && s < o.sicaklikSayisi) o.sicaklik[s] = (int16_t)v[1 + j] - 40;
      }
    }
  }
  void arizalariOku(AkuOlcum& o) {
    uint8_t v[8];
    if (!sor(0x98, v)) return;
    struct Bit { uint8_t bayt, bit; const char* kod; const char* mesaj; HataSeviye s; };
    static const Bit TABLO[] = {
      {0, 1, "H02", "Hücre aşırı gerilim — koruma devrede",   SEVIYE_KRITIK},
      {0, 0, "H02", "Hücre gerilimi yüksek",                   SEVIYE_UYARI},
      {0, 3, "H03", "Hücre düşük gerilim — koruma devrede",   SEVIYE_KRITIK},
      {0, 2, "H03", "Hücre gerilimi düşük",                    SEVIYE_UYARI},
      {1, 1, "T02", "Şarjda aşırı sıcaklık — koruma devrede", SEVIYE_KRITIK},
      {1, 3, "T03", "Düşük sıcaklıkta şarj engellendi",       SEVIYE_UYARI},
      {1, 5, "T02", "Deşarjda aşırı sıcaklık — koruma devrede", SEVIYE_KRITIK},
      {2, 1, "A01", "Şarj aşırı akım — koruma devrede",       SEVIYE_KRITIK},
      {2, 3, "A02", "Deşarj aşırı akım — koruma devrede",     SEVIYE_KRITIK},
      {3, 1, "H01", "BMS: hücre farkı koruma seviyesinde",    SEVIYE_KRITIK},
      {3, 3, "T04", "Sensörler arası sıcaklık farkı yüksek",  SEVIYE_UYARI},
    };
    for (const Bit& b : TABLO)
      if (v[b.bayt] & (1 << b.bit)) o.hataEkle(b.kod, b.mesaj, b.s);
    for (uint8_t bayt = 4; bayt <= 6; bayt++)
      if (v[bayt]) { o.hataEkle("B01", "BMS donanım arızası bildirdi", SEVIYE_KRITIK); break; }
  }
  HardwareSerial& port_;
};

// ══════════════════ ANA PROGRAM ══════════════════

static const char* SURUM = "de-aku-fw 1.0.0 (tek-dosya/DALY)";

DalyBms daly(Serial2);
AkuOlcum sonOlcum;
DirencTahmini direnc;
uint32_t sonOkuma = 0, sonGonderim = 0, sonDurumSatiri = 0;
uint32_t basarili = 0, basarisiz = 0;
bool anahtarTanimli = false;
static char govde[1536];

void wifiBaglan() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Wi-Fi: %s bağlanılıyor", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SIFRE);
  const uint32_t bas = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - bas < 20000) { delay(250); Serial.print('.'); }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" tamam (%s)\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println(" başarısız, sonraki gönderimde tekrar denenecek");
  }
}

void olcumAl() {
  sonOkuma = millis();
  if (!daly.oku(sonOlcum)) {
    Serial.println("Daly BMS yanıt vermedi (çip/diagram bağlantısı?).");
    return;
  }
  direnc.besle(sonOlcum.gerilim, sonOlcum.akim);
}

void durumSatiri() {
  const AkuOlcum& o = sonOlcum;
  if (!o.gecerli) return;
  Serial.printf("SOC %5.1f%%  %6.2f V  %+6.1f A  fark %3d mV  T %d °C  MOS ş:%d d:%d  hata:%d\n",
                o.soc, o.gerilim, o.akim, o.enYuksekMv() - o.enDusukMv(),
                o.enYuksekSicaklik(), o.sarjMos, o.desarjMos, o.hataSayisi);
}

void ledGoster(bool iyi) { digitalWrite(PIN_LED_YESIL, iyi); digitalWrite(PIN_LED_KIRMIZI, !iyi); }

int gonder() {
  if (!sonOlcum.gecerli) { Serial.println("Geçerli ölçüm yok, gönderim atlandı"); return 0; }
  const float r = direnc.al();
  if (paketOlustur(sonOlcum, r, CIHAZ_ID, nullptr, govde, sizeof(govde)))
    Serial.printf("Paket: %s\n", govde);
  if (!anahtarTanimli) {
    Serial.println("Kuru çalışma: CIHAZ_ANAHTARI tanımlı değil, gönderilmedi");
    return -1;
  }
  const size_t n = paketOlustur(sonOlcum, r, CIHAZ_ID, CIHAZ_ANAHTARI, govde, sizeof(govde));
  if (!n) { Serial.println("Paket tampona sığmadı"); return 0; }
  wifiBaglan();
  if (WiFi.status() != WL_CONNECTED) return 0;
  WiFiClientSecure istemci;
  istemci.setCACert(KOK_SERTIFIKALAR);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(istemci, API_TABAN API_YOL)) { Serial.println("HTTP başlatılamadı"); return 0; }
  http.addHeader("Content-Type", "application/json");
  const int kod = http.POST((uint8_t*)govde, n);
  const String yanit = kod > 0 ? http.getString() : String();
  http.end();
  if (kod >= 200 && kod < 300) { Serial.printf("→ %d %s\n", kod, yanit.substring(0, 240).c_str()); return 1; }
  if (kod == 403) {
    Serial.println("→ 403: cihaz doğrulanamadı. CIHAZ_ID ve CIHAZ_ANAHTARI, "
                   "cihaz-uret.ps1'in verdiğiyle aynı olmalı.");
  } else if (kod > 0) {
    Serial.printf("→ %d %s\n", kod, yanit.substring(0, 240).c_str());
  } else {
    Serial.printf("→ bağlantı hatası: %s\n", HTTPClient::errorToString(kod).c_str());
  }
  return 0;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_LED_YESIL, OUTPUT);
  pinMode(PIN_LED_KIRMIZI, OUTPUT);
  anahtarTanimli = strcmp(CIHAZ_ANAHTARI, "BURAYA-CIHAZ-ANAHTARI") != 0 && strlen(CIHAZ_ANAHTARI) > 0;
  Serial.printf("\n%s · cihaz %s · kaynak: Daly BMS (UART2) · aralık %lu sn\n",
                SURUM, CIHAZ_ID, GONDERIM_ARALIGI_MS / 1000);
  Serial.printf("Hedef: %s%s\n", API_TABAN, API_YOL);
  daly.basla(PIN_DALY_RX, PIN_DALY_TX);
  wifiBaglan();
  sonOkuma = millis();
  olcumAl();
  sonGonderim = millis() - GONDERIM_ARALIGI_MS + 5000;
}

void loop() {
  const uint32_t simdi = millis();
  if (simdi - sonOkuma >= OKUMA_ARALIGI_MS) olcumAl();
  if (simdi - sonDurumSatiri >= 5000) { sonDurumSatiri = simdi; durumSatiri(); }
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
