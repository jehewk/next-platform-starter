// Wokwi özel çipi: Daly BMS emülatörü.
//
// Gerçek bir Daly BMS gibi UART üzerinden istek/yanıt konuşur, böylece ESP32
// firmware'i KAYNAK_SIMULASYON 0 ile ASIL saha kodunu (daly_bms.h) çalıştırır:
// istek çerçevesi gönderir (A5 40 komut 08 ...), bu çip doğru yanıt çerçevesini
// (A5 01 komut 08 veri[8] toplam) döner. Veri gerçek AWS'ye gidip dashboard'da
// görünür — Wokwi'de saha yoluna en yakın test.
//
// Protokol (daly_bms.h ile aynı): 13 baytlık çerçeve, 9600 baud.
//   0x90 gerilim/akım/SOC · 0x93 MOSFET · 0x94 hücre+sensör+çevrim sayısı
//   0x95 hücre gerilimleri (çerçeve başına 3) · 0x96 sıcaklıklar (7) · 0x98 arıza
//
// FAULT pini (düğme, LOW = basılı): hücre 7 her okumada biraz daha ayrışır;
// fark 80 mV'u aşınca okuyucu kendi kuralıyla H01 üretir.

#include "wokwi-api.h"
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define HUCRE 16
#define SICAKLIK 4

typedef struct {
  uart_dev_t uart;
  pin_t      fault;
  uint8_t    buf[16];
  uint8_t    n;
  float      soc;          // %
  float      akim;         // A (+ şarj, − deşarj)
  int        cell7_drift;  // mV (arıza ilerledikçe artar)
  uint16_t   cevrim;
} chip_state_t;

static uint8_t toplamBayt(const uint8_t *c) {
  uint8_t s = 0;
  for (int i = 0; i < 12; i++) s += c[i];
  return s;
}

static void cerceve(uint8_t *out, uint8_t komut, const uint8_t d[8]) {
  out[0] = 0xA5; out[1] = 0x01; out[2] = komut; out[3] = 0x08;
  for (int i = 0; i < 8; i++) out[4 + i] = d[i];
  out[12] = toplamBayt(out);
}

static void hucreMv(chip_state_t *s, uint16_t *mv) {
  // SOC 0..100 -> ~3200..3400 mV; her hücrenin küçük sabit sapması var
  int taban = 3200 + (int)(s->soc * 2.0f);
  static const int ofs[HUCRE] = {0,1,-1,2,0,-2,1,0,1,-1,0,2,-1,0,1,-2};
  for (int i = 0; i < HUCRE; i++) mv[i] = (uint16_t)(taban + ofs[i]);
  int c7 = (int)mv[6] - s->cell7_drift;       // hücre 7 (index 6) arızada ayrışır
  mv[6] = (uint16_t)(c7 < 2500 ? 2500 : c7);
}

static void ilerlet(chip_state_t *s) {
  if (pin_read(s->fault) == LOW && s->cell7_drift < 220) s->cell7_drift += 4;
  s->soc += s->akim * 0.02f;                   // her okumada küçük değişim
  if (s->soc <= 35.0f) s->akim = 20.0f;        // boşaldı → şarj
  if (s->soc >= 85.0f) s->akim = -20.0f;       // doldu → deşarj
  if (s->soc < 0) s->soc = 0;
  if (s->soc > 100) s->soc = 100;
}

static void istegiYanitla(chip_state_t *s, uint8_t komut) {
  uint8_t out[13 * 6];
  uint8_t d[8];
  uint16_t mv[HUCRE];

  switch (komut) {
    case 0x90: {
      ilerlet(s);
      hucreMv(s, mv);
      uint32_t toplamMv = 0;
      for (int i = 0; i < HUCRE; i++) toplamMv += mv[i];
      uint16_t v10 = (uint16_t)(toplamMv / 100);                // 0.1 V
      uint16_t cur = (uint16_t)(30000 + (int)(s->akim * 10));   // ham akım
      uint16_t soc10 = (uint16_t)(s->soc * 10);
      memset(d, 0, 8);
      d[0] = v10 >> 8;   d[1] = v10 & 0xFF;
      d[4] = cur >> 8;   d[5] = cur & 0xFF;
      d[6] = soc10 >> 8; d[7] = soc10 & 0xFF;
      cerceve(out, 0x90, d);
      uart_write(s->uart, out, 13);
      break;
    }
    case 0x93: {
      memset(d, 0, 8);
      d[0] = (s->akim >= 0) ? 1 : 2;   // durum: şarj/deşarj
      d[1] = 1;                        // şarj MOSFET açık
      d[2] = 1;                        // deşarj MOSFET açık
      cerceve(out, 0x93, d);
      uart_write(s->uart, out, 13);
      break;
    }
    case 0x94: {
      memset(d, 0, 8);
      d[0] = HUCRE;
      d[1] = SICAKLIK;
      d[5] = s->cevrim >> 8;
      d[6] = s->cevrim & 0xFF;
      cerceve(out, 0x94, d);
      uart_write(s->uart, out, 13);
      break;
    }
    case 0x95: {
      hucreMv(s, mv);
      int yer = 0;
      for (int f = 0; f < 6; f++) {              // 16 hücre → 6 çerçeve (3'er)
        memset(d, 0, 8);
        d[0] = f + 1;                            // 1 tabanlı çerçeve numarası
        for (int j = 0; j < 3; j++) {
          int idx = f * 3 + j;
          if (idx < HUCRE) { d[1 + j * 2] = mv[idx] >> 8; d[2 + j * 2] = mv[idx] & 0xFF; }
        }
        cerceve(out + yer, 0x95, d);
        yer += 13;
      }
      uart_write(s->uart, out, yer);             // hepsi tek seferde
      break;
    }
    case 0x96: {
      memset(d, 0, 8);
      d[0] = 1;
      const int t[SICAKLIK] = {29, 31, 30, -40}; // 4. sensör bağlı değil (−40)
      for (int j = 0; j < SICAKLIK && j < 7; j++) d[1 + j] = (uint8_t)(t[j] + 40);
      cerceve(out, 0x96, d);
      uart_write(s->uart, out, 13);
      break;
    }
    case 0x98: {
      memset(d, 0, 8);   // arıza biti yok; H01'i okuyucu hücre farkından üretir
      cerceve(out, 0x98, d);
      uart_write(s->uart, out, 13);
      break;
    }
    default: break;
  }
}

static void uartGeldi(void *user_data, uint8_t bayt) {
  chip_state_t *s = (chip_state_t *)user_data;
  if (s->n == 0 && bayt != 0xA5) return;         // çerçeve başını bekle
  s->buf[s->n++] = bayt;
  if (s->n < 13) return;
  s->n = 0;
  if (s->buf[1] != 0x40 || s->buf[3] != 0x08) return;   // üst bilgisayar isteği değil
  if (toplamBayt(s->buf) != s->buf[12]) return;         // bozuk çerçeve
  istegiYanitla(s, s->buf[2]);
}

void chip_init(void) {
  chip_state_t *s = (chip_state_t *)malloc(sizeof(chip_state_t));
  memset(s, 0, sizeof(*s));
  s->soc = 72.0f;
  s->akim = -20.0f;
  s->cevrim = 12;

  s->fault = pin_init("FAULT", INPUT_PULLUP);

  const uart_config_t cfg = {
    .tx = pin_init("TX", INPUT),
    .rx = pin_init("RX", INPUT_PULLUP),
    .baud_rate = 9600,
    .rx_data = uartGeldi,
    .user_data = s,
  };
  s->uart = uart_init(&cfg);
}
