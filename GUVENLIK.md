# Güvenlik — test ve sertleştirme notları

Bu dosya, sistemin güvenlik/dayanıklılık test kapsamını ve canlı için
sertleştirme önerilerini tutar. Amaç övmek değil; açık çıkarsa yazmak.

## Otomatik saldırı bataryası (kod seviyesinde, mock backend)
`test/backend/test_guvenlik.py` — yamala'lı backend kopyasına karşı koşar
(gerçek Lambda ile aynı yama zinciri). Kapsanan saldırılar:
- **Bozuk/tip-karışık gövde** (geçersiz JSON, dizi/metin/sayı/null) → 400,
  asla 500/çökme.
- **IDOR** — müşteri başka müşterinin cihazına (detay/geçmiş) ve depodaki
  cihaza erişemiyor → 404.
- **cihaz_id enjeksiyon** (SQL-vari, path, null bayt, 5000 kr) → 404/200,
  çökme yok (boto3 parametreli).
- **Cihaz anahtarı baypası** — yanlış/boş/eksik anahtar → 403, kayıt yazılmaz.
- **Eşleşme kodu IDOR (spoof)** — müşteri gövdeye başka `musteri_id` yazsa da
  kod yalnız oturum sahibine bağlanıyor.
- **Aşırı büyük gövde** (20k hücre) → güvenli işlenir, 500 yok.

Ayrıca `test_backend.py`: oturum/rol (401/403), müşteri izolasyonu, cihaz
anahtarının panoya sızmaması, bildirim SSRF, yük altında izolasyon, sayfalama.

Sonuç (bu tur): **kritik açık bulunmadı.** Derinlemesine savunma olarak
`/de/kurulum/basla` sertleştirildi — `musteri_id` artık yalnız oturum
kimliğinden alınır, istemci gövdesine güvenilmez (latent IDOR kapatıldı).

Çalıştırma:
```
cd test/backend
python3 test_guvenlik.py   # 6 kontrol
python3 test_backend.py    # 33 kontrol
```

## Canlı yük/gecikme probu (kontrollü)
`aws/yuk-testi.ps1` — canlı API'ye KÜÇÜK, kontrollü yük gönderir; gecikme
(min/ort/p95/max) ve hata oranı raporlar. **Agresif değer kullanma** (maliyet
+ kötüye-kullanım). Ciddi eşzamanlı stres için k6 (betikte örnek).

> Not: Üretim API'sine buradan (CI/bulut) otomatik DoS YAPILMADI — bilerek.
> Prod müşteri-gören sistem; yükü sen, küçük adımlarla, bilerek ver.

## Canlı sertleştirme — DURUM
Tek betikle uygulanır: **`aws/guvenlik-sertlestir.ps1`** (idempotent).
- **API Gateway throttle** ✅ betikte — stage default rate/sn + burst
  (varsayılan 10k/sn yerine makul sınır).
- **AWS WAF (REGIONAL)** ✅ betikte — IP başına rate-based kural + API
  stage'ine bağlama.
- **Lambda reserved concurrency** ✅ betikte (best-effort; hesap limiti
  elverirse).
- **Güvenlik başlıkları (CSP/HSTS/X-Frame/Referrer/Permissions)** ✅
  `panel-*/public/customHttp.yml` → Amplify yayınında etkin. Web yeniden
  yayınlanınca (`hepsini-kur.ps1 -Atla backend,hesap,lambda`) devreye girer.
- **Cognito** — giriş hızı sınırlı + kaptcha (hazır).
- **DynamoDB** — PAY_PER_REQUEST otomatik ölçek (hazır).
- **CloudWatch alarm** — `aws/izleme-kur.ps1` (hazır).
- **IAM** — yönetici kullanıcı yapıldı; root anahtarı silme lansman öncesi
  (BEKLEYENLER.md).

Çalıştırma:
```
cd aws
.\guvenlik-sertlestir.ps1
.\hepsini-kur.ps1 -Atla backend,hesap,lambda   # güvenlik başlıklarını yayınla
```

## Dashboard (ön yüz)
- Statik React (Amplify, HTTPS). XSS yüzeyi düşük (React varsayılan kaçışlı;
  `dangerouslySetInnerHTML` kullanılmıyor).
- Tüm hassas işlem backend'de yetki kontrollü; ön yüz yalnız kendi verisini
  görür (izolasyon testlerle doğrulandı).
- Güvenlik başlıkları `customHttp.yml` ile eklendi (CSP/HSTS/X-Frame/...).
  CSP bir şeyi kırarsa connect-src/img-src genişletilir ya da CSP satırı
  geçici kaldırılır (dosyada not var).
