# Akü izleme firmware'i (ESP32) — Wokwi

ESP32, BMS'i saniyede bir okur ve belirli aralıklarla ölçümü
`POST /de/aku/veri` ile backend'e gönderir. Paket, DEVIR.md §4'teki veri
sözleşmesine birebir uyar. Eski `sketch.ino` Inverter AI protokolünü
(`/inverter/veri`, `inverter_id`, `hucre_fark`) kullanıyordu ve 403 alıyordu;
bu klasör onun yerine geçer.

## Wokwi'de çalıştırma

1. wokwi.com → yeni **ESP32** projesi.
2. Bu klasördeki dosyaları projeye ekle: `sketch.ino`, `diagram.json`,
   `libraries.txt` ve tüm `.h` dosyaları (`ayarlar.h`, `olcum.h`,
   `aku_model.h`, `direnc.h`, `paket.h`, `sertifika.h`, `daly_bms.h`).
3. `ayarlar.h` içinde `CIHAZ_ID` ve `CIHAZ_ANAHTARI`'nı gerçek bir cihaz
   kaydıyla değiştir (aşağıya bak). Değiştirilmezse firmware **kuru çalışır**:
   paketi seri porta basar, sunucuya göndermez.
4. Başlat. Seri monitörde her 5 sn'de durum satırı, her 30 sn'de gönderilen
   paket ve sunucu yanıtı görünür.

| Parça | Görevi |
|---|---|
| Sol potansiyometre (GPIO34) | Akım isteği: sol uç −60 A deşarj, orta boşta, sağ uç +60 A şarj |
| Sağ potansiyometre (GPIO35) | Ortam sıcaklığı −10…50 °C |
| Kırmızı düğme (GPIO25) | Arıza senaryosu: hücre 7 her ölçümde biraz daha ayrışır, iç direnci artar |
| Yeşil / kırmızı LED (GPIO26/27) | Son gönderim başarılı / başarısız |

Wokwi'de saat 20 kat hızlı akar: 30 sn'lik her gönderim sahadaki ~10 dakikalık
değişime karşılık gelir. Arıza düğmesine basıldıktan ~7 dakika sonra hücre farkı
80 mV'u aşar ve pakette `H01` uyarısı çıkar.

### Cihaz kimliği nereden gelir

Backend `cihaz_id` + `anahtar` çiftini `dennis-cihazlar` tablosunda arar
(`de_anahtar_dogrula`). Çift, üretim hattında `POST /de/cihaz/uret` ile
(üretim anahtarıyla) oluşturulur. Test için bir akü kaydı üretip dönen değerleri
`ayarlar.h`'ye yaz. Yanlış çift → `403 Cihaz dogrulanamadi`; firmware bunu seri
portta açıkça söyler.

## Gönderilen paket

```json
{
  "cihaz_id": "AKU-…", "anahtar": "…",
  "gerilim": 52.61, "akim": -40.0, "soc": 68.4, "cevrim": 12,
  "hucreler": [3286, 3287, …],          // 16 hücre, mV
  "sicakliklar": [29, 31, 29, -40],     // °C; −40 = sensör bağlı değil
  "sarj_mos": true, "desarj_mos": true,
  "hata_kodlari": [{"kod": "H01", "mesaj": "…", "seviye": "uyari"}],
  "ic_direnc": 0.00971                  // Ω, yalnızca taze tahmin varsa
}
```

- **Akım işareti:** + şarj, − deşarj (Daly ile aynı).
- **Zaman damgası yok:** backend alış anını kaydeder. Bu yüzden gönderilemeyen
  ölçümler biriktirilip sonradan gönderilmez; yanlış zamana yazılırdı.
- **İç direnç:** akım bir okumadan diğerine en az 10 A sıçradığında
  `|ΔV/ΔI|` ile ölçülür, son 5 ölçümün ortancası gönderilir. Taze ölçüm yoksa
  alan hiç eklenmez; uydurma değer, backend'in direnç eğilimini bozar.
- **Hata kodları:** `H01` hücre farkı (≥80 mV uyarı, ≥150 mV kritik),
  `H02/H03` hücre aşırı/düşük gerilim koruması, `T01` yüksek sıcaklık,
  `T02` aşırı sıcaklık koruması, `T03` soğukta şarj engeli, `A01/A02` aşırı
  akım, `B01` BMS donanım arızası. Aynı kod bir pakette bir kez yer alır.

## Sahada (gerçek Daly BMS)

`ayarlar.h`'de `KAYNAK_SIMULASYON 0` yap. Daly UART'ı GPIO16 (RX) / GPIO17 (TX),
9600 baud. Gönderim aralığı otomatik olarak 10 dakikaya çıkar. Daly okuyucu
(`daly_bms.h`) protokol belgesine göre yazıldı ve sahte bir BMS ile test edildi,
ama **gerçek Daly ile henüz denenmedi**. İlk bağlantıda `DALY_HATA_AYIKLA`
tanımlayıp ham çerçeveleri kontrol et.

## TLS

Sunucu sertifikası `sertifika.h`'deki kök sertifikalarla (Amazon Root CA 1,
Starfield Services Root G2) doğrulanır. `setInsecure()` kullanılmaz; cihaz
anahtarı açık ağda taşınıyor.

## Testler (bilgisayarda, ESP32 gerekmez)

Firmware'in simülatör ve paket kodu Arduino'ya bağımlı değildir, host'ta derlenir.
[ArduinoJson](https://github.com/bblanchon/ArduinoJson) 7 kaynağı gerekir.

```bash
# 1) Senaryo boyunca üretilen paketler backend §4 mantığından geçiyor mu?
g++ -std=c++17 -I. -I<ArduinoJson>/src test/paket_testi.cpp -o paket_testi
./paket_testi | python3 test/sozlesme_kontrol.py

# 2) Daly UART ayrıştırıcısı sahte BMS ile
g++ -std=gnu++17 -Itest/sahte_daly -I. test/daly_testi.cpp -o daly_testi && ./daly_testi
```

`sozlesme_kontrol.py`, backend'deki alma kodunun kopyasını her pakete uygular.
Ayrıca senaryonun beklenen olayları ürettiğini denetler: iç direnç tahmini,
arızada `H01` ve hücre 7'nin en düşük hücre olarak bulunması, boşalınca deşarj
kesilmesi (`H03`), sıcakta şarj kesilmesi (`T02`).
