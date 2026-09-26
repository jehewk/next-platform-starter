---
name: uretici-paneli
description: Dennis Enerji üretici paneli (panel-uretici/) üzerinde çalışırken kullan — yeni sayfa, bileşen, grafik ekleme, tasarım düzenleme veya paneli çalıştırıp ekran görüntüsüyle doğrulama. Tema belirteçlerini, ortak bileşenleri ve demo modunu açıklar.
---

# Üretici paneli — çalışma kuralları

Panel `panel-uretici/` altında, React + Vite + Tailwind 3. Kök dizindeki Next.js
projesinden bağımsızdır; komutları `panel-uretici/` içinde çalıştır.

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
- Gradyan, parlama, emoji, animasyonlu giriş ekranı, "AI" süsü ekleme. Sade, yoğun,
  okunur (Linear / Vercel tarzı) kal.
- Grafikler: tek eksen, ince işaretler, tek seride lejant yok, eşik çizgisi etiketli,
  `isAnimationActive={false}`, ipucu için `Ipucu` bileşeni.
- Metinler Türkçe; kod adları mevcut Türkçe adlandırmayı izler.

## Veri

- Sayfalar yalnızca `src/api/servis.js` fonksiyonlarını çağırır, `useVeri` ile.
- Yeni bir uç eklersen `src/api/demo.js` içine aynı şekilde demo yanıtı da ekle.

## Doğrulama

```bash
cd panel-uretici
npm install
npx vite build && npx oxlint
npx vite --port 5173   # arka planda
```

Tarayıcıda `/giris` → "Demo verisiyle incele" ile gir ve değişen sayfanın ekran
görüntüsünü al (Playwright, Chromium `/opt/pw-browsers` altında). Hem koyu hem açık
temada ve 390px genişlikte yatay kaydırma olmadığını kontrol et.
