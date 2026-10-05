#pragma once
// Paket iç direnci tahmini (Ω).
//
// Yöntem: BMS saniyede bir okunur; iki ardışık okuma arasında akım en az
// ADIM_A kadar sıçradıysa R = |ΔV / ΔI|. Böyle kısa aralıkta SOC değişmez,
// gerilim farkı yalnızca direnç üzerindeki düşümdür. Son birkaç tahminin
// ortancası alınır (tek gürültülü ölçüm sonucu bozmasın).
//
// Taze tahmin yoksa 0 döner ve pakete ic_direnc hiç eklenmez — backend
// alan yoksa eski değeri kullanır; uydurma değer göndermek eğilimi bozar.

#include <math.h>
#include <stdint.h>

class DirencTahmini {
 public:
  static constexpr float ADIM_A = 10.0f;
  static constexpr float EN_AZ_OHM = 0.001f;   // bunun altı ölçüm hatasıdır
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
    oncekiV_ = gerilim;
    oncekiI_ = akim;
    onceki_ = true;
  }

  /** Son gönderimden beri yeni ölçüm olduysa ortancayı verir, yoksa 0. */
  float al() {
    if (!taze_ || adet_ == 0) return 0;
    taze_ = false;
    const uint8_t n = adet_;
    float d[N];
    for (uint8_t i = 0; i < n; i++) d[i] = ornek_[i];
    for (uint8_t i = 1; i < n; i++)            // küçük dizi: ekleme sıralaması
      for (uint8_t j = i; j > 0 && d[j - 1] > d[j]; j--) { float t = d[j]; d[j] = d[j - 1]; d[j - 1] = t; }
    return n % 2 ? d[n / 2] : 0.5f * (d[n / 2 - 1] + d[n / 2]);
  }

 private:
  static const uint8_t N = 5;
  float ornek_[N] = {};
  uint8_t yaz_ = 0;    // sıradaki yazma konumu (halka tampon)
  uint8_t adet_ = 0;   // tampondaki geçerli örnek sayısı
  bool taze_ = false;
  bool onceki_ = false;
  float oncekiV_ = 0, oncekiI_ = 0;
};
