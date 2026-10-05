#pragma once
// POST /de/aku/veri gövdesi — DEVIR.md §4 veri sözleşmesi.
//
//   cihaz_id, anahtar          kimlik (backend de_anahtar_dogrula ile kontrol eder)
//   gerilim (V), akim (A), soc (%), cevrim
//   hucreler     [mV, ...]     backend max/min/fark/min_hucre_no'yu kendisi çıkarır
//   sicakliklar  [°C, ...]     bağlı olmayan sensör −40
//   sarj_mos, desarj_mos       bool
//   hata_kodlari [{kod, mesaj, seviye}]  panel bu üç alanı okur
//   ic_direnc    Ω             yalnızca taze tahmin varsa eklenir
//
// Zaman damgası GÖNDERİLMEZ: backend alış anını (UTC) kaydeder. Bu yüzden
// gönderilemeyen ölçüm biriktirilip sonradan yollanmaz — yanlış zamana yazılır.
//
// Eski Inverter AI alanları (inverter_id, hucre_fark, /inverter/veri)
// burada bilerek yoktur; o protokol 403 alır.

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

  // Backend `if body.get('ic_direnc')` ile bakar: 0 göndermek "yok" demektir,
  // yine de alanı hiç eklememek daha açık.
  if (icDirencOhm > 0) d["ic_direnc"] = roundf(icDirencOhm * 1e5f) / 1e5f;

  if (d.overflowed()) return 0;
  const size_t n = serializeJson(d, cikti, boyut);
  return n < boyut ? n : 0;
}
