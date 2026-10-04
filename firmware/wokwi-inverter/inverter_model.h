#pragma once
// LiFePO4 inverter simülatörü — Wokwi için. Arduino'ya bağımlı DEĞİLDİR,
// host'ta da derlenir (test/paket_testi.cpp).
//
// Fizik yaklaşık ama tutarlı:
//   · IGBT ısınması yükle artar (iletim + anahtarlama ~ I²R); arıza ek ısı bindirir
//   · soğutucu, jonksiyonun altında kalır; arıza soğutmayı zayıflatır (fark büyür)
//   · DC bara yük altında hafif, arızalı kondansatörde daha çok sarkar
//   · THD ve güç faktörü arızayla kötüleşir (kondansatör ESR artışı)
//   · gunluk_kwh gün içi kümülatiftir; simüle gün dönümünde sıfırlanır
//
// Arıza senaryosu (düğme): kondansatör/IGBT yaşlanması kademeli ilerler.

#include <math.h>
#include "olcum.h"

class InverterSimulator {
public:
  InverterSimulator(const char* id, float anmaKw) : anmaKw_(anmaKw) { (void)id; }

  // dtGercekSn: son çağrıdan beri geçen gerçek saniye. hizlanma: simüle saatin
  // kaç kat hızlı aktığı. yukFrac 0–1 (anma gücünün oranı), ortamC °C.
  void adim(float dtGercekSn, float yukFrac, float ortamC, float hizlanma) {
    yukFrac_ = kirp(yukFrac, 0.0f, 1.0f);
    ortam_ = ortamC;
    const float dtSaat = (dtGercekSn / 3600.0f) * hizlanma;
    saatToplam_ += dtSaat;
    const long gun = (long)(saatToplam_ / 24.0f);
    if (gun != gun_) { gun_ = gun; gunlukKwh_ = 0.0f; }   // gün dönümü: sayaç sıfır
    anlikKw_ = anmaKw_ * yukFrac_;
    gunlukKwh_ += anlikKw_ * dtSaat;
  }

  void arizaAyarla(bool acik) { arizaAcik_ = acik; }
  bool arizaAcik() const { return arizaAcik_; }

  // Her gönderimde bir adım ilerletilir: arıza açıkken kötüleşir, kapanınca
  // yavaşça toparlar (gerçek yaşlanma geri dönmez; burası sadece demo kolaylığı).
  void arizaIlerlet() {
    if (arizaAcik_ && arizaSeviye_ < 1.0f)  arizaSeviye_ += 0.06f;
    if (!arizaAcik_ && arizaSeviye_ > 0.0f) arizaSeviye_ -= 0.03f;
    arizaSeviye_ = kirp(arizaSeviye_, 0.0f, 1.0f);
  }
  float arizaSeviyesi() const { return arizaSeviye_; }

  void oku(InverterOlcum& o) const {
    const float y = yukFrac_;
    const float a = arizaSeviye_;

    const float igbt = ortam_ + 22.0f*y + 20.0f*y*y + 38.0f*a;
    // IGBT-soğutucu farkı: sağlıklı ~%28, arızada ~%60 (soğutma zayıflar)
    const float farkOrani = 0.28f + 0.32f*a;
    const float sogutucu = igbt - (igbt - ortam_) * farkOrani;

    o.igbt        = yuvarla(igbt, 1);
    o.sogutucu    = yuvarla(sogutucu, 1);
    o.dc_gerilim  = yuvarla(400.0f - 8.0f*y - 35.0f*a, 1);
    o.ac_gerilim  = yuvarla(230.0f - 3.0f*y - 4.0f*a, 1);
    o.frekans     = yuvarla(50.0f - 0.03f*y, 2);
    o.guc_faktoru = yuvarla(0.99f - 0.02f*y - 0.10f*a, 3);
    o.thd         = yuvarla(2.0f + 1.5f*y + 7.0f*a, 2);
    o.gunluk_kwh  = yuvarla(gunlukKwh_, 2);
    o.anlik_kw    = yuvarla(anlikKw_, 2);

    o.hataSayisi = 0;
    ortakUyarilariEkle(o);
    o.gecerli = true;
  }

  float simSaat() const { return fmodf(saatToplam_, 24.0f); }
  long  simGun()  const { return gun_; }

private:
  static float kirp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
  static float yuvarla(float v, int b) { const float p = powf(10.0f, (float)b); return roundf(v * p) / p; }

  float anmaKw_;
  float yukFrac_ = 0, ortam_ = 25, anlikKw_ = 0;
  float saatToplam_ = 8.0f;    // sabah 08:00'de başla
  float gunlukKwh_ = 0;
  long  gun_ = 0;
  bool  arizaAcik_ = false;
  float arizaSeviye_ = 0;
};
