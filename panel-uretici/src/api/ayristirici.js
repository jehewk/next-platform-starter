/**
 * Sohbet ayrıştırıcısı — dil modeli kullanmadan, Türkçe serbest soruyu niyete çevirir.
 *
 * Sistem verisiyle ilgili sorular (ör. "dostum bugün kayıt olan kullanıcıları ver")
 * burada tanınır ve yanıt doğrudan gerçek veriden üretilir: veri tarayıcıdan dışarı
 * çıkmaz. Tanınmayan ya da genel bilgi sorusu ("selam naber", "LiFePO4 nedir")
 * null döner ve dil modeline gider (yalnızca soru metni).
 *
 * İki uygulamada aynı dosya durur (panel-uretici, panel-musteri); birinde yapılan
 * değişiklik diğerine de kopyalanmalı.
 */

const HARF = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Küçük harf, Türkçe karaktersiz, kesme işaretsiz, tek boşluklu metin. */
export function sadelestir(metin) {
  return String(metin || "")
    .toLocaleLowerCase("tr")
    .normalize("NFC")
    .replace(/[çğıöşüâîû]/g, (h) => HARF[h])
    .replace(/\u0307/g, "")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const kelimeler = (metin) => sadelestir(metin).split(" ").filter(Boolean);

/** İki kısa metin arasındaki düzenleme uzaklığı (yazım hatası toleransı için). */
function mesafe(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Kelime kökle başlıyor mu (Türkçe ekler serbest); uzun köklerde 1 harf hata tolere edilir. */
function kokEslesir(kelime, kok) {
  if (kelime.startsWith(kok)) return true;
  return kok.length >= 5 && kelime.length >= kok.length - 1 && mesafe(kelime.slice(0, kok.length), kok) <= 1;
}

/** Sorunun sade hali ve kelimeleri üzerinde kavram denetimi. Boşluklu kökler ifade olarak aranır. */
export function soruCoz(soru) {
  const s = sadelestir(soru);
  const w = s.split(" ").filter(Boolean);
  const var_ = (kokler) => kokler.some((k) => (k.includes(" ") ? ` ${s} `.includes(` ${k}`) : w.some((x) => kokEslesir(x, k))));
  return { s, w, var: var_ };
}

const GUN = 86400000;
const gunBasi = (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate());

/** "bugün", "dün", "bu hafta", "geçen ay", "son 3 gün", "12.10.2026" → {bas, bit, ad} ya da null. */
export function zamanAraligi(soru, simdi = new Date()) {
  const s = typeof soru === "string" ? sadelestir(soru) : soru.s;
  const bugun = gunBasi(simdi);
  const yarin = new Date(bugun.getTime() + GUN);
  if (/\bbugun|\bbu gun\b/.test(s)) return { bas: bugun, bit: yarin, ad: "bugün" };
  if (/\bdun(ku|den)?\b/.test(s)) return { bas: new Date(bugun.getTime() - GUN), bit: bugun, ad: "dün" };
  const haftaBasi = new Date(bugun.getTime() - ((bugun.getDay() + 6) % 7) * GUN);
  if (/\bbu hafta/.test(s)) return { bas: haftaBasi, bit: yarin, ad: "bu hafta" };
  if (/\bgecen hafta/.test(s)) return { bas: new Date(haftaBasi.getTime() - 7 * GUN), bit: haftaBasi, ad: "geçen hafta" };
  const ayBasi = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
  if (/\bbu ay/.test(s)) return { bas: ayBasi, bit: yarin, ad: "bu ay" };
  if (/\bgecen ay/.test(s)) return { bas: new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1), bit: ayBasi, ad: "geçen ay" };
  const son = s.match(/\bson (\d{1,3}) (gun|hafta|ay)/);
  if (son) {
    const n = Number(son[1]);
    const gunSayisi = son[2] === "gun" ? n : son[2] === "hafta" ? n * 7 : n * 30;
    return { bas: new Date(yarin.getTime() - gunSayisi * GUN), bit: yarin, ad: `son ${n} ${son[2] === "gun" ? "gün" : son[2]}` };
  }
  const t = s.match(/\b(\d{1,2})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{2,4}))?\b/);
  if (t) {
    const yil = t[3] ? (t[3].length === 2 ? 2000 + Number(t[3]) : Number(t[3])) : bugun.getFullYear();
    const d = new Date(yil, Number(t[2]) - 1, Number(t[1]));
    if (!isNaN(d) && d.getMonth() === Number(t[2]) - 1) return { bas: d, bit: new Date(d.getTime() + GUN), ad: d.toLocaleDateString("tr-TR") };
  }
  return null;
}

