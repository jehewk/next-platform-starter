#pragma once
// Yalnızca host testi için Wokwi çip API taklidi (daly.chip.c'yi bilgisayarda
// derlemek üzere). Gerçek Wokwi'de bu dosya KULLANILMAZ; platform sağlar.
#include <stdint.h>
#include <stddef.h>

typedef int pin_t;
typedef int uart_dev_t;

#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LOW 0
#define HIGH 1

typedef void (*uart_rx_fn)(void *, uint8_t);
typedef struct {
  pin_t tx, rx;
  uint32_t baud_rate;
  uart_rx_fn rx_data;
  void *user_data;
} uart_config_t;

// Köprü: istek baytları çipe, çipin yazdığı yanıt baytları okuyucuya gider.
extern uart_rx_fn g_uart_rx;
extern void *g_uart_user;
extern int g_fault;        // HIGH = düğme basılı değil
void _emit(uint8_t b);     // emulator_testi.cpp tanımlar (yanıt tamponuna yazar)

static inline pin_t pin_init(const char *name, int mode) { (void)name; (void)mode; return 0; }
static inline int pin_read(pin_t p) { (void)p; return g_fault; }
static inline uart_dev_t uart_init(const uart_config_t *c) {
  g_uart_rx = c->rx_data; g_uart_user = c->user_data; return 1;
}
static inline void uart_write(uart_dev_t d, const uint8_t *buf, size_t n) {
  (void)d; for (size_t i = 0; i < n; i++) _emit(buf[i]);
}
