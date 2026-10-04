# Wokwi'de GERÇEK Daly BMS yolu (özel çip) → AWS → dashboard

Normal `wokwi-aku` projesi dahili simülatörü kullanır (`KAYNAK_SIMULASYON 1`) ve
`daly_bms.h`'yi hiç çalıştırmaz. Bu klasör, Wokwi içinde **gerçek Daly BMS'i taklit
eden bir özel çip** (`daly.chip.c`) ekler; ESP32 `KAYNAK_SIMULASYON 0` ile asıl saha
kodunu çalıştırır: istek çerçevesi gönderir, çip gerçek Daly gibi yanıtlar, veri
gerçek AWS'ye gidip **dashboard'da görünür**. Wokwi'de sahaya en yakın uçtan uca test.

```
┌─────────────┐  UART 9600 (DALY A5…)  ┌──────────┐  HTTPS  ┌─────────┐  ┌───────────┐
│ daly.chip.c │ ◀────── istek ──────── │  ESP32   │ ──────▶ │  AWS    │  │ dashboard │
│ (sahte BMS) │ ─────── yanıt ───────▶ │ firmware │  POST   │ Lambda+ │ ▶│  (panel)  │
└─────────────┘                        └──────────┘ /de/aku │ DynamoDB│  └───────────┘
   FAULT düğmesi: hücre 7 ayrışır          GPIO16/17  /veri  └─────────┘
```

## 1) Önce backend ve bir cihaz kaydı hazır olmalı

Bu test gerçek sunucuya yazar; önce canlı tarafın hazır olması gerekir:

1. `cd C:\dennis\aws ; .\hazirlik-kur.ps1` — backend + Lambda yayında.
2. Bir **akü** cihazı üret ve anahtarını al:
   ```powershell
   .\cihaz-uret.ps1
   ```
   Betik `dennis-cihazlar` tablosuna bir kayıt ekler ve doğrudan
   `ayarlar.h`'ye yapıştıracağın satırları basar:
   ```c
   #define CIHAZ_ID       "AKU-WOKWI-1A2B"
   #define CIHAZ_ANAHTARI "DEV-…"
   ```
   Bir müşteriye atamak istersen: `.\cihaz-uret.ps1 -MusteriId <id>`.
3. (İsteğe bağlı) Cihazı panelden bir müşteriye atarsan müşteri panelinde de görünür;
   atamadan da üretici panelinde görünür.

> Anahtarı sohbet/paylaşımda yazma; yalnızca `ayarlar.h`'de tut.

## 2) Wokwi projesini kur

### KOLAY YOL (önerilen) — 4 dosya, ayar önceden yapılmış

wokwi.com → yeni **ESP32** projesi. Sadece şunları yapıştır:

1. **`sketch.ino`** sekmesinin içini sil, bu klasördeki **`TEK-DOSYA-sketch.ino`**'nun
   tamamını yapıştır. *(Tüm .h dosyaları bunun içine gömülü; KAYNAK_SIMULASYON 0 ve
   30 sn ayarı zaten yapılmış.)*
2. **`diagram.json`** sekmesinin içini sil, bu klasördeki **`diagram.json`**'u yapıştır.
3. **▾ → New File…** ile **`daly.chip.json`** oluştur, bu klasördekini yapıştır.
4. **▾ → New File…** ile **`daly.chip.c`** oluştur, bu klasördekini yapıştır.

Sonra `sketch.ino`'da iki satırı (en üstteki yorumun altında) adım 1'deki değerlerle değiştir:
```c
#define CIHAZ_ID       "AKU-WOKWI-…"
#define CIHAZ_ANAHTARI "DEV-…"
```
Başlat. Bu kadar — adım 3'e (aşağıdaki "Çalıştır") geç.

### UZUN YOL (ayrı dosyalarla)

İstersen dosyaları tek tek de ekleyebilirsin:

