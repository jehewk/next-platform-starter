// Uçtan uca test: iki uygulama, sahte API ile (DEVIR §9 yöntemi).
//
//   node test/e2e.mjs [ekran-goruntusu-klasoru]
//
// · Her iki uygulamanın geliştirme sunucusunu VITE_API_URL=https://api.test/prod ile başlatır.
// · api.test'e giden her isteği test/sahte-api.mjs yanıtlar
//   (backend şeklinde, müşteri oturumunda veriyi müşteriye süzer).
// · Giriş formları, kaptcha dahil, gerçekten doldurulur.
// · Masaüstü ve 390 px'te sayfaları gezer; JS hatası ve yatay taşma arar.
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(join(execSync("npm root -g").toString().trim(), "playwright")); }
const { sahteIstek, KAYITLAR, SILINENLER, ABONELIKLER, ASISTAN_ISTEKLERI } = await import(join(kok, "test/sahte-api.mjs"));
// Sahte VAPID genel anahtarı (65 bayt, 0x04 ile başlar); push aboneliği tarayıcıda taklit edilir
const VAPID = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]).toString("base64url");
const CIKTI = process.argv[2] || join(kok, "test/ekranlar");
mkdirSync(CIKTI, { recursive: true });

const sunucular = [];
function baslat(klasor, port) {
  const p = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: join(kok, klasor), env: { ...process.env, VITE_API_URL: "https://api.test/prod", VITE_ASISTAN_YOLU: "/de/asistan", VITE_VAPID_GENEL: VAPID }, stdio: "pipe",
    detached: true,   // kendi süreç grubu: npx'in başlattığı vite de birlikte kapatılabilsin
  });
  sunucular.push(p);
  return new Promise((ok, red) => {
    const z = setTimeout(() => red(new Error(`${klasor} açılmadı`)), 60000);
    p.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(z); ok(); } });
  });
}

const hatalar = [];
const kontroller = [];
const kontrol = (ad, kosul) => { kontroller.push([ad, !!kosul]); if (!kosul) hatalar.push(`BAŞARISIZ: ${ad}`); };

async function baglam(tarayici, genislik) {
  const b = await tarayici.newContext({ viewport: { width: genislik, height: genislik < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  await b.route(/https:\/\/api\.test\/prod\/.*/, async (route) => {
    const r = route.request();
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(r.url());
    const yol = url.pathname.replace("/prod", "") + url.search;
    const token = (r.headers().authorization || "").replace("Bearer ", "");
    try {
      const v = await sahteIstek(yol, r.postDataJSON?.() || {}, token);
      await route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(v) });
    } catch (e) {
      await route.fulfill({ status: e.durum || 500, headers: cors, contentType: "application/json", body: JSON.stringify({ hata: e.message }) });
    }
  });
  // Push servisi (FCM) bu ortamda yok: abonelik tarayıcıda taklit edilir, sunucuya giden kayıt gerçektir
  await b.grantPermissions(["notifications"]);
  await b.addInitScript(() => {
    if (!("PushManager" in self)) return;
    // Başsız Chromium bildirim iznini her zaman "denied" bildirir: izin taklit edilir
    let izin = "default";
    Object.defineProperty(Notification, "permission", { get: () => izin });
    Notification.requestPermission = async () => (izin = "granted");
    let abone = null;
    PushManager.prototype.subscribe = async function (secenek) {
      const anahtar = new Uint8Array(secenek.applicationServerKey);
      if (anahtar.length !== 65 || anahtar[0] !== 4) throw new Error("VAPID anahtarı geçersiz");
      abone = { endpoint: "https://fcm.googleapis.com/fcm/send/test-" + Math.random().toString(36).slice(2),
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }; },
        async unsubscribe() { abone = null; return true; } };
      return abone;
    };
    PushManager.prototype.getSubscription = async () => abone;
  });
  // Dış kaynaklar (yazı tipi) bu ortamda erişilemez; test dışı.
  await b.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Uydu altlığı, etiket katmanları ve yağış radarı: tek renkli sahte karolar
  const karo = (b64) => ({ status: 200, contentType: "image/png", headers: cors, body: Buffer.from(b64, "base64") });
  await b.route(/server\.arcgisonline\.com\/.*World_Imagery/, (r) => r.fulfill(karo(SAHTE_UYDU)));
  await b.route(/server\.arcgisonline\.com\/.*Reference/, (r) => r.fulfill(karo(SAHTE_BOS)));
  await b.route(/api\.rainviewer\.com\/public\/weather-maps\.json/, (r) => r.fulfill({ status: 200, headers: cors,
    contentType: "application/json", body: JSON.stringify({ host: "https://tilecache.rainviewer.com",
      radar: { past: [{ time: 1790000000, path: "/v2/radar/1790000000" }, { time: 1790000600, path: "/v2/radar/1790000600" }] } }) }));
  await b.route(/tilecache\.rainviewer\.com\//, (r) => {
    radarKarolari.add(new URL(r.request().url()).pathname.split("/")[3]);
    return r.fulfill(karo(SAHTE_RADAR));
  });
  return b;
}
const SAHTE_UYDU = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwSrD7DwADyAHoIgni+wAAAABJRU5ErkJggg==";
const SAHTE_RADAR = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOwqbjTAwAEoQId21ZpBgAAAABJRU5ErkJggg==";
const SAHTE_BOS = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const radarKarolari = new Set();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };

