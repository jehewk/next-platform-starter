#pragma once
// BLE ile kurulum (provizyon) + kalici ayar (NVS) + musteriye baglanma.
//
// Telefon (musteri uygulamasi ya da nRF Connect gibi bir BLE araci) BLE_YAZ
// karakteristigine su JSON'u yazar:
//     {"ssid":"EvWifi","sifre":"parola","kod":"ABCD2345"}
// Cihaz WiFi'ye baglanir, POST /de/kurulum/tanit ile {cihaz_id, anahtar,
// eslesme_kodu} gonderip kendini o musteriye baglar; durumu BLE_BILDIR
// karakteristiginden telefona haber verir:
//     {"durum":"baglaniyor"|"wifi"|"kayit"|"tamam"|"hata","mesaj":"..."}
//
// Kutuphane: NimBLE-Arduino 1.x veya 2.x, ArduinoJson 7 (libraries.txt).
// (onWrite callback imzasi 2.x'te degisti; asagida surum korumasi var.)

#include <time.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include "ayarlar.h"
#include "sertifika.h"

class Kurulum {
 public:
  void basla() {
    nvs_.begin("dennis", false);
    ssid_  = nvs_.getString("ssid", "");
    sifre_ = nvs_.getString("sifre", "");
    bagli_ = nvs_.getBool("bagli", false);     // kurulum/tanit 200 aldiysa true
  }

  bool wifiVar() const { return ssid_.length() > 0; }
  bool musteriyeBagli() const { return bagli_; }
  bool bleAcik() const { return bleAcik_; }

  // Provizyon modu: telefon baglanip WiFi+kod yazana kadar reklam yapar.
  // Ad her cihaza ozgudur: "<onek> <cihaz_id>" — musteri dogru cihazi secebilsin.
  void bleBasla() {
    if (bleAcik_) return;
    String ad = String(BLE_AD_ONEK) + " " + CIHAZ_ID;    // or. "Dennis AKU-..-CB10"
    NimBLEDevice::init(ad.c_str());
    NimBLEServer* s = NimBLEDevice::createServer();
    NimBLEService* svc = s->createService(BLE_SERVIS_UUID);
    yaz_    = svc->createCharacteristic(BLE_YAZ_UUID, NIMBLE_PROPERTY::WRITE);
    bildir_ = svc->createCharacteristic(BLE_BILDIR_UUID, NIMBLE_PROPERTY::NOTIFY);
    yaz_->setCallbacks(new YazCB(this));
    svc->start();
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(BLE_SERVIS_UUID);
    adv->setName(ad.c_str());
    adv->start();
    bleAcik_ = true;
    Serial.printf("BLE provizyon acik: %s (telefondan WiFi + eslesme kodu bekleniyor)\n", ad.c_str());
  }

  void bleDurdur() {
    if (!bleAcik_) return;
    NimBLEDevice::deinit(true);
    bleAcik_ = false;
  }

