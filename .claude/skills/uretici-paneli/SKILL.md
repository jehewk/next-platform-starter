---
name: uretici-paneli
description: Dennis Energy uygulamaları (panel-uretici/ ve panel-musteri/) üzerinde çalışırken kullan — yeni sayfa, bileşen, grafik ekleme, tasarım düzenleme, backend veri sözleşmesi veya uygulamaları çalıştırıp uçtan uca doğrulama. Tema belirteçlerini, ortak bileşenleri ve test düzeneğini açıklar.
---

# Dennis Energy uygulamaları — çalışma kuralları

İki ayrı proje: `panel-uretici/` (teknisyen) ve `panel-musteri/` (ev sahibi).
React + Vite + Tailwind 3; kök dizindeki Next.js projesinden bağımsızdır.
Ortak dosyalar (istemci.js, oturum.js, servis.js, yardimci.js, Modal, Toast,
Kart, Rozet, Intro, Logo) iki projede kopya olarak durur — birinde düzeltilen
hata diğerinde de düzeltilmeli. Mimari ve yayın: kök `YAYIN.md`.

## Tasarım sistemi

- Renkler yalnızca belirteçlerden gelir: `zemin, panel, panel2, cizgi, metin, soluk,
  sonuk, vurgu, saglikli, uyari, kritik, bilgi`. Değerleri `src/index.css`
  (`:root[data-tema=…]`) tanımlar. Sabit hex (`#fff`, `bg-white`, `text-gray-…`) yazma;
  açık temayı bozar. Recharts/Leaflet gibi sınıf alamayan yerlerde
  `useGrafikRenkleri()` (bilesenler/Grafik.jsx) kullan.
- Durum renkleri yalnızca durum bildirir, süsleme için kullanılmaz. Durum → sınıf için
  `DURUM_YAZI`, sağlık → durum için `saglikDurumu()` (eşikler ayarlanabilir).
- Hazır sınıflar (index.css): `girdi`, `etiket`, `dugme-ana`, `dugme-ikincil`,
  `dugme-hayalet`, `dugme-tehlike`, `cip-aktif`, `cip-pasif`, `tablo`.
- Ortak bileşenler: `SayfaBasligi`, `Kart`, `OlcumSeridi` + `Olcum`, `Bos` (Kart.jsx);
  `Rozet`, `SaglikCubugu`; `Modal`; `Iskelet`, `SatirIskelet`, `HataKutusu`.
- Her sayfa: `SayfaBasligi` → filtre satırı (cip + arama) → `Kart` içinde içerik.
  Yükleniyor / hata / boş durumlarının üçü de ele alınır.
- Gradyan, parlama, emoji, "AI" süsü ekleme. Sade, yoğun, okunur (Linear / Vercel
  tarzı) kal. Tek istisna: marka açılışı (Intro.tsx, siyah zemin + beyaz DE logosu,
  oturum başına bir kez) — ürün sahibinin isteğidir, kaldırma.
- Logo tek kaynaktan: `marka/logo.svg`; ikon/kapak için `node marka/ikon-uret.mjs`.
- Müşteri uygulamasında teknik ayrıntı gösterme; `veri/sadeDil.js` üzerinden anlat.
  Dokunma hedefleri en az 44 px; alt sekme çubuğu ve güvenli alan boşlukları korunur.
- Grafikler: tek eksen, ince işaretler, tek seride lejant yok, eşik çizgisi etiketli,
  `isAnimationActive={false}`, ipucu için `Ipucu` bileşeni.
- Metinler Türkçe; kod adları mevcut Türkçe adlandırmayı izler.

## Veri

- Sayfalar yalnızca `src/api/servis.js` fonksiyonlarını çağırır (`useVeri` / `useCanli`).
- Yalnızca DEVIR.md §3'te listelenen uçları kullan. Listede olmayan bir uç gerekiyorsa
  backend eki yaz (`aws/ekler/`) ve bunu açıkça belirt; uydurma uç çağırma.
- Uygulamada demo/örnek veri YOK. Test için `test/sahte-api.mjs` (uygulama klasörlerinin dışında)
  backend şeklinde yanıt verir; yeni uç eklersen oraya da ekle.
- Backend zamanı UTC ama `Z` eki yok: her zaman `utcTarih()` ile oku.

## Doğrulama

```bash
(cd panel-uretici && npx vite build && npx oxlint)
(cd panel-musteri && npx vite build && npx oxlint)
node test/e2e.mjs <ekran-klasoru>   # iki uygulama, sahte API, masaüstü + 390 px
```

`e2e.mjs` giriş formunu kaptcha dahil doldurur, işlemleri (yeni müşteri, garanti
kararı, destek talebi, kayıt) gerçekten yapar ve JS hatası, yatay taşma, ekranda
"NaN/undefined" arar. Değişen ekranın görüntüsüne mutlaka bak — "derlendi" ≠
"çalışıyor" (DEVIR §8).