**Firmware (üst klasör `wokwi-aku`'dan):**
`sketch.ino`, `ayarlar.h`, `olcum.h`, `paket.h`, `direnc.h`, `sertifika.h`,
`daly_bms.h`  *(aku_model.h gerekmez — simülatör kullanılmıyor)*

**Bu klasörden:**
`daly.chip.json`, `daly.chip.c`, `diagram.json`

**`ayarlar.h`'de iki satırı değiştir:**
```c
#define KAYNAK_SIMULASYON 0      // ← gerçek Daly yolu (daly_bms.h)
```
ve Wokwi'de 10 dakika beklememek için saha gönderim aralığını kısalt — sim-0
dalındaki `GONDERIM_ARALIGI_MS`'yi geçici olarak `30000UL` yap (sahaya alırken
geri 600000UL'ye çevir).

**`ayarlar.h`'de cihaz kimliğini yaz:**
```c
#define CIHAZ_ID       "AKU-…"       // 1. adımda üretilen
#define CIHAZ_ANAHTARI "…"           // 1. adımda dönen anahtar
```

## 3) Çalıştır ve dashboard'da gör

Seri monitörde beklenen akış:

```
de-aku-fw 1.0.0 · cihaz AKU-… · kaynak: Daly BMS (UART2) · aralık 30 sn
SOC  72.0%   53.44 V   -20.0 A  fark   4 mV  T 31 °C  MOS ş:1 d:1  hata:0
Paket: {"cihaz_id":"AKU-…","gerilim":53.4,"akim":-20,...,"hucreler":[...16...],...}
→ 200 {"ok":true}
Gönderim: 1 başarılı / 0 başarısız
```

- **Yeşil LED** = son gönderim 200 aldı. Kırmızı = hata (403 ise kimlik yanlış).
- Birkaç gönderimden sonra **dashboard'da** cihazın son ölçümü, SOC, hücre farkı
  ve geçmiş grafiği dolmaya başlar (DynamoDB'ye gerçekten yazıldığı için).

**Arıza senaryosu:** kırmızı düğmeye bas — çip her okumada hücre 7'yi biraz daha
ayrıştırır. Fark 80 mV'u aşınca firmware (okuyucunun kendi kuralıyla) pakete `H01`
uyarısı koyar; dashboard'da hücre dengesizliği uyarısı ve fizik motorunun
değerlendirmesi görünür.

## Neden "gerçek" sayılır

- ESP32, `aku_model.h`'yi değil **`daly_bms.h`'yi** çalıştırır: istek/yanıt,
  çerçeve eşleme, çoklu çerçeve hücre okuma, toplam (checksum) doğrulama.
- Çipin ürettiği çerçeve biçimi, `daly_bms.h`'yi host'ta doğrulayan
  `test/sahte_daly` ile **birebir aynı** protokoldür.
- HTTPS + gerçek cihaz anahtarı + gerçek Lambda + gerçek DynamoDB + gerçek panel.

Tek fark sahadan: veriyi üreten gerçek bir akü değil, aynı protokolü konuşan bir
çip. Gerçek Daly donanımına geçerken firmware'de değişiklik gerekmez — sadece
`ayarlar.h`'de `KAYNAK_SIMULASYON 0` zaten doğru, UART pinlerine Daly'yi bağlarsın.

## Testler (bilgisayarda, Wokwi/ESP32 gerekmez)

Emülatör çipi, gerçek `daly_bms.h` okuyucusuyla host'ta baş başa çalıştırılıp
ürettiği çerçevelerin doğru çözüldüğü doğrulanır (çip saf C, test köprüsü C++):

```bash
cd test
g++ -std=gnu++17 -I. -I.. -I../.. emulator_testi.cpp -o emulator_testi && ./emulator_testi
```

Doğrulananlar: 16 hücre + 4 sensör + çevrim çözümü, gerilimin hücre toplamıyla
tutarlılığı, 4. sensörün "bağlı değil" (−40) gelmesi, sağlıklıyken H01 olmaması
ve arıza düğmesiyle hücre 7 ayrışınca farkın 80 mV'u aşıp H01 üretilmesi.

## Not: 403 alıyorsan

`CIHAZ_ID`/`CIHAZ_ANAHTARI`, `/de/cihaz/uret`'in döndürdüğüyle birebir aynı
olmalı ve cihaz `dennis-cihazlar` tablosunda bulunmalı. Firmware 403'ü seri portta
açıkça söyler.
