// Host testi: inverter firmware'inin simülatör + paket kodunu Arduino olmadan
// çalıştırır. Senaryo boyunca üretilen her paketi bir satır JSON olarak yazar;
// sozlesme_kontrol.py bunları backend'in /de/inverter/veri mantığıyla doğrular.
//
//   g++ -std=c++17 -I.. -I<ArduinoJson>/src paket_testi.cpp -o paket_testi
//   ./paket_testi | python3 sozlesme_kontrol.py

#include <cstdio>
#include "../inverter_model.h"
#include "../paket.h"

int main() {
  InverterSimulator sim("INV-DENEME-0001", 5.0f);
  InverterOlcum o;
  char buf[1024];
  const float HIZ = 120.0f;   // bir gün ~ birkaç dakika; gün dönümünü görmek için

  // (saniye, yük oranı 0–1, ortam °C, arıza)
  struct Evre { int sure; float yuk; float ortam; bool ariza; };
  const Evre evreler[] = {
    {120, 0.20f, 20, false},   // sabah düşük yük
    {300, 0.60f, 25, false},   // gündüz orta yük
    {300, 1.00f, 30, false},   // öğlen tam yük (sağlıklı tepe sıcaklık)
    {300, 0.70f, 28, false},   // gün ortası — kWh birikir, gün dönümü geçilir
    {600, 0.90f, 35, true},    // arıza açık: kondansatör yaşlanması, sıcak ortam
    {300, 0.50f, 30, true},    // arıza sürüyor, yük düşse de THD/pf kötü
  };
  int saniye = 0;
  for (const Evre& e : evreler) {
    sim.arizaAyarla(e.ariza);
    for (int i = 0; i < e.sure; i++, saniye++) {
      sim.adim(1.0f, e.yuk, e.ortam, HIZ);
      sim.oku(o);
      if (saniye % 30 == 29) {
        sim.arizaIlerlet();
        const size_t n = paketOlustur(o, "INV-DENEME-0001", "test-anahtari", buf, sizeof(buf));
        if (!n) { fprintf(stderr, "paket sığmadı\n"); return 1; }
        printf("%s\n", buf);
      }
    }
  }
  return 0;
}