/* ── genel bilgi mi, veri mi ─────────────────────────────────────────── */

// "nedir", "nasıl uzatırım" gibi bilgi/tavsiye soruları — veri istemiyorsa dil modeline gider.
// Tek başına "nasıl" zayıf işarettir: "sistemim nasıl?" bir durum sorusudur.
const BILGI = ["nedir", "ne demek", "nasil calis", "nasil yapil", "nasil kurul", "nasil koru", "nasil uzat",
  "nasil tespit", "nasil onle", "nasil anla", "nasil sec", "nasil hesap", "nasil bak", "nasil kullan",
  "nasil olur", "nasil temizle", "nasil sakla", "neden", "nicin", "ne ise yarar", "farki", "fark nedir",
  "anlat", "acikla", "tavsiye", "oneri", "ipucu", "ne yapmali", "ne yapmaliyim", "nasil davran"];
// Veri isteyen ifadeler — bunlardan biri varsa soru veri sorusudur
const VERI = ["kac", "hangi", "hangileri", "liste", "goster", "ver", "bul", "getir", "kim", "kimler", "nerede",
  "toplam", "sayi", "adet", "bugun", "dun", "hafta", "son ", "durum", "ozet", "rapor", "var mi", "oran", "yuzde", "su an", "simdi"];

/** Soru bir bilgi sorusu mu (veri istemeden "nedir/neden/nasıl uzatırım")? nasilDahil: tek "nasıl" da sayılır. */
export function bilgiSorusuMu(c, { nasilDahil = false } = {}) {
  const ifade = (k) => (k.includes(" ") ? ` ${c.s} `.includes(` ${k}`) : c.w.some((x) => x.startsWith(k)));
  const bilgi = BILGI.some(ifade) || (nasilDahil && c.w.some((x) => x.startsWith("nasil")));
  if (!bilgi) return false;
  return !VERI.some((k) => (k.endsWith(" ") ? ` ${c.s} `.includes(` ${k}`) : k.includes(" ") ? c.s.includes(k) : c.w.some((x) => x.startsWith(k))));
}

// Sohbet etmek isteyen ya da konuyu reddeden ifade ("üretim değil de sohbet etmek istiyorum",
// "yok bunları değil") veri sorusu değildir; dil modeline gider. "değil mi" soru ekidir, sayılmaz.
const SOHBET = ["sohbet", "muhabbet", "laflay", "lafla", "konusal", "konusmak", "dertles", "chat"];
export function sohbetIstegi(c) {
  if (c.w.some((x) => SOHBET.some((k) => x.startsWith(k)))) return true;
  if (c.w.some((x) => /^istemiyo/.test(x))) return true;
  return c.w.some((x, i) => /^degil(de|im|sin|iz)?$/.test(x) && !/^mi/.test(c.w[i + 1] || ""));
}

// Akü sağlık geçmişi: sağlık kavramı + geçmiş/gidişat kavramı. Yazım hatası toleransı
// yok (kökEslesir "degis" ile "degil"i eşlerdi); kök başta olmalı.
const SAGLIK = ["saglik", "soh", "omur", "hucre", "denge", "yaslan", "yipran", "kapasite"];
const GECMIS = ["gecmis", "degis", "trend", "egilim", "kotules", "kotuye", "iyiles", "yaslan", "zamanla",
  "seyir", "gidisat", "tarihce", "grafik", "gelisim"];
const basla = (c, kokler) => c.w.some((x) => kokler.some((k) => x.startsWith(k)));

/** Sorulan dönem (gün): "son 3 ay" → 90, "bu hafta" → 7; varsayılan 30, 7–90 arası. */
export function gunSayisi(c, simdi = new Date()) {
  const z = zamanAraligi(c, simdi);
  if (!z) return 30;
  return Math.min(90, Math.max(7, Math.ceil((simdi - z.bas) / GUN)));
}

/** "akü sağlık geçmişi", "son 1 ayda SOH nasıl değişti", "akümün sağlığı zamanla kötüleşiyor mu" */
export function saglikGecmisiMi(c) {
  const saglik = basla(c, SAGLIK) || c.var(["aku", "batarya"]);
  return saglik && (basla(c, GECMIS) || (basla(c, SAGLIK) && !!zamanAraligi(c)));
}

