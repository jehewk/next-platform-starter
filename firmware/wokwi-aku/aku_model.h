#pragma once
// 16S LiFePO4 paket simülatörü — Wokwi'de Daly BMS'in yerini tutar.
//
// Amaç backend'e gerçekçi ölçüm göndermek; fizik motorunun tepki verdiği
// davranışlar modellenir:
//   · SOC, akımın zaman üzerinden integrali (hızlandırılmış saat)
//   · hücre gerilimi = LFP açık devre eğrisi + I·R + sabit üretim sapması
//   · I²R ısınması (birinci dereceden), ortam sıcaklığına doğru soğuma
//   · BMS korumaları: aşırı/düşük gerilim ve sıcaklıkta MOSFET kesme
//   · arıza senaryosu: hücre 7 her ölçümde biraz daha ayrışır ve iç direnci
//     artar → backend "hucre_dengesizligi" / "ic_direnc" mekanizmasını görür
//
// Arduino'ya bağımlı değildir; test/ altındaki host testi aynı dosyayı derler.

#include <math.h>
#include <string.h>
#include "olcum.h"

class AkuSimulator {
 public:
  static const uint8_t HUCRE = 16;
  static const uint8_t SENSOR = 4;       // 4. sensör bağlı değil (sahadaki gibi)
  static const uint8_t ARIZALI_HUCRE = 6; // 0 tabanlı → panelde "hücre 7"

  explicit AkuSimulator(const char* cihazId, float kapasiteAh = 100.0f)
      : kapasiteAh_(kapasiteAh) {
    // Hücre sapmaları cihaz kimliğinden türetilir: aynı cihaz her açılışta
    // aynı "üretim toleransına" sahip olur, farklı cihazlar farklı.
    uint32_t t = 2166136261u;
    for (const char* p = cihazId; *p; ++p) t = (t ^ (uint8_t)*p) * 16777619u;
    for (uint8_t i = 0; i < HUCRE; i++) {
      t = t * 1664525u + 1013904223u;
      sapmaMv_[i] = (float)((t >> 16) % 9) - 4.0f;                 // ±4 mV
      t = t * 1664525u + 1013904223u;
      direnc_[i] = HUCRE_R0 * (0.95f + 0.1f * ((t >> 16) % 100) / 100.0f);
    }
    for (uint8_t s = 0; s < SENSOR; s++) sicaklik_[s] = 25.0f;
  }

  // ── girişler ──
  void arizaAyarla(bool acik) { ariza_ = acik; }
  bool arizaAcik() const { return ariza_; }
  void socAyarla(float soc) { soc_ = sinirla(soc, 0, 100); }

  /**
   * dtSn gerçek saniye; hizlandirma ile çarpılarak simüle zamana çevrilir.
   * istenenAkimA: yük/şarj isteği (+ şarj, − deşarj). MOSFET kapalıysa
   * o yöndeki akım kesilir, tıpkı gerçek BMS'teki gibi.
   */
  void adim(float dtSn, float istenenAkimA, float ortamC, float hizlandirma) {
    float akim = istenenAkimA;
    if (akim > 0 && !sarjMos_) akim = 0;
    if (akim < 0 && !desarjMos_) akim = 0;
    // Uçlarda şarj/deşarj akımı doğal olarak söner (CV bölgesi / boş paket).
    if (akim > 0 && soc_ >= 99.9f) akim = 0;
    if (akim < 0 && soc_ <= 0.1f) akim = 0;
    akim_ = akim;

    const float dtSim = dtSn * hizlandirma;
    const float dAh = akim * dtSim / 3600.0f;
    soc_ = sinirla(soc_ + dAh / kapasiteAh_ * 100.0f, 0, 100);
    if (dAh < 0) desarjAh_ += -dAh;

    // Isıl model: paket ısı üretimi I²R, zaman sabiti ~20 dk (simüle).
    const float isi = akim * akim * HUCRE * HUCRE_R0;             // W
    const float hedefArtis = isi * 0.12f;                          // °C/W kalıcı durumda
    const float k = 1.0f - expf(-dtSim / 1200.0f);
    for (uint8_t s = 0; s < SENSOR - 1; s++) {
      const float yerel = (s == 1 ? 1.15f : 1.0f) * hedefArtis;     // orta sensör biraz sıcak
      sicaklik_[s] += (ortamC + yerel - sicaklik_[s]) * k;
    }
    korumalariGuncelle();
  }

  /** Arıza senaryosunu bir ölçüm ilerletir (gönderim başına bir kez çağrılır). */
  void arizaIlerlet() {
    if (!ariza_) return;
    arizaMv_ = fminf(arizaMv_ + 6.0f, 260.0f);      // ~14 ölçümde (Wokwi'de ~7 dk) uyarı eşiği
    arizaDirencKat_ = fminf(arizaDirencKat_ + 0.04f, 3.5f);
  }