async function sayfaAc(b, etiket) {
  const s = await b.newPage();
  s.on("pageerror", (e) => hatalar.push(`[${etiket}] JS: ${e.message}`));
  s.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) hatalar.push(`[${etiket}] konsol: ${m.text()}`);
  });
  return s;
}

async function tasmaYok(s, ad) {
  const w = await s.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  kontrol(`${ad}: yatay taşma yok (${w}px)`, w <= 0);
}
const bekle = (s, ms = 900) => s.waitForTimeout(ms);
// isVisible() beklemez; bir işlemin sonucunu görmek için gerçekten beklenir.
const gorunur = (loc, ms = 5000) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const foto = (s, ad) => s.screenshot({ path: join(CIKTI, `${ad}.png`), fullPage: true });

async function girisYap(s, taban, eposta) {
  await s.goto(taban + "/giris");
  // Açılış (intro) oturum başına bir kez gelir
  const intro = s.getByRole("dialog", { name: "Açılış" });
  kontrol(`${taban}: açılış ekranı gösterildi`, await intro.isVisible().catch(() => false));
  await bekle(s, 1400);
  await foto(s, `${taban.includes("5174") ? "musteri" : "uretici"}-00-intro`);
  await s.getByRole("button", { name: "Geç" }).click();
  await s.fill("#eposta", eposta);
  await s.fill("#sifre", "Sifre1234");
  await s.getByPlaceholder("Kodu yazın").fill("k4Tm9");
  await foto(s, `${taban.includes("5174") ? "musteri" : "uretici"}-01-giris`);
  await s.getByRole("button", { name: "Giriş yap" }).click();
  await s.waitForURL((u) => !u.pathname.startsWith("/giris"), { timeout: 10000 });
}

