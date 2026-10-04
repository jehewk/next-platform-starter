#pragma once
// Host testi: daly_bms.h'nin beklediği Arduino ortamı. HardwareSerial, istek
// baytlarını Daly emülatör çipine (daly.chip.c) iletir; çipin yazdığı yanıt
// baytlarını geri okur. Böylece GERÇEK okuyucu ile GERÇEK emülatör çip baş başa.
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <deque>
#include "wokwi-api.h"

#define SERIAL_8N1 0
inline uint32_t &saat() { static uint32_t t = 0; return t; }
inline uint32_t millis() { return saat()++; }
inline void delay(uint32_t ms) { saat() += ms; }

extern std::deque<uint8_t> g_resp;   // çipin yazdığı yanıt baytları

struct HardwareSerial {
  void begin(unsigned long, int, int, int) {}
  int available() { return (int)g_resp.size(); }
  int read() { int b = g_resp.front(); g_resp.pop_front(); return b; }
  size_t write(const uint8_t *c, size_t n) {
    for (size_t i = 0; i < n; i++) if (g_uart_rx) g_uart_rx(g_uart_user, c[i]);
    return n;
  }
  template <class... A> int printf(const char *f, A... a) { return ::printf(f, a...); }
  void println(const char *s = "") { ::printf("%s\n", s); }
};
