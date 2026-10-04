#pragma once
// Tek bir inverter okuması. Kaynağı (Wokwi simülatörü ya da gerçek inverter)
// ne olursa olsun paket.h yalnızca bu yapıyı görür.
//
// Birimler backend sözleşmesiyle (POST /de/inverter/veri, panel
// inverterDetayUyarla) aynıdır:
//   igbt °C · sogutucu °C · dc_gerilim V · ac_gerilim V · frekans Hz
//   guc_faktoru 0–1 · thd % · gunluk_kwh kWh (gün içi kümülatif)

#include <stdint.h>
#include <string.h>

#define EN_FAZLA_HATA 8

enum HataSeviye : uint8_t { SEVIYE_BILGI, SEVIYE_UYARI, SEVIYE_KRITIK };

struct HataKodu {
  const char* kod;
  const char* mesaj;
  HataSeviye seviye;
};

struct InverterOlcum {
  float igbt = 0;           // IGBT jonksiyon sıcaklığı °C
  float sogutucu = 0;       // soğutucu (heatsink) sıcaklığı °C
  float dc_gerilim = 0;     // DC bara V
  float ac_gerilim = 0;     // AC çıkış V
  float frekans = 0;        // Hz
  float guc_faktoru = 0;    // 0–1
  float thd = 0;            // % (akım/gerilim toplam harmonik bozulma)
  float gunluk_kwh = 0;     // gün içi kümülatif üretim/aktarım
  float anlik_kw = 0;       // yalnızca durum satırı/senaryo için (paketlenmez)

  uint8_t  hataSayisi = 0;
  HataKodu hatalar[EN_FAZLA_HATA] = {};

  bool gecerli = false;

  // Aynı kod iki kez gelirse tek kayıt kalır; seviyesi yüksek olan korunur.
  void hataEkle(const char* kod, const char* mesaj, HataSeviye s) {
    for (uint8_t i = 0; i < hataSayisi; i++) {
      if (strcmp(hatalar[i].kod, kod) == 0) {
        if (s > hatalar[i].seviye) hatalar[i] = {kod, mesaj, s};
        return;
      }
    }
    if (hataSayisi < EN_FAZLA_HATA) hatalar[hataSayisi++] = {kod, mesaj, s};
  }
};

// Ortak uyarı eşikleri — simülatör de saha yolu da aynısını kullanır, panel
// kodları olduğu gibi gösterir. Fizik motorunun inverter mekanizmalarıyla
// (igbt_termal_yorulma, kondansator_esr) tutarlı seçildi.
#define IGBT_UYARI_C    70.0f
#define IGBT_KRITIK_C   90.0f
#define THD_UYARI       5.0f    // %
#define THD_KRITIK      7.0f
#define PF_UYARI        0.92f   // altında güç faktörü düşük
#define SOGUTUCU_FARK_UYARI_C 22.0f  // IGBT-soğutucu farkı bu üstüyse soğutma zayıf

inline void ortakUyarilariEkle(InverterOlcum& o) {
  if (o.igbt >= IGBT_KRITIK_C)
    o.hataEkle("T02", "IGBT sıcaklığı kritik", SEVIYE_KRITIK);
  else if (o.igbt >= IGBT_UYARI_C)
    o.hataEkle("T01", "IGBT sıcaklığı yüksek", SEVIYE_UYARI);

  if (o.thd >= THD_KRITIK)
    o.hataEkle("K02", "Harmonik bozulma kritik (kondansatör)", SEVIYE_KRITIK);
  else if (o.thd >= THD_UYARI)
    o.hataEkle("K01", "Harmonik bozulma eşik üzerinde", SEVIYE_UYARI);

  if (o.guc_faktoru > 0 && o.guc_faktoru < PF_UYARI)
    o.hataEkle("G01", "Güç faktörü düşük", SEVIYE_UYARI);

  if (o.igbt - o.sogutucu >= SOGUTUCU_FARK_UYARI_C)
    o.hataEkle("S01", "IGBT-soğutucu farkı yüksek (soğutma zayıf)", SEVIYE_UYARI);
}
