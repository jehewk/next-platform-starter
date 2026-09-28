// DE logosundan tüm uygulama görsellerini üretir.
//   node marka/ikon-uret.mjs          (Playwright + Chromium gerekir)
//
// Çıktılar her uygulamanın public/ klasörüne yazılır:
//   favicon.svg, ikon-192.png, ikon-512.png, ikon-maskable-512.png,
//   apple-touch-icon.png, kapak.png (1200×630, paylaşım önizlemesi)
//   ve Capacitor için marka/cikti/ altına mağaza ikonu + açılış görseli.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const kok = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(join(execSync("npm root -g").toString().trim(), "playwright")); }

const isaret = readFileSync(join(kok, "logo.svg"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "")
  .match(/<g[\s\S]*<\/g>/)[0];

// oran: işaretin kare içindeki genişliği (maskable için güvenli alan %80 → işaret ~%52)
const ikonSvg = ({ boyut, oran, koseOran = 0 }) => {
  const s = boyut * oran;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${boyut}" height="${boyut}" viewBox="0 0 ${boyut} ${boyut}">
    <rect width="${boyut}" height="${boyut}" rx="${boyut * koseOran}" fill="#000"/>
    <svg x="${(boyut - s) / 2}" y="${(boyut - s) / 2}" width="${s}" height="${s}" viewBox="0 0 206 210">${isaret}</svg>
  </svg>`;
};

const UYGULAMALAR = [
  { klasor: "panel-uretici", alt: "Üretici Paneli" },
  { klasor: "panel-musteri", alt: "Enerji sisteminiz, cebinizde" },
];

const kapakHtml = (alt) => `<html><body style="margin:0;width:1200px;height:630px;background:#000;display:flex;
  align-items:center;justify-content:center;gap:56px;font-family:Inter,Helvetica,Arial,sans-serif;color:#fff">
  <svg width="220" height="224" viewBox="0 0 206 210">${isaret}</svg>
  <div><div style="font-size:76px;font-weight:700;letter-spacing:-2px">Dennis Energy</div>
  <div style="margin-top:14px;font-size:34px;color:#A1A1AA">${alt}</div></div></body></html>`;

const tarayici = await playwright.chromium.launch();
const sayfa = await tarayici.newPage();

async function png(html, w, h, yol) {
  await sayfa.setViewportSize({ width: w, height: h });
  await sayfa.setContent(html.startsWith("<svg") ? `<html><body style="margin:0">${html}</body></html>` : html);
  mkdirSync(dirname(yol), { recursive: true });
  writeFileSync(yol, await sayfa.screenshot({ omitBackground: false, clip: { x: 0, y: 0, width: w, height: h } }));
  console.log("  ", yol.replace(kok + "/../", ""));
}

for (const u of UYGULAMALAR) {
  const pub = join(kok, "..", u.klasor, "public");
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, "favicon.svg"), ikonSvg({ boyut: 64, oran: 0.72, koseOran: 0.22 }));
  await png(ikonSvg({ boyut: 192, oran: 0.66 }), 192, 192, join(pub, "ikon-192.png"));
  await png(ikonSvg({ boyut: 512, oran: 0.66 }), 512, 512, join(pub, "ikon-512.png"));
  await png(ikonSvg({ boyut: 512, oran: 0.52 }), 512, 512, join(pub, "ikon-maskable-512.png"));
  await png(ikonSvg({ boyut: 180, oran: 0.66 }), 180, 180, join(pub, "apple-touch-icon.png"));
  await png(kapakHtml(u.alt), 1200, 630, join(pub, "kapak.png"));
}

// Capacitor (@capacitor/assets) kaynakları: 1024 ikon + 2732 açılış görseli
const cikti = join(kok, "cikti");
await png(ikonSvg({ boyut: 1024, oran: 0.62 }), 1024, 1024, join(cikti, "icon-only.png"));
await png(ikonSvg({ boyut: 1024, oran: 0.52 }), 1024, 1024, join(cikti, "icon-foreground.png"));
await png(`<html><body style="margin:0;background:#000"></body></html>`, 1024, 1024, join(cikti, "icon-background.png"));
await png(ikonSvg({ boyut: 2732, oran: 0.16 }), 2732, 2732, join(cikti, "splash.png"));
await png(ikonSvg({ boyut: 2732, oran: 0.16 }), 2732, 2732, join(cikti, "splash-dark.png"));

await tarayici.close();
