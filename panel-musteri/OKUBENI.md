# Dennis Energy — Müşteri Uygulaması

Ev ve işletme sahipleri için: akünün ve inverterin anlık durumu, sağlıkları,
güneş üretimi, sohbet ve destek talepleri. Telefon öncelikli; tarayıcıdan
kurulabilir (PWA), App Store ve Google Play için Capacitor ile paketlenir
(kök dizindeki `YAYIN.md`).

```bash
cp .env.example .env && npm install && npm run dev   # http://localhost:5174
```

## Ekranlar

| Sekme | İçerik |
|---|---|
| Sistemim | Genel durum (en kötü cihazdan), akü şarjı ve enerji yönü (şarj / eve enerji / bekleme, kW), bugünkü ve 7 günlük üretim. 30 sn'de bir, yalnızca uygulama açıkken yenilenir; 30 dk'dır ölçüm gelmeyen cihaz için uyarı |
| Cihazlar | Kendi aküleri ve inverterleri, sade dilde durum |
| Cihaz detayı | Şarj, kalan enerji, sıcaklık, çevrim, garanti, 14 günlük üretim, bu cihaz için destek iste |
| Sohbet | Kendi cihazlarının son ölçümleriyle sade dilde yanıt (`VITE_ASISTAN_YOLU` ile dil modeli bağlanabilir) |
| Destek | Destek / garanti talebi açma ve taleplerin durumu |
| Hesabım | Profil, tema, çıkış, hesap silme bağlantısı |

Giriş ekranından **kayıt başvurusu** yapılır (`/de/musteri/kayit`); hesap üretici
panelindeki Başvurular sayfasından onaylanınca açılır.

## Veri

- Tüm çağrılar müşteri oturumuyla yapılır; backend veriyi bu müşteriye süzer
  (DEVIR §3). Uygulama ayrıca filtre göndermez.
- Teknik gerekçe (hücre no, mV, IGBT) gösterilmez; `veri/sadeDil.js` aynı veriyi
  müşterinin diline çevirir. Tanınmayan bir mekanizmada, cihaz kritikse
  "endişelenmeyin" yerine "ekibimiz ilgileniyor" denir.
- Zaman damgaları UTC (eki olmadan) gelir; `utcTarih()` ile okunur.
