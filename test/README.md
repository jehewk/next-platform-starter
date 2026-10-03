# Testler

Uygulamaya dahil değildir; yalnızca doğrulama içindir. Tümünü çalıştırmak için:

```bash
node test/calistir.mjs           # hızlı: ayrıştırıcı + backend (saniyeler)
node test/calistir.mjs --hepsi   # + uçtan uca tarayıcı testi (Playwright gerekir)
```

Gerekli araç yoksa (python3, Playwright) o test atlanır, diğerleri çalışır.

## Neler sınanıyor

| Dosya | Kapsam |
|---|---|
| `ayristirici.mjs` | Sohbet niyet çözümü (77 ifade): veri soruları yerelde mi, genel sorular dil modeline mi, sağlık geçmişi, zaman aralıkları |
| `backend/test_backend.py` | **API + güvenlik + veri akışı + dayanıklılık + yük.** `aws/ekler/yamala.py`'nin gerçek yamalarını örnek backend'e uygular, bellekteki AWS ile sınar |
| `e2e.mjs` + `sahte-api.mjs` | Uçtan uca: iki uygulama Playwright ile sürülür, API sahte backend'den gerçek veri biçiminde yanıtlanır; ekran görüntüleri `test/ekranlar/` |

### `backend/test_backend.py` ayrıntı

Gerçek `lambda_function.py` AWS'dedir, bu depoda yoktur. `ornek-backend.py`
backend'in DEVIR.md'deki davranışını temsil eder; test ona **gerçek yamaları**
(`aws/ekler/yamala.py`, `hesap.py`) uygular, böylece hem yamalar hem de yamalı
davranış sınanır. Bellekteki sahte AWS: `sahte_aws.py`.

- **Yetki**: oturumsuz → 401; müşteri üretici-only uçta → 403; müşteri yalnız kendi
  cihaz/müşteri kayıtlarını görür; başkasının cihazına erişemez (404); cihaz anahtarı
  (sır) panoya sızmaz.
- **Veri akışı**: cihaz ölçümü yanlış anahtarla reddedilir; doğru anahtarla doğru
  tabloya yazılır; türetilmiş alanlar (hücre farkı, en düşük hücre no, sıcaklık)
  hesaplanır; cihazın son_veri/sağlık alanı güncellenir; pano en yeni ölçümü ve
  geçmişi doğru cihazdan okur; özet sayıları doğru.
- **Güvenlik**: hesap silme şifre ister ve yalnız müşteriye açıktır; şifremi unuttum
  hesap varlığını açığa vurmaz; bildirim aboneliği yalnız bilinen push sunucularını
  kabul eder (SSRF/metadata adresleri reddedilir).
- **Dayanıklılık**: bozuk/null/dizi gövde → 400; eksik alan → 400; SQL/script/şablon
  enjeksiyonu benzeri dizgeler veri olarak saklanır, süzmeyi bozmaz; uç değerler çökmez.
- **Yük**: 60 cihaz + 200 ölçüm, sayfalı `scan` altında özet doğru toplanır (ilk
  sayfayla yetinmez), müşteri izolasyonu korunur.

> Not: gerçek `lambda_function.py`'nin tüm `scan` çağrılarını sayfalaması (ör. `_tara`
> deseni) gerekir; aksi halde cihaz sayısı arttığında pano eksik sayar. Örnek backend
> bu deseni kullanır ve test doğrular — gerçek backend'de de uygulandığını doğrulayın.
