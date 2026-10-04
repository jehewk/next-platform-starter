// Daly emülatör çipini (daly.chip.c) GERÇEK okuyucuyla (../../daly_bms.h)
// baş başa çalıştırır: çipin ürettiği çerçeveler okuyucudan doğru çözülüyor mu?
//
//   g++ -std=gnu++17 -I. -I.. -I../.. emulator_testi.cpp -o emulator_testi && ./emulator_testi

#include <deque>
#include <cstdio>
#include "wokwi-api.h"

std::deque<uint8_t> g_resp;
uart_rx_fn g_uart_rx = nullptr;
void *g_uart_user = nullptr;
int g_fault = HIGH;              // başta düğme basılı değil
void _emit(uint8_t b) { g_resp.push_back(b); }

#include "../daly.chip.c"        // chip_init, uartGeldi (emülatör)
#include "daly_bms.h"            // GERÇEK okuyucu (Arduino.h köprüsüyle)

static int basarisiz = 0;
static void kontrol(const char *ad, bool ok) {
  printf(ok ? "  ok   %s\n" : "  HATA %s\n", ad);
  if (!ok) basarisiz++;
}

int main() {
  chip_init();                  // emülatör çipi başlat
  HardwareSerial port;
  DalyBms d(port);
  AkuOlcum o;

  // 1) Sağlıklı okuma
  bool ok = d.oku(o);
  printf("okuma: V=%.1f I=%.1f soc=%.1f cevrim=%u hucre=%u sensor=%u sarj=%d desarj=%d\n",
         o.gerilim, o.akim, o.soc, o.cevrim, o.hucreSayisi, o.sicaklikSayisi, o.sarjMos, o.desarjMos);
  kontrol("okuma başarılı", ok);
  kontrol("16 hücre çözüldü", o.hucreSayisi == 16);
  kontrol("4 sıcaklık sensörü", o.sicaklikSayisi == 4);
  kontrol("çevrim 12", o.cevrim == 12);
  // gerilim ~ sum(hucreler)/1000
  uint32_t toplam = 0; for (int i = 0; i < o.hucreSayisi; i++) toplam += o.hucreMv[i];
  kontrol("gerilim ≈ hücre toplamı", o.gerilim > 0 && (double)toplam / 1000.0 - o.gerilim < 0.2 &&
                                     (double)toplam / 1000.0 - o.gerilim > -0.2);
  kontrol("4. sensör bağlı değil (−40)", o.sicaklikSayisi == 4 && o.sicaklik[3] == -40);
  kontrol("sağlıklıyken H01 yok", [&]{ for (int i=0;i<o.hataSayisi;i++) if(!strcmp(o.hatalar[i].kod,"H01")) return false; return true; }());
  kontrol("MOSFET'ler açık", o.sarjMos && o.desarjMos);

  // 2) Arıza: düğme basılı — hücre 7 ayrışır, fark 80 mV'u aşınca H01 çıkar
  g_fault = LOW;
  bool h01 = false; int farkSon = 0;
  for (int i = 0; i < 40; i++) {
    d.oku(o);
    farkSon = o.enYuksekMv() - o.enDusukMv();
    for (int j = 0; j < o.hataSayisi; j++) if (!strcmp(o.hatalar[j].kod, "H01")) h01 = true;
    if (h01) break;
  }
  printf("arıza sonrası: fark=%d mV, en düşük hücre=%d, H01=%d\n",
         farkSon, [&]{int mi=0;uint16_t m=0xFFFF;for(int i=0;i<o.hucreSayisi;i++)if(o.hucreMv[i]<m){m=o.hucreMv[i];mi=i+1;}return mi;}(), h01);
  kontrol("arızada fark 80 mV'u aştı", farkSon >= 80);
  kontrol("arızada H01 üretildi", h01);
  kontrol("ayrışan hücre 7", [&]{int mi=0;uint16_t m=0xFFFF;for(int i=0;i<o.hucreSayisi;i++)if(o.hucreMv[i]<m){m=o.hucreMv[i];mi=i+1;}return mi==7;}());

  printf(basarisiz ? "\n%d kontrol BAŞARISIZ\n" : "\nTüm kontroller geçti.\n", basarisiz);
  return basarisiz ? 1 : 0;
}
