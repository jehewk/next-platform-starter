#pragma once
// Tek bir BMS okuması. Kaynağı (Wokwi simülatörü ya da Daly BMS) ne olursa
// olsun paket.h yalnızca bu yapıyı görür.
//
// Birimler backend sözleşmesiyle (DEVIR.md §4, POST /de/aku/veri) aynıdır:
//   gerilim  V   · akim  A (+ şarj, − deşarj) · soc  %
//   hucreler mV  · sicakliklar °C · ic_direnc Ω (paket)

#include <stdint.h>
#include <stddef.h>
#include <string.h>

#define EN_FAZLA_HUCRE     24
#define EN_FAZLA_SICAKLIK  8
#define EN_FAZLA_HATA      8

// Daly, bağlı olmayan sensörü ham 0 → −40 °C olarak bildirir. Panel de
// −40'ı "bağlı değil" (—) diye gösterir; bu yüzden değer olduğu gibi gönderilir.
#define SENSOR_BAGLI_DEGIL (-40)

enum HataSeviye : uint8_t { SEVIYE_BILGI, SEVIYE_UYARI, SEVIYE_KRITIK };

struct HataKodu {
  const char* kod;
  const char* mesaj;
  HataSeviye seviye;
};

struct AkuOlcum {
  float    gerilim = 0;          // paket gerilimi
  float    akim = 0;             // + şarj, − deşarj
  float    soc = 0;              // 0–100
  uint32_t cevrim = 0;           // tam çevrim sayısı

  uint8_t  hucreSayisi = 0;
  uint16_t hucreMv[EN_FAZLA_HUCRE] = {};

  uint8_t  sicaklikSayisi = 0;
  int16_t  sicaklik[EN_FAZLA_SICAKLIK] = {};

  bool     sarjMos = true;
  bool     desarjMos = true;

  uint8_t  hataSayisi = 0;
  HataKodu hatalar[EN_FAZLA_HATA] = {};

  bool     gecerli = false;      // okuma başarılı mı (Daly zaman aşımı vb.)

  // Aynı kod iki kaynaktan gelirse (BMS biti + kendi kuralımız) tek kayıt
  // kalır; seviyesi yüksek olan korunur.
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

// Hücre farkı ve sıcaklık için ortak uyarı kuralları. Simülatör de Daly
// yolu da aynı eşikleri kullanır; panel bu kodları olduğu gibi gösterir.
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
