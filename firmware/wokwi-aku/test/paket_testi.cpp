// Host testi: firmware'in simülatör + paket kodunu Arduino olmadan çalıştırır.
// Senaryo boyunca üretilen her paketi bir satır JSON olarak yazar;
// sozlesme_kontrol.py bunları backend'in /de/aku/veri mantığıyla doğrular.
//
//   g++ -std=c++17 -I.. -I<ArduinoJson>/src paket_testi.cpp -o paket_testi
//   ./paket_testi | python3 sozlesme_kontrol.py

#include <cstdio>
#include "../aku_model.h"
#include "../direnc.h"
#include "../paket.h"

int main() {
  AkuSimulator sim("AKU-DENEME-0001");
  DirencTahmini direnc;
  AkuOlcum o;
  char buf[1536];
  const float HIZ = 20.0f;

  // (saniye, akım isteği A, ortam °C, arıza)
  struct Evre { int sure; float akim; float ortam; bool ariza; };
  const Evre evreler[] = {
    {60, 0, 25, false},      // boşta
    {120, -40, 25, false},   // deşarj
    {60, 30, 25, false},     // şarja ani geçiş → iç direnç tahmini
    {600, -45, 30, true},    // arıza açık, uzun deşarj → düşük gerilim koruması
    {300, 0, 52, true},      // sıcak ortam, boşta
    {300, 50, 52, true},     // sıcakta şarj → sıcaklık koruması
  };
  int saniye = 0;
  for (const Evre& e : evreler) {
    sim.arizaAyarla(e.ariza);
    for (int i = 0; i < e.sure; i++, saniye++) {
      sim.adim(1.0f, e.akim, e.ortam, HIZ);
      sim.oku(o);
      direnc.besle(o.gerilim, o.akim);
      if (saniye % 30 == 29) {
        sim.arizaIlerlet();
        const size_t n = paketOlustur(o, direnc.al(), "AKU-DENEME-0001", "test-anahtari", buf, sizeof(buf));
        if (!n) { fprintf(stderr, "paket sığmadı\n"); return 1; }
        printf("%s\n", buf);
      }
    }
  }
  return 0;
}
