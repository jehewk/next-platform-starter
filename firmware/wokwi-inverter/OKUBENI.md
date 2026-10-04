# İnverter izleme firmware'i (ESP32) — Wokwi

ESP32, inverteri saniyede bir okur ve belirli aralıklarla ölçümü
`POST /de/inverter/veri` ile backend'e gönderir. Paket, panelin okuduğu veri
sözleşmesine (`servis.js` → `inverterDetayUyarla`) birebir uyar. Akü firmware'inin
(`../wokwi-aku`) inverter karşılığıdır.

## Wokwi'de çalıştırma

1. wokwi.com → yeni **ESP32** projesi.
2. Bu klasördeki dosyaları projeye ekle: `sketch.ino`, `diagram.json`,
   `libraries.txt` ve tüm `.h` dosyaları (`ayarlar.h`, `olcum.h`,
   `inverter_model.h`, `paket.h`, `sertifika.h`).
3. `ayarlar.h` içinde `CIHAZ_ID` ve `CIHAZ_ANAHTARI`'nı gerçek bir cihaz
   kaydıyla değiştir (aşağıya bak). Değiştirilmezse firmware **kuru çalışır**:
   paketi seri porta basar, sunucuya göndermez.
4. `ANMA_GUC_KW`'yi inverterin etiket gücüyle değiştir (öntanımlı 5 kW).
5. Başlat. Seri monitörde her 5 sn'de durum satırı, her 30 sn'de gönderilen
   paket ve sunucu yanıtı görünür.

| Parça | Görevi |
|---|---|
| Sol potansiyometre (GPIO34) | Yük oranı: sol uç %0 (boşta), sağ uç %100 (tam yük) |
| Sağ potansiyometre (GPIO35) | Ortam sıcaklığı −10…50 °C |
| Kırmızı düğme (GPIO25) | Arıza senaryosu: kondansatör/IGBT yaşlanması kademeli ilerler |
| Yeşil / kırmızı LED (GPIO26/27) | Son gönderim başarılı / başarısız |

Wokwi'de saat 120 kat hızlı akar: bir simüle "gün" ~6 dakikada dolar, böylece
`gunluk_kwh` sayacının birikip gün dönümünde sıfırlandığını görebilirsin.

### Cihaz kimliği nereden gelir

Backend `cihaz_id` + `anahtar` çiftini `dennis-cihazlar` tablosunda arar
(`_cihaz_dogrula`). Test için bir **inverter** kaydı üret ve anahtarını al:

```powershell
cd C:\dennis\aws
.\cihaz-uret.ps1 -Tip inverter
```

Betik `ayarlar.h`'ye yapıştıracağın `CIHAZ_ID` + `CIHAZ_ANAHTARI` satırlarını basar.
Yanlış çift → `403 Cihaz dogrulanamadi`; firmware bunu seri portta açıkça söyler.

## Gönderilen paket

```json
{
  "cihaz_id": "INV-…", "anahtar": "…",
  "igbt": 65.3, "sogutucu": 53.1,        // °C
  "dc_gerilim": 394.0, "ac_gerilim": 228.0, "frekans": 49.98,
  "guc_faktoru": 0.98, "thd": 3.1,       // 0–1 ; %
  "gunluk_kwh": 42.7,                     // gün içi kümülatif
  "hata_kodlari": [{"kod": "K01", "mesaj": "…", "seviye": "uyari"}]
}
```

- **Zaman damgası yok:** backend alış anını (UTC) kaydeder. Bu yüzden
  gönderilemeyen ölçümler biriktirilip sonradan gönderilmez; yanlış zamana
  yazılırdı.
- **`gunluk_kwh`** gün içi kümülatif sayaçtır; panel aynı günün ölçümlerinden
  **en büyüğünü** o günün üretimi sayar (`uretimGecmisiGetir`). Gün dönümünde
  sıfırlanır.
- **Hata kodları:** `T01` IGBT yüksek, `T02` IGBT kritik, `K01/K02` harmonik
  bozulma (kondansatör ESR), `G01` güç faktörü düşük, `S01` IGBT-soğutucu farkı
  yüksek (soğutma zayıf). Aynı kod bir pakette bir kez yer alır.

## Fizik motoruyla ilişki

Paketteki alanlar fizik motorunun `igbt_termal_yorulma`, `kondansator_esr` ve
`guc_kisitlama` mekanizmalarını besler. Motorun `kopru_dengesizligi` (faz kolu
sıcaklıkları) ve bazı güç alanları gibi **daha zengin girdileri** bugün backend
alımında saklanmıyor; bu yüzden paket de göndermiyor. Köprü sıcaklığı sensörü
eklenince hem alım ucu hem bu paket genişletilmeli (bkz.
`../../backend/motor/KALIBRASYON.md` §5).

## Sahada (gerçek inverter)

`ayarlar.h`'de `KAYNAK_SIMULASYON 0` yapılınca firmware şu an derlenmez (`#error`):
gerçek inverter okuması (çoğu LiFePO4 inverteri Modbus/RS485 veya üretici
protokolü) henüz yazılmadı. Eklenince `inverter_model.h` yerine bir okuyucu
modülü (`InverterOlcum` dolduran) konup bu satır kaldırılır.

## TLS

Sunucu sertifikası `sertifika.h`'deki kök sertifikalarla (Amazon Root CA 1,
Starfield Services Root G2) doğrulanır. `setInsecure()` kullanılmaz; cihaz
anahtarı açık ağda taşınıyor.

## Testler (bilgisayarda, ESP32 gerekmez)

Simülatör ve paket kodu Arduino'ya bağımlı değildir, host'ta derlenir.
[ArduinoJson](https://github.com/bblanchon/ArduinoJson) 7 kaynağı gerekir.

```bash
cd test
g++ -std=c++17 -I.. -I<ArduinoJson>/src paket_testi.cpp -o paket_testi
./paket_testi | python3 sozlesme_kontrol.py
```

`sozlesme_kontrol.py`, backend'in alma mantığını her pakete uygular ve senaryonun
beklenen olaylarını denetler: `gunluk_kwh` birikimi ve gün dönümünde sıfırlanması,
yükle IGBT ısınması, arızada THD (`K01/K02`), güç faktörü düşüşü (`G01`) ve
soğutma zayıflaması (`S01`).
