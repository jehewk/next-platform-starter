#pragma once
// Daly BMS UART okuyucu (sahadaki cihaz için; Wokwi'de kullanılmaz).
//
// Çerçeve (13 bayt):  A5 | adres | komut | 08 | veri[8] | toplam
//   istek adresi 0x40 (üst bilgisayar), yanıt adresi 0x01 (BMS)
//   toplam = önceki 12 baytın toplamının düşük baytı
//
// Kullanılan komutlar (Daly UART/RS485 protokolü v1.2):
//   0x90  toplam gerilim (0.1 V), akım ((ham−30000)·0.1 A), SOC (0.1 %)
//   0x93  şarj / deşarj MOSFET durumu
//   0x94  hücre sayısı, sıcaklık sensörü sayısı, çevrim sayısı
//   0x95  hücre gerilimleri (çerçeve başına 3 hücre, mV)
//   0x96  sıcaklıklar (çerçeve başına 7 sensör, ham−40 °C)
//   0x98  arıza bitleri
//
// NOT: Gerçek Daly ile henüz denenmedi (DEVIR.md §11). İlk saha testinde
// seri porttaki ham çerçeveleri DALY_HATA_AYIKLA ile açıp doğrulayın.

#include <Arduino.h>
#include "olcum.h"

class DalyBms {
 public:
  explicit DalyBms(HardwareSerial& port) : port_(port) {}

  // dePin: RS485 alıcı-verici yön pini (DE+RE). Düz TTL UART'ta -1 bırakılır.
  void basla(int rxPin, int txPin, int dePin = -1) {
    de_ = dePin;
    port_.begin(9600, SERIAL_8N1, rxPin, txPin);
#if defined(ESP32)
    if (de_ >= 0) { pinMode(de_, OUTPUT); digitalWrite(de_, LOW); }   // dinleme modu
#endif
  }

  /** Tüm alanları okur. Zorunlu komutlardan biri yanıt vermezse gecerli=false. */
  bool oku(AkuOlcum& o) {
    o = AkuOlcum();
    uint8_t v[8];

    if (!sor(0x90, v)) return false;
    o.gerilim = u16(v, 0) / 10.0f;
    o.akim = ((int32_t)u16(v, 4) - 30000) / 10.0f;   // Daly: + şarj, − deşarj
    o.soc = u16(v, 6) / 10.0f;

    if (!sor(0x93, v)) return false;
    o.sarjMos = v[1] != 0;
    o.desarjMos = v[2] != 0;

    if (!sor(0x94, v)) return false;
    o.hucreSayisi = v[0] < EN_FAZLA_HUCRE ? v[0] : EN_FAZLA_HUCRE;
    o.sicaklikSayisi = v[1] < EN_FAZLA_SICAKLIK ? v[1] : EN_FAZLA_SICAKLIK;
    o.cevrim = u16(v, 5);

    if (!hucreleriOku(o)) return false;
    sicakliklariOku(o);          // sensör yoksa boş kalır, zorunlu değil
    arizalariOku(o);             // okunamazsa yalnızca kod eklenmez
    ortakUyarilariEkle(o);

    o.gecerli = true;
    return true;
  }

 private:
  static uint16_t u16(const uint8_t* v, int i) { return (uint16_t)(v[i] << 8 | v[i + 1]); }

  void gonder(uint8_t komut) {
    uint8_t c[13] = {0xA5, 0x40, komut, 0x08};
    uint8_t toplam = 0;
    for (int i = 0; i < 12; i++) toplam += c[i];
    c[12] = toplam;
    while (port_.available()) port_.read();          // eski yanıt artıklarını at
#if defined(ESP32)
    if (de_ >= 0) digitalWrite(de_, HIGH);           // RS485: gönderim moduna geç
#endif
    port_.write(c, sizeof(c));
#if defined(ESP32)
    if (de_ >= 0) { port_.flush(); digitalWrite(de_, LOW); }  // TX bitince dinlemeye dön
#endif
  }

  /** Tek çerçeve okur; komut ve toplam doğruysa veriyi kopyalar. */
  bool cerceveAl(uint8_t komut, uint8_t* veri, uint32_t zamanAsimiMs = 120) {
    uint8_t c[13];
    uint8_t n = 0;
    const uint32_t bas = millis();
    while (millis() - bas < zamanAsimiMs) {
      if (!port_.available()) { delay(1); continue; }
      const uint8_t b = port_.read();
      if (n == 0 && b != 0xA5) continue;             // çerçeve başını bekle
      c[n++] = b;
      if (n < 13) continue;
      uint8_t toplam = 0;
      for (int i = 0; i < 12; i++) toplam += c[i];
#ifdef DALY_HATA_AYIKLA
      Serial.printf("[daly] %02X:", komut);
      for (int i = 0; i < 13; i++) Serial.printf(" %02X", c[i]);
      Serial.println();
#endif
      if (toplam == c[12] && c[2] == komut && c[3] == 0x08) {
        memcpy(veri, c + 4, 8);
        return true;
      }
      n = 0;                                         // bozuk çerçeve: yeniden eşle
    }
    return false;
  }

