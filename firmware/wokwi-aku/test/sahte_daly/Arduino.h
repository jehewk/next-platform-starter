// Sahte Arduino ortamı: millis/delay sanal saat, Serial2 yerine istek çerçevesine
// protokole uygun yanıt veren bir Daly BMS taklidi. Yalnızca host testleri içindir.
#pragma once
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <deque>
#include <vector>
#define SERIAL_8N1 0
inline uint32_t& saat(){ static uint32_t t=0; return t; }
inline uint32_t millis(){ return saat()++; }
inline void delay(uint32_t ms){ saat()+=ms; }
// Sahte Daly: istek çerçevesine göre yanıt kuyruğa eklenir.
struct HardwareSerial {
  std::deque<uint8_t> gelen;
  void begin(unsigned long,int,int,int){}
  int available(){ return (int)gelen.size(); }
  int read(){ int b=gelen.front(); gelen.pop_front(); return b; }
  void cevap(uint8_t cmd, std::vector<uint8_t> d){
    uint8_t c[13]={0xA5,0x01,cmd,0x08}; for(int i=0;i<8;i++) c[4+i]=d[i];
    uint8_t t=0; for(int i=0;i<12;i++) t+=c[i]; c[12]=t;
    gelen.push_back(0x00); // çerçeve öncesi çöp bayt: yeniden eşleme sınanır
    for(uint8_t b: c) gelen.push_back(b);
  }
  size_t write(const uint8_t* c, size_t n){
    uint8_t t=0; for(int i=0;i<12;i++) t+=c[i];
    if (c[0]!=0xA5 || c[1]!=0x40 || c[3]!=0x08 || t!=c[12]) { printf("HATALI İSTEK\n"); return n; }
    switch(c[2]){
      case 0x90: cevap(0x90,{0x02,0x10, 0,0, 0x74,0xCC, 0x02,0xD5}); break; // 52.8V, (29900-30000)*0.1=-10.0A, 72.5%
      case 0x93: cevap(0x93,{2,1,0,5,0,0,0,0}); break;                      // şarj MOS açık, deşarj kapalı
      case 0x94: cevap(0x94,{16,3,0,0,0,0x01,0x2C,0}); break;              // 16 hücre, 3 sensör, 300 çevrim
      case 0x95: for(int f=1; f<=6; f++){ std::vector<uint8_t> d={(uint8_t)f};
                   for(int j=0;j<3;j++){ int h=(f-1)*3+j; uint16_t mv = h==6 ? 3190 : 3300+h; d.push_back(mv>>8); d.push_back(mv&0xFF);} d.push_back(0); cevap(0x95,d);} break;
      case 0x96: cevap(0x96,{1, 65,66,90, 0,0,0,0}); break;                 // 25,26,50 °C
      case 0x98: cevap(0x98,{0,0,0,0x02,0,0,0,0}); break;                   // bayt3 bit1: hücre farkı L2
    }
    return n;
  }
  template<class...A> int printf(const char* f, A... a){ return ::printf(f, a...); }  // NOLINT
  void println(const char* s=""){ ::printf("%s\n",s); }
};
