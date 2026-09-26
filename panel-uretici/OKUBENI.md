# Dennis Energy — Üretici Paneli

Akü ve inverter üretimi için izleme, arıza kaynağı analizi ve ürün takip paneli.
React + Vite ile yazılmıştır.

## Çalıştırma

Node.js kurulu olmalı (nodejs.org → LTS).

```bash
npm install      # bağımlılıkları kur (bir kez)
npm run dev      # geliştirme sunucusu → http://localhost:5173
npm run build    # dağıtım için derle → dist/
```

Windows'ta `npm` çalışmazsa `npm.cmd` kullanın veya:
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## Bölümler

| Bölüm | İçerik |
|---|---|
| Genel İzleme | Tüm ürünlerin durumu, harita, müdahale kuyruğu, müşteri özetleri |
| Harita | Kurulu akü ve inverterler; akü dolu daire, inverter kesikli daire |
| Müşteriler | Kurulu sistemler; her müşterinin aküleri ve inverterleri ayrı |
| Aküler | Üretilen tüm aküler — sahada, depoda, sevkte |
| İnverterler | Üretilen tüm inverterler |
| Arızalar | Öngörülen arızalar + kaynak analizi (üretim / kullanım / dış etken) |
| Garanti | Garanti süreleri ve talepler |
| Üretim | Parti bazında üretilen/sevk/depo/kurulu, arıza oranı, karekod akışı |
| Asistan | Sistem verisine dayalı soru-cevap |

## Klasör yapısı

```
src/
  api/
    oturum.js       Cognito giriş, token saklama ve yenileme
    istemci.js      API çağrıları — token ekler, 401'de yeniler
  veri/
    ornekVeri.js    Geçici örnek veri. Gerçek uç noktalar hazır olunca
                    yalnızca bu dosya değişir; ekranlar aynı kalır.
  bilesenler/       Kenar menü, kart, rozet
  sayfalar/         Yukarıdaki bölümler
```

## Gerçek veriye geçiş

`src/veri/ornekVeri.js` şu an sabit veri döndürür. Backend hazır olduğunda
bu dosyadaki fonksiyonlar `src/api/istemci.js` çağrılarıyla değiştirilir:

```js
import { getir } from "../api/istemci";
export const cihazlariGetir = () => getir("/cihaz/liste");
```

## Asistan hakkında

Asistan şu an sistem verisi üzerinde çalışan yerel bir yanıt motoru kullanır
(`yanitla` fonksiyonu, Asistan.jsx içinde). Serbest konuşma için bir dil modeli
bağlantısı gerekir; bu bağlantı API anahtarı sunucu tarafında tutulacak şekilde
yapılandırılmalıdır — anahtar tarayıcıya konmamalıdır.

## Renk kuralı

Renk anlam taşır: yeşil aktif, sarı izlemede, kırmızı arızalı, gri depoda.