  void oku(AkuOlcum& o) const {
    o = AkuOlcum();
    o.gecerli = true;
    o.hucreSayisi = HUCRE;
    float toplam = 0;
    for (uint8_t i = 0; i < HUCRE; i++) {
      const float mv = hucreMv(i);
      o.hucreMv[i] = (uint16_t)lroundf(mv);
      toplam += mv;
    }
    o.gerilim = yuvarla(toplam / 1000.0f, 2);
    o.akim = yuvarla(akim_, 1);
    o.soc = yuvarla(soc_, 1);
    o.cevrim = (uint32_t)(desarjAh_ / kapasiteAh_) + CEVRIM_BASLANGIC;
    o.sicaklikSayisi = SENSOR;
    for (uint8_t s = 0; s < SENSOR - 1; s++) o.sicaklik[s] = (int16_t)lroundf(sicaklik_[s]);
    o.sicaklik[SENSOR - 1] = SENSOR_BAGLI_DEGIL;
    o.sarjMos = sarjMos_;
    o.desarjMos = desarjMos_;

    if (!sarjMos_ && korumaNedeni_ == KORUMA_SICAK)
      o.hataEkle("T02", "Aşırı sıcaklık — şarj kesildi", SEVIYE_KRITIK);
    if (!sarjMos_ && korumaNedeni_ == KORUMA_SOGUK)
      o.hataEkle("T03", "Düşük sıcaklıkta şarj engellendi", SEVIYE_UYARI);
    if (!sarjMos_ && korumaNedeni_ == KORUMA_YUKSEK_V)
      o.hataEkle("H02", "Hücre aşırı gerilim — şarj kesildi", SEVIYE_KRITIK);
    if (!desarjMos_)
      o.hataEkle("H03", "Hücre düşük gerilim — deşarj kesildi", SEVIYE_KRITIK);
    ortakUyarilariEkle(o);
  }

  float akim() const { return akim_; }

 private:
  static constexpr float HUCRE_R0 = 0.0006f;       // Ω, 100 Ah prizmatik LFP
  static const uint32_t CEVRIM_BASLANGIC = 0;
  enum Koruma : uint8_t { KORUMA_YOK, KORUMA_YUKSEK_V, KORUMA_SICAK, KORUMA_SOGUK };

  static float sinirla(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
  static float yuvarla(float x, int basamak) {
    const float k = powf(10.0f, (float)basamak);
    return roundf(x * k) / k;
  }

  // LiFePO4 açık devre gerilimi (V) — SOC'ye göre parçalı doğrusal.
  static float ocv(float soc) {
    static const float S[] = {0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100};
    static const float V[] = {2.50f, 2.95f, 3.18f, 3.24f, 3.265f, 3.28f, 3.29f,
                              3.30f, 3.31f, 3.325f, 3.34f, 3.37f, 3.45f};
    if (soc <= S[0]) return V[0];
    for (uint8_t i = 1; i < sizeof(S) / sizeof(S[0]); i++)
      if (soc <= S[i]) return V[i - 1] + (V[i] - V[i - 1]) * (soc - S[i - 1]) / (S[i] - S[i - 1]);
    return V[12];
  }

  float hucreMv(uint8_t i) const {
    float soc = soc_;
    float r = direnc_[i];
    float sapma = sapmaMv_[i];
    if (ariza_ && i == ARIZALI_HUCRE) {
      // Kapasitesi azalan hücre: deşarjda daha düşük, şarjda daha yüksek gider.
      soc = sinirla(soc - arizaMv_ * 0.05f, 0, 100);
      r *= arizaDirencKat_;
      sapma += akim_ > 0 ? arizaMv_ * 0.4f : -arizaMv_;
    }
    return (ocv(soc) + akim_ * r) * 1000.0f + sapma;
  }

  void korumalariGuncelle() {
    uint16_t enY = 0, enD = 0xFFFF;
    for (uint8_t i = 0; i < HUCRE; i++) {
      const uint16_t mv = (uint16_t)lroundf(hucreMv(i));
      if (mv > enY) enY = mv;
      if (mv < enD) enD = mv;
    }
    float enSicak = -100;
    for (uint8_t s = 0; s < SENSOR - 1; s++) enSicak = fmaxf(enSicak, sicaklik_[s]);

    // Şarj MOSFET'i: kesme ve histerezisli geri açma
    if (sarjMos_) {
      if (enY >= 3650) { sarjMos_ = false; korumaNedeni_ = KORUMA_YUKSEK_V; }
      else if (enSicak >= 55) { sarjMos_ = false; korumaNedeni_ = KORUMA_SICAK; }
      else if (enSicak <= 0) { sarjMos_ = false; korumaNedeni_ = KORUMA_SOGUK; }
    } else {
      const bool tamam =
          (korumaNedeni_ == KORUMA_YUKSEK_V && enY <= 3400) ||
          (korumaNedeni_ == KORUMA_SICAK && enSicak <= 50) ||
          (korumaNedeni_ == KORUMA_SOGUK && enSicak >= 3);
      if (tamam) { sarjMos_ = true; korumaNedeni_ = KORUMA_YOK; }
    }
    // Deşarj MOSFET'i
    if (desarjMos_ && enD <= 2600) desarjMos_ = false;
    else if (!desarjMos_ && enD >= 3000) desarjMos_ = true;
  }

  float kapasiteAh_;
  float soc_ = 72.0f;
  float akim_ = 0;
  float desarjAh_ = 0;
  float sapmaMv_[HUCRE];
  float direnc_[HUCRE];
  float sicaklik_[SENSOR];
  bool sarjMos_ = true;
  bool desarjMos_ = true;
  Koruma korumaNedeni_ = KORUMA_YOK;
  bool ariza_ = false;
  float arizaMv_ = 0;
  float arizaDirencKat_ = 1.0f;
};
