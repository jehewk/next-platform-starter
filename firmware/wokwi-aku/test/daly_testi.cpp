// Daly UART ayrıştırıcısını sahte bir BMS ile sınar (test/sahte_daly/Arduino.h).
//   g++ -std=gnu++17 -Itest/sahte_daly -I. test/daly_testi.cpp -o daly_testi && ./daly_testi
#include "daly_bms.h"
int main(){
  HardwareSerial port; DalyBms d(port); AkuOlcum o;
  bool ok = d.oku(o);
  printf("ok=%d V=%.1f I=%.1f soc=%.1f cevrim=%u hucre=%u sensor=%u sarj=%d desarj=%d\n", ok, o.gerilim, o.akim, o.soc, o.cevrim, o.hucreSayisi, o.sicaklikSayisi, o.sarjMos, o.desarjMos);
  printf("hucreler:"); for(int i=0;i<o.hucreSayisi;i++) printf(" %u", o.hucreMv[i]); printf("\nsicaklik:");
  for(int i=0;i<o.sicaklikSayisi;i++) printf(" %d", o.sicaklik[i]); printf("\nkodlar:");
  for(int i=0;i<o.hataSayisi;i++) printf(" %s(%s)", o.hatalar[i].kod, o.hatalar[i].mesaj); printf("\n");
  bool beklenen = ok && o.gerilim==52.8f && o.akim==-10.0f && o.soc==72.5f && o.cevrim==300 && o.hucreSayisi==16
    && o.hucreMv[0]==3300 && o.hucreMv[6]==3190 && o.hucreMv[15]==3315 && o.sicaklik[2]==50 && o.sarjMos && !o.desarjMos;
  printf(beklenen ? "DALY AYRIŞTIRMA DOĞRU\n" : "DALY AYRIŞTIRMA YANLIŞ\n");
  return beklenen ? 0 : 1;
}