  bool sor(uint8_t komut, uint8_t* veri) {
    for (int deneme = 0; deneme < 2; deneme++) {
      gonder(komut);
      if (cerceveAl(komut, veri)) return true;
    }
    return false;
  }

  bool hucreleriOku(AkuOlcum& o) {
    const uint8_t cerceve = (o.hucreSayisi + 2) / 3;
    gonder(0x95);
    uint8_t v[8];
    uint8_t alinan = 0;
    for (uint8_t k = 0; k < cerceve; k++) {
      if (!cerceveAl(0x95, v, 200)) break;
      const uint8_t no = v[0];                       // 1 tabanlı çerçeve numarası
      for (uint8_t j = 0; j < 3; j++) {
        const int h = (no - 1) * 3 + j;
        if (no >= 1 && h < o.hucreSayisi) { o.hucreMv[h] = u16(v, 1 + j * 2); alinan++; }
      }
    }
    return alinan == o.hucreSayisi;                  // eksik hücre listesi gönderilmez
  }

  void sicakliklariOku(AkuOlcum& o) {
    if (!o.sicaklikSayisi) return;
    const uint8_t cerceve = (o.sicaklikSayisi + 6) / 7;
    gonder(0x96);
    uint8_t v[8];
    for (uint8_t k = 0; k < cerceve; k++) {
      if (!cerceveAl(0x96, v, 200)) { o.sicaklikSayisi = 0; return; }
      const uint8_t no = v[0];
      for (uint8_t j = 0; j < 7; j++) {
        const int s = (no - 1) * 7 + j;
        if (no >= 1 && s < o.sicaklikSayisi) o.sicaklik[s] = (int16_t)v[1 + j] - 40;
      }
    }
  }

  void arizalariOku(AkuOlcum& o) {
    uint8_t v[8];
    if (!sor(0x98, v)) return;
    // Seviye-2 bitleri (tek sayılı bitler) BMS'in koruma devreye soktuğu durumdur.
    struct Bit { uint8_t bayt, bit; const char* kod; const char* mesaj; HataSeviye s; };
    static const Bit TABLO[] = {
      {0, 1, "H02", "Hücre aşırı gerilim — koruma devrede",   SEVIYE_KRITIK},
      {0, 0, "H02", "Hücre gerilimi yüksek",                   SEVIYE_UYARI},
      {0, 3, "H03", "Hücre düşük gerilim — koruma devrede",   SEVIYE_KRITIK},
      {0, 2, "H03", "Hücre gerilimi düşük",                    SEVIYE_UYARI},
      {1, 1, "T02", "Şarjda aşırı sıcaklık — koruma devrede", SEVIYE_KRITIK},
      {1, 3, "T03", "Düşük sıcaklıkta şarj engellendi",       SEVIYE_UYARI},
      {1, 5, "T02", "Deşarjda aşırı sıcaklık — koruma devrede", SEVIYE_KRITIK},
      {2, 1, "A01", "Şarj aşırı akım — koruma devrede",       SEVIYE_KRITIK},
      {2, 3, "A02", "Deşarj aşırı akım — koruma devrede",     SEVIYE_KRITIK},
      {3, 1, "H01", "BMS: hücre farkı koruma seviyesinde",    SEVIYE_KRITIK},
      {3, 3, "T04", "Sensörler arası sıcaklık farkı yüksek",  SEVIYE_UYARI},
    };
    for (const Bit& b : TABLO)
      if (v[b.bayt] & (1 << b.bit)) o.hataEkle(b.kod, b.mesaj, b.s);
    // 4–6. baytlar donanım arızalarıdır (MOSFET, AFE, sensör kopukluğu...).
    for (uint8_t bayt = 4; bayt <= 6; bayt++)
      if (v[bayt]) { o.hataEkle("B01", "BMS donanım arızası bildirdi", SEVIYE_KRITIK); break; }
  }

  HardwareSerial& port_;
  int de_ = -1;            // RS485 yön pini (-1 = TTL UART, yön kontrolü yok)
};
