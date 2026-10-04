#pragma once
// POST /de/inverter/veri gövdesi — panel inverterDetayUyarla ile aynı alanlar.
//
//   cihaz_id, anahtar          kimlik (backend _cihaz_dogrula ile kontrol eder)
//   igbt (°C), sogutucu (°C)
//   dc_gerilim (V), ac_gerilim (V), frekans (Hz)
//   guc_faktoru (0–1), thd (%)
//   gunluk_kwh (kWh)           gün içi kümülatif; panel günün en büyüğünü üretim sayar
//   hata_kodlari [{kod, mesaj, seviye}]  panel/asistan okur (akü ile aynı biçim)
//
// Zaman damgası GÖNDERİLMEZ: backend alış anını (UTC) kaydeder.
//
// NOT: fizik motorunun inverter mekanizmaları (kopru_dengesizligi, guc_kisitlama)
// köprü sıcaklıkları ve anlık güç gibi ek alanlar da kullanabilir; backend ingest
// bugün bunları saklamıyor, o yüzden paket de göndermiyor. İleride ingest
// genişletilirse paket de genişletilmeli (bkz. KALIBRASYON.md §5).

#include <ArduinoJson.h>
#include "olcum.h"

static const char* seviyeAdi(HataSeviye s) {
  switch (s) {
    case SEVIYE_KRITIK: return "kritik";
    case SEVIYE_UYARI:  return "uyari";
    default:            return "bilgi";
  }
}

/**
 * Paketi `cikti`ya yazar, yazılan bayt sayısını döner (0 = sığmadı).
 * anahtar nullptr verilirse alan yazılmaz — seri porta basılan kopya için.
 */
inline size_t paketOlustur(const InverterOlcum& o, const char* cihazId,
                           const char* anahtar, char* cikti, size_t boyut) {
  JsonDocument d;
  d["cihaz_id"] = cihazId;
  if (anahtar) d["anahtar"] = anahtar;

  d["igbt"]        = o.igbt;
  d["sogutucu"]    = o.sogutucu;
  d["dc_gerilim"]  = o.dc_gerilim;
  d["ac_gerilim"]  = o.ac_gerilim;
  d["frekans"]     = o.frekans;
  d["guc_faktoru"] = o.guc_faktoru;
  d["thd"]         = o.thd;
  d["gunluk_kwh"]  = o.gunluk_kwh;

  JsonArray e = d["hata_kodlari"].to<JsonArray>();
  for (uint8_t i = 0; i < o.hataSayisi; i++) {
    JsonObject k = e.add<JsonObject>();
    k["kod"] = o.hatalar[i].kod;
    k["mesaj"] = o.hatalar[i].mesaj;
    k["seviye"] = seviyeAdi(o.hatalar[i].seviye);
  }

  if (d.overflowed()) return 0;
  const size_t n = serializeJson(d, cikti, boyut);
  return n < boyut ? n : 0;
}