try {
  await Promise.all([baslat("panel-uretici", 5173), baslat("panel-musteri", 5174)]);
  const tarayici = await pw.chromium.launch();

  /* ═════════ ÜRETİCİ ═════════ */
  const U = "http://localhost:5173";
  for (const [gen, on] of [[1440, "uretici"], [390, "uretici-mobil"]]) {
    const b = await baglam(tarayici, gen);
    const s = await sayfaAc(b, on);
    await girisYap(s, U, "uretim@dennisenerji.com");
    kontrol(`${on}: demo rozeti yok`, !(await s.getByText("Demo verisi").count()));
    await bekle(s, 1500); await foto(s, `${on}-02-genel`); await tasmaYok(s, `${on} genel`);
    await s.goto(U + "/harita"); await bekle(s, 2000);
    kontrol(`${on}: haritada künye/Leaflet yazısı yok`, !(await s.locator(".leaflet-control-attribution").count())
      && !/Leaflet|OpenStreetMap|CARTO/.test(await s.locator(".leaflet-container").innerText()));
    kontrol(`${on}: uydu altlığı yüklendi`, (await s.locator('img.leaflet-tile[src*="World_Imagery"]').count()) > 0);
    kontrol(`${on}: canlı yağış radarı (en son kare)`, radarKarolari.has("1790000600") && !radarKarolari.has("1790000000")
      && await s.getByRole("button", { name: /Yağış radarı · \d\d:\d\d/ }).isVisible());
    await foto(s, `${on}-02b-harita`);
    await s.getByRole("button", { name: /Yağış radarı/ }).click(); await bekle(s, 400);
    kontrol(`${on}: radar kapatılabiliyor`, !(await s.locator('img.leaflet-tile[src*="rainviewer"]').count())
      && await s.getByRole("button", { name: "Radar kapalı" }).isVisible());
    await s.getByRole("button", { name: "Radar kapalı" }).click();
    await tasmaYok(s, `${on} harita`);

    await s.goto(U + "/musteriler"); await bekle(s);
    await foto(s, `${on}-03-musteriler`); await tasmaYok(s, `${on} müşteriler`);
    if (gen > 500) {
      await s.getByRole("button", { name: "Yeni müşteri" }).click();
      await s.locator("#musteri-form input").first().fill("Test Enerji Ltd.");
      await s.getByRole("button", { name: "Kaydet" }).click();
      kontrol("üretici: yeni müşteri bildirimi", await gorunur(s.getByText("Test Enerji Ltd. eklendi")));
      await bekle(s);
      kontrol("üretici: yeni müşteri tabloda", await gorunur(s.locator("table").getByText("Test Enerji Ltd.")));
    }

    await s.goto(U + "/garanti"); await bekle(s);
    await s.getByRole("button", { name: /Değerlendir/ }).first().click();
    await s.getByRole("button", { name: "Üretim kaynaklı" }).click();
    await foto(s, `${on}-04-garanti-karar`);
    await s.getByRole("button", { name: "Kararı kaydet" }).click();
    kontrol(`${on}: garanti kararı kaydedildi`, await gorunur(s.getByText(/onaylandı/).first()));
    await bekle(s); await tasmaYok(s, `${on} garanti`);

    await s.goto(U + "/akuler"); await bekle(s);
    await foto(s, `${on}-05-akuler`); await tasmaYok(s, `${on} aküler`);
    await s.goto(U + "/uretim"); await bekle(s); await tasmaYok(s, `${on} üretim`);
    await s.goto(U + "/basvurular"); await bekle(s); await tasmaYok(s, `${on} başvurular`);
    await s.goto(U + "/asistan"); await bekle(s);
    await s.getByRole("button", { name: "LiFePO4 hücre dengeleme nasıl çalışır?" }).first().click();
    await bekle(s, 1500);
    kontrol(`${on}: genel soru dil modeline gitti`, await s.getByText("(uretici, geçmiş 0)").first().isVisible());
    const sor = async (metin) => { await s.getByRole("textbox").last().fill(metin); await s.keyboard.press("Enter"); await bekle(s, 1500); };
    await sor("Müşterilerin adres bilgisi nedir?");
    kontrol(`${on}: müşteri adresleri yerelde yanıtlandı`, await s.getByText(/\d+ müşteri:/).first().isVisible());
    await sor("dostum bana bugün kayıt olan kullanıcıların bilgisini ver");
    kontrol(`${on}: bugün kayıt olanlar listelendi`, await s.getByText(/Bugün kayıt olan \d+ müşteri/).first().isVisible());
    await sor("selam naber");
    kontrol(`${on}: veri yanıtları dil modeline gitmedi`, await s.getByText("(uretici, geçmiş 2)").first().isVisible()
      && !(await s.getByText("VERİ SIZDI").count()));
    await sor("ya üretim değilde sohbet etmek istiyorum");
    kontrol(`${on}: "üretim değil de sohbet" dil modeline gitti`, await s.getByText("(uretici, geçmiş 4)").first().isVisible());
    await sor("geçmiş akü sağlık verisi göster");
    kontrol(`${on}: akü sağlık geçmişi yerelde, kötüleşenler sıralı`,
      await s.getByText(/Son 30 gün, \d+ akü \(hücre gerilim farkı/).first().isVisible()
      && await s.getByText(/En hızlı kötüleşenler/).first().isVisible());
    kontrol(`${on}: sohbette gidişat grafiği`, (await s.locator("main figure .recharts-line-curve").count()) > 0
      && (await s.locator("main figure").last().innerText()).includes("sınır 80 mV"));
    await s.locator("main figure").last().scrollIntoViewIfNeeded();
    await s.screenshot({ path: join(CIKTI, `${on}-07-saglik-gecmisi.png`) });
    await sor("AKU-D24-0071 son 2 haftada nasıl değişti");
    kontrol(`${on}: tek akünün gidişatı (seçilen dönem)`, await s.getByText(/AKU-D24-0071 — son 14 günün hücre gerilim farkı/).first().isVisible());
    kontrol(`${on}: sağlık geçmişi dil modeline gitmedi`, !(await s.getByText("(uretici, geçmiş 6)").count()));
    await s.locator('input[type="file"]').setInputFiles(join(kok, "panel-uretici/public/ikon-512.png"));
    await sor("bu akünün etiketi ne diyor");
    kontrol(`${on}: fotoğraf incelendi`, await s.getByText(/FOTOĞRAF İNCELENDİ/).first().isVisible());
    await sor("bana hesap makinesi için kod yaz");
    kontrol(`${on}: kod bloğu gösterildi`, (await s.locator("pre").last().innerText()).includes("def topla(a, b):\n    return a + b"));
    await tasmaYok(s, `${on} asistan`);
    await s.goto(U + "/aku/AKU-D24-0071"); await bekle(s, 1400);
    kontrol(`${on}: akü detayında NaN/undefined yok`, !/NaN|undefined/.test(await s.locator("main").innerText()));
    await foto(s, `${on}-06-aku`); await tasmaYok(s, `${on} akü detay`);
    kontrol(`${on}: akü paket gerilimi gösterildi`, await s.getByText("Paket gerilimi").isVisible());
    await s.goto(U + "/ayarlar"); await bekle(s);
    const anlik = s.getByRole("switch", { name: "Anlık bildirim" });
    await anlik.click(); await bekle(s, 1200);
    kontrol(`${on}: üretici anlık bildirimi açtı (rol: uretici)`, (await anlik.getAttribute("aria-checked")) === "true"
      && [...ABONELIKLER.values()].some((a) => a.rol === "uretici"));
    await anlik.click(); await bekle(s, 800);
    kontrol(`${on}: üretici anlık bildirimi kapattı`, ![...ABONELIKLER.values()].some((a) => a.rol === "uretici"));
    await tasmaYok(s, `${on} ayarlar`);
    await b.close();
  }

  /* ═════════ MÜŞTERİ ═════════ */
  const M = "http://localhost:5174";
  for (const [gen, on] of [[390, "musteri"], [1280, "musteri-masaustu"]]) {
    const b = await baglam(tarayici, gen);
    const s = await sayfaAc(b, on);
    await girisYap(s, M, "musteri@ornek.com");
    await bekle(s, 1500);
    kontrol(`${on}: sistem durumu kartı`, await s.getByText(/Her şey yolunda|Takip ediliyor|İlgilenilmesi gerekiyor/).first().isVisible());
    kontrol(`${on}: akü şarj halkası`, await s.getByRole("img", { name: /Şarj yüzde/ }).first().isVisible());
    kontrol(`${on}: ana sayfada NaN/undefined yok`, !/NaN|undefined/.test(await s.locator("main").innerText()));
    await foto(s, `${on}-02-sistemim`); await tasmaYok(s, `${on} sistemim`);

    await s.goto(M + "/cihazlar"); await bekle(s);
    await foto(s, `${on}-03-cihazlar`); await tasmaYok(s, `${on} cihazlar`);
    const cihazSayisi = await s.locator('a[href^="/cihaz/"]').count();
    kontrol(`${on}: yalnız kendi cihazları (6)`, cihazSayisi === 6);
    await s.locator('a[href^="/cihaz/AKU"]').first().click(); await bekle(s, 1200);
    await foto(s, `${on}-04-cihaz`); await tasmaYok(s, `${on} cihaz detay`);

    await s.goto(M + "/sohbet"); await bekle(s);
    await s.getByRole("button", { name: "Akümde ne kadar enerji var?" }).click();
    await bekle(s, 1500);
    kontrol(`${on}: veri sorusu yerelde yanıtlandı`, await s.getByText(/şarj %\d+/).first().isVisible());
    // KVKK: izin yokken genel soru Google'a (dil modeline) gitmez, fotoğraf düğmesi kapalı
    const once = ASISTAN_ISTEKLERI.length;
    await s.getByRole("textbox").last().fill("LiFePO4 nedir"); await s.keyboard.press("Enter"); await bekle(s, 1200);
    kontrol(`${on}: izin yokken genel soru modele gitmedi`, ASISTAN_ISTEKLERI.length === once
      && await s.getByText(/izni\*{0,2} vermeniz gerekiyor|izni vermeniz gerekiyor/).first().isVisible());
    kontrol(`${on}: izin yokken fotoğraf düğmesi kapalı`, await s.getByRole("button", { name: "Fotoğraf ekle" }).isDisabled());
    await s.getByRole("button", { name: "İzin veriyorum" }).click();
    kontrol(`${on}: izin verilince bilgi kutusu kalktı`, !(await s.getByRole("button", { name: "İzin veriyorum" }).count()));
    await s.getByRole("button", { name: "Akümün ömrünü nasıl uzatırım?" }).first().click().catch(async () => {
      await s.getByRole("textbox").last().fill("Akümün ömrünü nasıl uzatırım?"); await s.keyboard.press("Enter");
    });
    await bekle(s, 1500);
    kontrol(`${on}: genel soru dil modeline, veri yanıtı geçmişe girmeden`, await s.getByText("(musteri, geçmiş 0)").first().isVisible());
    kontrol(`${on}: kalın yazı işlendi`, (await s.locator("main strong", { hasText: "Genel yanıt" }).count()) > 0);
    kontrol(`${on}: kaynak bağlantısı yeni sekmede`,
      (await s.locator('main a[href="https://ornek.org/lfp-bakim"][target="_blank"]').count()) > 0);
    await s.getByRole("textbox").last().fill("sınır testi");
    await s.keyboard.press("Enter");
    await bekle(s, 1500);
    kontrol(`${on}: günlük sınır mesajı gösterildi`, await s.getByText("Bugünkü soru hakkınız doldu").first().isVisible());
    await s.getByRole("textbox").last().fill("akümün sağlık geçmişini göster");
    await s.keyboard.press("Enter"); await bekle(s, 2000);
    kontrol(`${on}: müşteri akü sağlık geçmişi sade dille`, await s.getByText(/hücreler (arasındaki denge|dengeli)/).first().isVisible());
    kontrol(`${on}: müşteri grafiğinde mV yok, sınır çizgisi var`, (await s.locator("main figure").count()) > 0
      && !/mV/.test(await s.locator("main figure").last().innerText()) && /sınır/.test(await s.locator("main figure").last().innerText()));
    await s.locator("main figure").last().scrollIntoViewIfNeeded();
    await s.screenshot({ path: join(CIKTI, `${on}-09-saglik-gecmisi.png`) });
    await s.locator('input[type="file"]').setInputFiles(join(kok, "panel-musteri/public/ikon-512.png"));
    await s.getByAltText("Eklenen fotoğraf").waitFor({ timeout: 5000 }).catch(() => {});
    kontrol(`${on}: fotoğraf önizlemesi ve gizlilik notu`, await s.getByAltText("Eklenen fotoğraf").isVisible()
      && await s.getByText(/Google Gemini\) gönderilir/).isVisible());
    await s.getByRole("textbox").last().fill("akümün garantisi bu fotoğrafta görünüyor mu");
    await s.keyboard.press("Enter"); await bekle(s, 1800);
    kontrol(`${on}: fotoğraflı soru (veri kelimesi olsa da) dil modeline JPEG olarak gitti`,
      await s.getByText(/FOTOĞRAF İNCELENDİ \(\d+ KB, soru: akümün garantisi/).first().isVisible());
    kontrol(`${on}: gönderilen fotoğraf sohbette görünüyor, önizleme temizlendi`,
      await s.getByAltText("Gönderilen fotoğraf").first().isVisible() && !(await s.getByAltText("Eklenen fotoğraf").count()));
    await s.locator('input[type="file"]').setInputFiles(join(kok, "panel-musteri/public/ikon-192.png"));
    await bekle(s, 400);
    await s.getByRole("button", { name: "Gönder" }).click(); await bekle(s, 1800);
    kontrol(`${on}: yalnızca fotoğraf (soru boş) gönderilebildi`, await s.getByText(/FOTOĞRAF İNCELENDİ \(\d+ KB, soru: -\)/).first().isVisible());
    await s.getByRole("textbox").last().fill("bugün dolar kuru ne kadar");
    await s.keyboard.press("Enter"); await bekle(s, 1800);
    kontrol(`${on}: web kaynağı başlığıyla, yeni sekmede`,
      (await s.locator('main a[target="_blank"]', { hasText: "tcmb.gov.tr" }).getAttribute("href")).includes("grounding-api-redirect"));
    kontrol(`${on}: Google arama önerileri yalıtılmış çerçevede`,
      (await s.locator('iframe[title="Google arama önerileri"]').getAttribute("sandbox")) === "allow-popups allow-popups-to-escape-sandbox");
    kontrol(`${on}: sohbette NaN/undefined yok`, !/NaN|undefined/.test(await s.locator("main").innerText()));
    await foto(s, `${on}-05-sohbet`); await tasmaYok(s, `${on} sohbet`);

    await s.goto(M + "/destek"); await bekle(s);
    await s.getByRole("button", { name: "Yeni talep" }).click();
    await s.locator("#destek-form select").selectOption({ index: 1 });
    await s.locator("#destek-form textarea").fill("Akü akşam saatlerinde beklenenden erken bitiyor.");
    await s.getByRole("button", { name: "Gönder" }).click();
    kontrol(`${on}: destek talebi alındı`, await gorunur(s.getByText("Talebiniz alındı")));
    await bekle(s); await foto(s, `${on}-06-destek`); await tasmaYok(s, `${on} destek`);

    await s.goto(M + "/hesap"); await bekle(s);
    // Bildirimler: aç → abonelik sunucuya kaydedilir; kapat → silinir
    const bildirim = s.getByRole("switch", { name: "Bildirimler" });
    kontrol(`${on}: bildirim anahtarı kapalı başlar`, await gorunur(bildirim) && (await bildirim.getAttribute("aria-checked")) === "false");
    await bildirim.click(); await bekle(s, 1200);
    kontrol(`${on}: bildirim açıldı, abonelik kaydedildi (müşteri)`, (await bildirim.getAttribute("aria-checked")) === "true"
      && [...ABONELIKLER.values()].some((a) => a.rol === "musteri"));
    await bildirim.click(); await bekle(s, 800);
    kontrol(`${on}: bildirim kapatıldı, abonelik silindi`, (await bildirim.getAttribute("aria-checked")) === "false"
      && ![...ABONELIKLER.values()].some((a) => a.rol === "musteri"));
    const izin = s.getByRole("switch", { name: "Sohbet asistanı genel soru izni" });
    kontrol(`${on}: asistan izni hesapta açık görünüyor`, (await izin.getAttribute("aria-checked")) === "true");
    await foto(s, `${on}-07-hesap`); await tasmaYok(s, `${on} hesap`);
    // Hesap silme: yanlış şifre reddedilir
    await s.getByRole("button", { name: "Hesabımı ve verilerimi sil" }).click();
    const sil = s.getByRole("dialog", { name: "Hesabımı ve verilerimi sil" });
    await sil.getByLabel("Onaylamak için şifreniz").fill("Yanlis123");
    kontrol(`${on}: onay kutusu işaretlenmeden silinemez`, await sil.getByRole("button", { name: "Kalıcı olarak sil" }).isDisabled());
    await sil.getByRole("checkbox").check();
    await sil.getByRole("button", { name: "Kalıcı olarak sil" }).click();
    kontrol(`${on}: hesap silmede yanlış şifre`, await gorunur(sil.getByText("Şifre hatalı.")) && !SILINENLER.length);
    await foto(s, `${on}-07b-hesap-sil`); await tasmaYok(s, `${on} hesap silme`);
    if (on === "musteri-masaustu") {
      await sil.getByLabel("Onaylamak için şifreniz").fill("Sifre1234");
      await sil.getByRole("button", { name: "Kalıcı olarak sil" }).click();
      kontrol("hesap silindi: girişe dönüldü, mesaj gösterildi", await gorunur(s.getByText("Hesabınız ve kişisel verileriniz silindi."))
        && SILINENLER.includes("MUS-1003"));
      kontrol("hesap silindi: oturum ve yerel veriler temizlendi", await s.evaluate(() => !sessionStorage.length && !localStorage.getItem("de_sohbetler")));
    } else {
      await sil.getByRole("button", { name: "Vazgeç" }).click();
    }
    await b.close();
  }

  // Kayıt başvurusu (oturumsuz)
  {
    const b = await baglam(tarayici, 390);
    const s = await sayfaAc(b, "kayit");
    await s.goto(M + "/giris");
    await s.getByRole("button", { name: "Geç" }).click().catch(() => {});
    await s.getByRole("link", { name: "Kayıt başvurusu yapın" }).click();
    const alanlar = { "Ad": "Ayşe", "Soyad": "Demir", "E-posta": "ayse@ornek.com", "Şifre": "Guclu2026", "Telefon": "05321234567",
                      "İl": "Adana", "İlçe": "Çukurova", "Adres": "Turgut Özal Blv. 12" };
    for (const [k, v] of Object.entries(alanlar)) await s.getByLabel(k, { exact: true }).fill(v);
    await foto(s, "musteri-08-kayit");
    await tasmaYok(s, "kayıt formu");
    await s.getByRole("button", { name: "Başvuruyu gönder" }).click(); await bekle(s, 600);
    kontrol("kayıt: Aydınlatma Metni onayı olmadan gönderilmez", !KAYITLAR.length);
    kontrol("kayıt: aydınlatma metni bağlantısı gizlilik sayfasına", (await s.getByRole("link", { name: "Aydınlatma Metni" }).getAttribute("href")) === "/gizlilik#aydinlatma");
    await s.getByRole("checkbox").first().check();
    await s.getByRole("button", { name: "Başvuruyu gönder" }).click();
    kontrol("kayıt: KVKK onayı ve sürümü gönderildi, açık rıza işaretsiz (false)", await gorunur(s.getByRole("heading", { name: "Hesabınız açıldı" }))
      && KAYITLAR.at(-1)?.kvkk_aydinlatma === true && KAYITLAR.at(-1)?.yurtdisi_riza === false && /^\d{4}-\d{2}$/.test(KAYITLAR.at(-1)?.kvkk_surum));
    kontrol("kayıt: hesap açıldı ekranı (otomatik onay)", await gorunur(s.getByRole("heading", { name: "Hesabınız açıldı" })));
    await s.getByRole("link", { name: "Giriş yap" }).click();
    kontrol("kayıt: giriş e-postası dolu geliyor", (await s.getByLabel("E-posta").inputValue()) === "ayse@ornek.com");

    // Şifremi unuttum
    await s.getByRole("link", { name: "Şifremi unuttum" }).click();
    kontrol("şifre sıfırlama: e-posta girişten taşındı", (await s.getByLabel("E-posta").inputValue()) === "ayse@ornek.com");
    await bekle(s, 800);   // doğrulama kodu resmi yüklenince alan sıfırlanır
    await s.getByPlaceholder("Kodu yazın").fill("yanlis");
    await s.getByRole("button", { name: "Kod gönder" }).click();
    kontrol("şifre sıfırlama: yanlış doğrulama kodu reddedildi", await gorunur(s.getByText(/Dogrulama kodu hatali/)));
    await bekle(s, 900);   // hatadan sonra yeni kod alınır
    await s.getByPlaceholder("Kodu yazın").fill("k4Tm9");
    await s.getByRole("button", { name: "Kod gönder" }).click();
    kontrol("şifre sıfırlama: kod gönderildi ekranı (hesap varlığı söylenmiyor)", await gorunur(s.getByText(/ile bir hesap varsa doğrulama kodu gönderildi/)));
    await foto(s, "musteri-09-sifre-sifirla"); await tasmaYok(s, "şifre sıfırlama");
    await s.getByLabel("E-postadaki kod").fill("000000");
    await s.getByLabel("Yeni şifre", { exact: true }).fill("YeniSifre2026");
    await s.getByLabel("Yeni şifre (tekrar)").fill("YeniSifre2026");
    await s.getByRole("button", { name: "Şifreyi değiştir" }).click();
    kontrol("şifre sıfırlama: hatalı kod reddedildi", await gorunur(s.getByText("Kod hatali")));
    await s.getByLabel("E-postadaki kod").fill("123456");
    await s.getByLabel("Yeni şifre (tekrar)").fill("YeniSifre2025");
    await s.getByRole("button", { name: "Şifreyi değiştir" }).click();
    kontrol("şifre sıfırlama: şifreler aynı değilse gönderilmez", await gorunur(s.getByText("Şifreler aynı değil.")));
    await s.getByLabel("Yeni şifre (tekrar)").fill("YeniSifre2026");
    await s.getByRole("button", { name: "Şifreyi değiştir" }).click();
    kontrol("şifre sıfırlama: başarı → giriş ekranı, mesaj ve e-posta dolu", await gorunur(s.getByText(/Şifreniz değiştirildi/))
      && (await s.getByLabel("E-posta").inputValue()) === "ayse@ornek.com");

    // Gizlilik sayfası oturumsuz açılır
    await s.goto(M + "/gizlilik#hesap-silme"); await bekle(s, 600);
    kontrol("gizlilik: oturumsuz açılıyor, üç bölüm var", await gorunur(s.getByRole("heading", { name: /Aydınlatma Metni/ }))
      && await s.getByRole("heading", { name: /Açık Rıza/ }).isVisible() && await s.getByRole("heading", { name: /Hesabınızı ve Verilerinizi Silme/ }).isVisible());
    kontrol("gizlilik: KVKK m.11 hakları ve saklama süreleri yazıyor", await s.getByText(/KVKK m\.11/).isVisible() && await s.getByText(/35 gün/).first().isVisible());
    await foto(s, "musteri-10-gizlilik"); await tasmaYok(s, "gizlilik");
    await b.close();
  }

  await tarayici.close();
} catch (e) {
  hatalar.push("TEST DURDU: " + (e.stack || e.message).split("\n").slice(0, 3).join(" | "));
} finally {
  for (const p of sunucular) { try { process.kill(-p.pid, "SIGTERM"); } catch { p.kill(); } }
}

for (const [ad, ok] of kontroller) console.log(`${ok ? "✓" : "✗"} ${ad}`);
console.log(hatalar.length ? `\n${hatalar.length} sorun:\n` + [...new Set(hatalar)].join("\n") : "\nTüm kontroller geçti, JS hatası yok.");
process.exit(hatalar.length ? 1 : 0);