  // WiFi'ye baglanir (olcum gonderimi de bunu kullanir). TLS icin saati de bekletir.
  bool wifiBaglan() {
    if (WiFi.status() == WL_CONNECTED) return true;
    if (ssid_.length() == 0) return false;
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid_.c_str(), sifre_.c_str());
    const uint32_t bas = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - bas < 20000) delay(250);
    if (WiFi.status() != WL_CONNECTED) return false;
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    struct tm t; const uint32_t t0 = millis();
    while (time(nullptr) < 1700000000UL && millis() - t0 < 12000) { delay(300); getLocalTime(&t, 0); }
    return true;
  }

  // loop'ta cagrilir. Telefon yeni bilgi yazdiysa WiFi+tanit yapar.
  // Döner: 1 = kurulum tamamlandi, -1 = hata, 0 = yapilacak is yok.
  int isle() {
    if (!yeniBilgi_) return 0;
    yeniBilgi_ = false;
    bildirGonder("{\"durum\":\"wifi\"}");
    if (!wifiBaglan()) { bildirGonder("{\"durum\":\"hata\",\"mesaj\":\"wifi baglanamadi\"}"); return -1; }
    bildirGonder("{\"durum\":\"kayit\"}");
    const int kod = tanit(bekleyenKod_);
    if (kod == 200) {
      bagli_ = true;
      nvs_.putBool("bagli", true);
      bildirGonder("{\"durum\":\"tamam\"}");
      delay(600);
      bleDurdur();
      Serial.println("Kurulum tamam: cihaz musteriye baglandi.");
      return 1;
    }
    char m[96];
    snprintf(m, sizeof(m), "{\"durum\":\"hata\",\"mesaj\":\"kayit %d\"}", kod);
    bildirGonder(m);
    Serial.printf("Kurulum basarisiz (kod %d). Kod yanlis/suresi dolmus olabilir.\n", kod);
    return -1;
  }

  // Telefon BLE_YAZ'a yazinca callback buraya getirir.
  void bilgiAlindi(const String& json) {
    JsonDocument d;
    if (deserializeJson(d, json)) { bildirGonder("{\"durum\":\"hata\",\"mesaj\":\"gecersiz json\"}"); return; }
    String ssid = String((const char*)(d["ssid"] | ""));
    String sifre = String((const char*)(d["sifre"] | ""));
    String kod = String((const char*)(d["kod"] | ""));
    kod.trim(); kod.toUpperCase();
    if (ssid.length() == 0 || kod.length() == 0) {
      bildirGonder("{\"durum\":\"hata\",\"mesaj\":\"ssid ve kod gerekli\"}");
      return;
    }
    ssid_ = ssid; sifre_ = sifre; bekleyenKod_ = kod;
    nvs_.putString("ssid", ssid_);
    nvs_.putString("sifre", sifre_);
    yeniBilgi_ = true;
    bildirGonder("{\"durum\":\"baglaniyor\"}");
  }

 private:
  int tanit(const String& kod) {
    JsonDocument d;
    d["cihaz_id"] = CIHAZ_ID;
    d["anahtar"] = CIHAZ_ANAHTARI;
    d["eslesme_kodu"] = kod;
    char govde[256];
    const size_t n = serializeJson(d, govde, sizeof(govde));
    WiFiClientSecure c;
    c.setCACert(KOK_SERTIFIKALAR);
    HTTPClient http;
    http.setTimeout(15000);
    if (!http.begin(c, API_TABAN API_TANIT)) return -1;
    http.addHeader("Content-Type", "application/json");
    const int kodHttp = http.POST((uint8_t*)govde, n);
    const String y = kodHttp > 0 ? http.getString() : String();
    http.end();
    Serial.printf("kurulum/tanit -> %d %s\n", kodHttp, y.substring(0, 180).c_str());
    return kodHttp;
  }

  void bildirGonder(const char* m) {
    if (bildir_) { bildir_->setValue((uint8_t*)m, strlen(m)); bildir_->notify(); }
    Serial.printf("[BLE durum] %s\n", m);
  }

  class YazCB : public NimBLECharacteristicCallbacks {
   public:
    explicit YazCB(Kurulum* k) : k_(k) {}
#if defined(NIMBLE_CPP_VERSION_MAJOR) && NIMBLE_CPP_VERSION_MAJOR >= 2
    // NimBLE-Arduino 2.x: callback imzasina NimBLEConnInfo eklendi.
    void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
      k_->bilgiAlindi(String(c->getValue().c_str()));
    }
#else
    // NimBLE-Arduino 1.x
    void onWrite(NimBLECharacteristic* c) override {
      k_->bilgiAlindi(String(c->getValue().c_str()));
    }
#endif
   private:
    Kurulum* k_;
  };

  Preferences nvs_;
  String ssid_, sifre_, bekleyenKod_;
  bool bagli_ = false, yeniBilgi_ = false, bleAcik_ = false;
  NimBLECharacteristic* yaz_ = nullptr;
  NimBLECharacteristic* bildir_ = nullptr;
};