/* ── üretici paneli ──────────────────────────────────────────────────── */

const K = {
  musteri: ["musteri", "kullanici", "uye", "abone", "kisi", "insan", "alici"],
  kayit: ["kayit", "kayd", "kaydol", "kaydedil", "katil", "eklen", "uye ol", "yeni gelen", "yeni musteri", "yeni kullanici"],
  adres: ["adres", "nerede", "konum", "otur", "ikamet"],
  telefon: ["telefon", "tel", "numara", "gsm", "cep", "iletisim", "ulas"],
  eposta: ["eposta", "e-posta", "mail", "email"],
  basvuru: ["basvuru", "onay bekle", "bekleyen", "onaylanmamis"],
  talep: ["talep", "destek", "sikayet", "servis kayd", "servis talep"],
  garanti: ["garanti"],
  parti: ["parti", "lot"],
  ariza: ["ariza", "bozuk", "sorunlu", "problem", "calismayan", "hatali", "izlem", "uyari"],
  depo: ["depo", "stok", "sevk", "kargo", "gonderil"],
  aku: ["aku", "batarya", "pil"],
  inverter: ["inverter", "invertor", "evirici", "uretim", "kwh"],
  ozet: ["ozet", "genel durum", "durum", "rapor", "istatistik"],
};
// Müşteri adı eşleşmesinde sayılmayan kelimeler
const AD_DISI = new Set(["ltd", "sti", "as", "san", "tic", "ve", "enerji", "insaat", "elektrik", "sirketi", "a", "s"]);

/** Müşteri adı geçiyor mu? "ahmetin adresi" → Ahmet ... (ek serbest). En çok eşleşenler döner. */
export function adiGecenler(c, musteriler) {
  let en = 0, sonuc = [];
  for (const m of musteriler) {
    const parca = kelimeler(m.ad).filter((p) => p.length >= 3 && !AD_DISI.has(p));
    const puan = parca.filter((p) => c.w.some((x) => x.startsWith(p) && x.length <= p.length + 4)).length;
    if (puan > en) { en = puan; sonuc = [m]; } else if (puan && puan === en) sonuc.push(m);
  }
  return sonuc;
}

/** Soruda geçen il (ör. "adanadaki müşteriler"); yalnızca verideki iller aranır. */
export function ilGeciyor(c, iller) {
  return iller.find((il) => { const k = sadelestir(il); return k.length >= 3 && c.w.some((x) => x.startsWith(k)); }) || null;
}

/**
 * Üretici paneli niyeti. veri: {musteriler}. Döner: {niyet, ...} ya da null (dil modeline).
 * niyetler: cihaz, basvurular, musteri_kayit, musteri_bilgi, musteri_listesi, talepler,
 *           garanti, parti, ariza, depo, aku, inverter, ozet
 */
export function ureticiNiyeti(soru, { musteriler = [] } = {}) {
  const c = soruCoz(soru);
  const kod = String(soru).match(/\b(AKU|INV)-D\d{2}-\d{4}\b/i)?.[0]?.toUpperCase();
  if (kod) return saglikGecmisiMi(c) || basla(c, GECMIS) ? { niyet: "cihaz_gecmis", kod, gun: gunSayisi(c) } : { niyet: "cihaz", kod };
  // "mail adresi" e-postadır: e-posta önce
  const alan = c.var(K.eposta) ? "eposta" : c.var(K.telefon) ? "telefon" : c.var(K.adres) ? "adres" : "hepsi";
  // Müşteri adı en güçlü veri işaretidir ("Ahmet'e nasıl ulaşırım" de bir veri sorusudur)
  const adlar = adiGecenler(c, musteriler);
  const saglikGecmisi = saglikGecmisiMi(c);
  if (adlar.length && saglikGecmisi) return { niyet: "saglik_gecmisi", gun: gunSayisi(c), musteriler: adlar };
  if (adlar.length) return { niyet: "musteri_bilgi", musteriler: adlar, alan };
  if (sohbetIstegi(c)) return null;
  if (saglikGecmisi) return { niyet: "saglik_gecmisi", gun: gunSayisi(c), musteriler: [] };
  const zaman = zamanAraligi(c);
  const musteriKonusu = c.var(K.musteri);
  // Müşteri/iletişim/kayıt geçen soru panelde her zaman veri sorusudur ("adres bilgisi nedir")
  const veriKonusu = musteriKonusu || alan !== "hepsi" || c.var(K.kayit) || c.var(K.basvuru) || zaman;
  if (!veriKonusu && bilgiSorusuMu(c, { nasilDahil: true })) return null;

  if (c.var(K.basvuru)) return { niyet: "basvurular" };
  if ((c.var(K.kayit) && (musteriKonusu || zaman)) || (musteriKonusu && zaman)) {
    return { niyet: "musteri_kayit", zaman: zaman || { ...zamanAraligi("son 7 gun"), ad: "son 7 gün" }, alan };
  }
  const il = ilGeciyor(c, [...new Set(musteriler.map((m) => m.il).filter(Boolean))]);
  if (musteriKonusu || (il && !c.var(K.ariza)) || (alan !== "hepsi" && !c.var(K.ariza))) {
    return { niyet: "musteri_listesi", il, alan };
  }
  if (c.var(K.talep)) return { niyet: "talepler" };
  if (c.var(K.garanti)) return { niyet: "garanti" };
  if (c.var(K.parti)) return { niyet: "parti" };
  if (c.var(K.ariza)) return { niyet: "ariza" };
  if (c.var(K.depo)) return { niyet: "depo" };
  if (c.var(K.aku)) return { niyet: "aku" };
  if (c.var(K.inverter)) return { niyet: "inverter" };
  if (c.var(K.ozet)) return { niyet: "ozet" };
  return null;
}

