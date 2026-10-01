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
const { sahteIstek } = await import(join(kok, "test/sahte-api.mjs"));
const CIKTI = process.argv[2] || join(kok, "test/ekranlar");
mkdirSync(CIKTI, { recursive: true });

const sunucular = [];
function baslat(klasor, port) {
  const p = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: join(kok, klasor), env: { ...process.env, VITE_API_URL: "https://api.test/prod", VITE_ASISTAN_YOLU: "/de/asistan" }, stdio: "pipe",
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
  // Dış kaynaklar (yazı tipi, harita karoları) bu ortamda erişilemez; test dışı.
  await b.route(/fonts\.(googleapis|gstatic)\.com|basemaps\.cartocdn\.com/, (r) => r.abort());
  return b;
}
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
    await sor("bana hesap makinesi için kod yaz");
    kontrol(`${on}: kod bloğu gösterildi`, (await s.locator("pre").last().innerText()).includes("def topla(a, b):\n    return a + b"));
    await tasmaYok(s, `${on} asistan`);
    await s.goto(U + "/aku/AKU-D24-0071"); await bekle(s, 1400);
    kontrol(`${on}: akü detayında NaN/undefined yok`, !/NaN|undefined/.test(await s.locator("main").innerText()));
    await foto(s, `${on}-06-aku`); await tasmaYok(s, `${on} akü detay`);
    kontrol(`${on}: akü paket gerilimi gösterildi`, await s.getByText("Paket gerilimi").isVisible());
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
    await foto(s, `${on}-07-hesap`); await tasmaYok(s, `${on} hesap`);
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
    await s.getByRole("button", { name: "Başvuruyu gönder" }).click();
    kontrol("kayıt: hesap açıldı ekranı (otomatik onay)", await gorunur(s.getByRole("heading", { name: "Hesabınız açıldı" })));
    await s.getByRole("link", { name: "Giriş yap" }).click();
    kontrol("kayıt: giriş e-postası dolu geliyor", (await s.getByLabel("E-posta").inputValue()) === "ayse@ornek.com");
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
