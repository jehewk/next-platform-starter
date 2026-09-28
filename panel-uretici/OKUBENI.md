# Dennis Enerji — Üretici Paneli

Akü ve inverter üretimi için izleme, arıza kaynağı analizi ve ürün takip paneli.
React + Vite + Tailwind ile yazılmıştır. Varsayılan tema koyudur; açık tema
Ayarlar'dan seçilir.

## Çalıştırma

Node.js kurulu olmalı (nodejs.org → LTS).

```bash
npm install      # bağımlılıkları kur (bir kez)
cp .env.example .env
npm run dev      # geliştirme sunucusu → http://localhost:5173
npm run build    # dağıtım için derle → dist/
npm run lint     # oxlint
```

Uygulamada demo veri yoktur; her ekran gerçek backend'den okur. Backend olmadan
denemek için kök dizinde `node test/e2e.mjs` çalıştırın: API çağrıları
`test/sahte-api.mjs` ile yanıtlanır (yalnızca test için, uygulamaya girmez).
Mobil mağaza sürümü ve yayın adımları: kök dizindeki `YAYIN.md`.

Windows'ta `npm` çalışmazsa `npm.cmd` kullanın veya:
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## Bölümler

| Bölüm | İçerik |
|---|---|
| Genel Bakış | KPI kartları, saha haritası, müdahale kuyruğu, ürün durumu, parti arıza oranı, müşteriler |
| Harita | Kurulu sistemler; renk o adresteki en kötü cihazın durumu |
| Arızalar | Öngörülen arızalar + kaynak analizi (üretim / kullanım / dış etken) |
| Aküler / İnverterler | Üretilen tüm cihazlar; filtre, arama, sıralama, CSV; satırdan garanti talebi açma |
| Üretim | Parti bazında üretilen/sevk/depo/kurulu ve arıza oranı |
| Müşteriler | Yeni müşteri, sıralama, CSV; durum en kötü cihazdan; detayda **Düzenle** |
| Başvurular | Müşteri uygulamasından gelen kayıtları onaylama / reddetme |
| Garanti | Talepleri değerlendirme (kaynak + karar, sistem önerisiyle), garanti süreleri |
| Sohbet | Sistem verisine soru-cevap; konuşma geçmişi, yeniden adlandırma, silme |
| Ayarlar | Profil, tema, tablo yoğunluğu, sağlık eşikleri, bildirim tercihleri |

Kısayollar: **⌘K / Ctrl+K** arama (sayfa, seri no, parti, müşteri),
**⌘J / Ctrl+J** her sayfadan açılan sohbet çekmecesi.

## Klasör yapısı

```
src/
  api/
    istemci.js      Backend çağrıları — token ekler, 401'de yeniler
    oturum.js       Giriş, token saklama/yenileme
    servis.js       Backend (snake_case) ↔ arayüz (camelCase) adaptörü
    asistan.js      Sohbet yanıtları (uzak uç ya da yerel motor)
    sohbetler.jsx   Sohbet geçmişi (localStorage)
    ayarlar.jsx     Kullanıcı tercihleri (localStorage)
    useVeri.js      {veri, yukleniyor, hata, yenile} kancası
  bilesenler/       Kenar menü, üst çubuk, arama paleti, kart, rozet, modal, sohbet
  sayfalar/         Yukarıdaki bölümler
  veri/yardimci.js  Saf yardımcılar (durum adları, eşikler, tarih biçimleri)
```

## Backend notları

Kullanılan uçlar yalnızca DEVIR.md §3'teki listedendir, tek istisna:

- **Müşteri düzenleme** `POST /de/musteri/guncelle` — backend eki
  `aws/ekler/musteri_guncelle.py`. Eklenene kadar kaydet sunucu hatası gösterir.
- `/de/cihaz/uret` panelden çağrılmaz: üretim anahtarıyla doğrulanır ve bu
  anahtar tarayıcıya konamaz; üretim hattı kaydı hattaki cihazdan yapılır.
- Zaman damgaları UTC'dir ama `Z` eki olmadan gelir; `utcTarih()` bunu düzeltir
  (yoksa Türkiye'de "son ölçüm" 3 saat kayık görünürdü).
- **Sohbet**: `VITE_ASISTAN_YOLU` tanımlıysa sorular oraya gönderilir
  (`POST {soru, gecmis} → {yanit}`); dil modeli API anahtarı sunucuda kalmalıdır.
  Tanımlı değilse sistem verisi üzerinde çalışan yerel motor yanıtlar.
- Cihaz listesi `kalan_gun` ve `guven` alanlarını gönderirse müdahale
  kuyruğunda kalan süre de görünür.

## Renk kuralı

Renk anlam taşır: yeşil sağlıklı, sarı izlemede, kırmızı kritik/arızalı,
mavi sevkte, gri depoda/veri yok. Eşikler Ayarlar → Sağlık eşikleri'nden
değiştirilir (varsayılan 85 / 65).