/* ── müşteri uygulaması ──────────────────────────────────────────────── */

const M = {
  sarj: ["sarj", "doluluk", "yuzde", "enerji var", "ne kadar enerji", "kalan enerji", "batarya"],
  uretim: ["uret", "gunes", "kwh", "panel"],
  garanti: ["garanti"],
  talep: ["talep", "destek", "servis", "sikayet", "basvuru"],
  sicaklik: ["sicak", "isi", "derece"],
  cihazlar: ["cihazlar", "cihazim", "cihazlarim", "neler var", "hangi cihaz"],
  durum: ["durum", "saglik", "sorun var", "calisiyor mu", "ozet", "nasil gidiyor"],
};
// "akümün", "sistemimde", "inverterim" — kullanıcının KENDİ sistemine işaret eden iyelik
const KENDI = ["aku", "sistem", "inverter", "panel", "cihaz", "garanti", "taleb", "talep", "batarya", "evim", "uretim"];
const kendiMi = (c) => c.w.some((x) => ["benim", "bizim", "evdeki", "evimdeki"].includes(x) ||
  KENDI.some((k) => x.startsWith(k) && /^(i|u)?m/.test(x.slice(k.length))));

/** Müşteri uygulaması niyeti; döner: {niyet} ya da null (dil modeline). */
export function musteriNiyeti(soru) {
  const c = soruCoz(soru);
  if (sohbetIstegi(c)) return null;
  // "akümün sağlığı zamanla nasıl değişti" bir veri sorusudur; bilgi sorusu denetiminden önce
  if (saglikGecmisiMi(c) && (kendiMi(c) || !bilgiSorusuMu(c))) return { niyet: "saglik_gecmisi", gun: gunSayisi(c) };
  if (bilgiSorusuMu(c)) return null;                       // "akümün ömrünü nasıl uzatırım" → tavsiye
  const veriIstiyor = kendiMi(c) || VERI.some((k) => c.w.some((x) => x.startsWith(k.trim())));
  if (c.var(M.talep) && (veriIstiyor || c.w.length <= 4)) return { niyet: "talep" };
  if (c.var(M.garanti) && (veriIstiyor || c.w.length <= 4)) return { niyet: "garanti" };
  if (c.var(M.uretim) && veriIstiyor) return { niyet: "uretim" };
  if (c.var(M.sicaklik) && veriIstiyor) return { niyet: "sicaklik" };
  if ((c.var(M.sarj) || c.var(["aku"])) && veriIstiyor) return { niyet: "sarj" };
  if (c.var(M.cihazlar)) return { niyet: "cihazlar" };
  if (c.var(M.durum) && (veriIstiyor || c.var(["sistem", "cihaz", "aku", "inverter"]))) return { niyet: "durum" };
  if (c.var(["nasil"]) && c.var(["sistem", "cihaz", "akum", "inverterim"])) return { niyet: "durum" };
  return null;
}
