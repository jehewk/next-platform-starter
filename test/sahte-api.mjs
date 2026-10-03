/**
 * TEST DÜZENEĞİ — uygulamaya dahil DEĞİLDİR.
 *
 * Playwright testleri API Gateway çağrılarını yakalayıp buradan yanıtlar
 * (DEVIR.md §9'daki yöntem). Yanıtlar backend ile aynı şekildedir
 * (snake_case). Müşteri oturumunda backend gibi veriyi müşteriye süzer.
 *
 * Giriş: e-postada "musteri" geçerse müşteri (MUS-1003), yoksa üretici.
 */

function tohumlu(tohum) {
  let t = tohum;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}
const r = tohumlu(20260926);
const aralik = (a, b) => a + r() * (b - a);
const tam = (a, b) => Math.floor(aralik(a, b + 1));
const sec = (dizi) => dizi[Math.floor(r() * dizi.length)];
const gunOnce = (g) => new Date(Date.now() - g * 86400000).toISOString();

const MUSTERI_HAM = [
  ["Çukurova Tarım Kooperatifi", "Ticari",  "Adana",    "Ceyhan",    37.03, 35.81],
  ["Yılmaz Konutu",             "Konut",   "Adana",    "Seyhan",    37.00, 35.32],
  ["Toros Soğuk Hava Deposu",    "Sanayi",  "Mersin",   "Tarsus",    36.92, 34.89],
  ["Karataş Balıkçılık",         "Ticari",  "Adana",    "Karataş",   36.57, 35.37],
  ["Demir Villa",                "Konut",   "Mersin",   "Yenişehir", 36.80, 34.60],
  ["Kozan Sulama Birliği",       "Tarım",   "Adana",    "Kozan",     37.45, 35.81],
  ["Osmaniye OSB — Atölye 14",   "Sanayi",  "Osmaniye", "Merkez",    37.07, 36.25],
  ["Akdeniz Otel",               "Ticari",  "Mersin",   "Erdemli",   36.61, 34.31],
  ["Aksoy Çiftliği",             "Tarım",   "Adana",    "Yüreğir",   36.97, 35.45],
  ["İmamoğlu Belediyesi",        "Kamu",    "Adana",    "İmamoğlu",  37.26, 35.66],
  ["Kadirli Un Fabrikası",       "Sanayi",  "Osmaniye", "Kadirli",   37.37, 36.10],
  ["Güneş Apartmanı",            "Konut",   "Mersin",   "Mezitli",   36.75, 34.53],
  ["Pozantı Dağ Evi",            "Konut",   "Adana",    "Pozantı",   37.43, 34.87],
];

const MUSTERILER = MUSTERI_HAM.map(([ad, tip, il, ilce, lat, lng], i) => ({
  musteri_id: `MUS-${String(1001 + i)}`,
  ad, tip, il, ilce,
  adres: `${sec(["Atatürk Cd.", "Cumhuriyet Mh.", "İnönü Blv.", "Sanayi Sk.", "Kurtuluş Mh."])} No:${tam(3, 180)}`,
  telefon: `0${sec(["322", "324", "328"])} ${tam(200, 999)} ${tam(10, 99)} ${tam(10, 99)}`,
  email: `iletisim${i + 1}@ornek.com.tr`,
  lat, lng,
  olusturma: gunOnce(tam(40, 700)),
}));

const PARTILER = [
  { kod: "D23-A07", tip: "aku",      gun: 820 },
  { kod: "D24-A02", tip: "aku",      gun: 610 },
  { kod: "D24-A05", tip: "aku",      gun: 420 },
  { kod: "D25-A01", tip: "aku",      gun: 240 },
  { kod: "D25-A03", tip: "aku",      gun: 70 },
  { kod: "D23-I04", tip: "inverter", gun: 780 },
  { kod: "D24-I02", tip: "inverter", gun: 500 },
  { kod: "D25-I01", tip: "inverter", gun: 190 },
];

const AKU_MEK = ["hucre_dengesizligi", "ic_direnc", "cevrim_yorulmasi", "termal_yaslanma"];
const INV_MEK = ["kondansator_esr", "fan_verimi", "igbt_termal_yorulma", "sogutma_verimi"];
const GEREKCE = {
  hucre_dengesizligi: "Hücre 7 son 14 günde ortalamadan 62 mV ayrıştı; dengeleme her gece aktif.",
  ic_direnc: "Yük altında gerilim düşümü 3 haftada %18 arttı; iç direnç yükseliyor.",
  cevrim_yorulmasi: "Günlük 1,6 tam çevrim — tasarım profilinin üzerinde; kapasite kaybı hızlandı.",
  termal_yaslanma: "Paket sıcaklığı öğleden sonraları 41 °C'yi aşıyor; havalandırma yetersiz.",
  kondansator_esr: "DC bara dalgalanması 2,4 kat arttı; kondansatör ESR'si yükseliyor.",
  fan_verimi: "Aynı yükte soğutucu sıcaklığı 9 °C daha yüksek; fan devri düşmüş.",
  igbt_termal_yorulma: "IGBT sıcaklık salınımı günde 40+ döngü; bağlantı yorulması riski.",
  sogutma_verimi: "Ortam sıcaklığı ile soğutucu arasındaki fark daralmıyor; hava akışı kısıtlı.",
};

const CIHAZLAR = [];
const sayac = {};
for (const p of PARTILER) {
  const adet = p.tip === "aku" ? tam(5, 8) : tam(3, 5);
  for (let i = 0; i < adet; i++) {
    const on = p.tip === "aku" ? "AKU" : "INV";
    const yil = p.kod.slice(1, 3);
    sayac[on + yil] = (sayac[on + yil] || 40) + tam(1, 6);
    const id = `${on}-D${yil}-${String(sayac[on + yil]).padStart(4, "0")}`;

    const zar = r();
    const durum = zar < 0.12 ? "depoda" : zar < 0.18 ? "sevkte" : zar < 0.28 ? "uyari" : zar < 0.34 ? "arizali" : "aktif";
    const sahada = ["aktif", "uyari", "arizali"].includes(durum);
    const saglik = !sahada ? null
      : durum === "arizali" ? tam(38, 62)
      : durum === "uyari" ? tam(66, 83)
      : tam(86, 99);
    const mek = saglik != null && saglik < 85 ? sec(p.tip === "aku" ? AKU_MEK : INV_MEK) : null;

    CIHAZLAR.push({
      cihaz_id: id,
      tip: p.tip,
      model: p.tip === "aku" ? sec(["DE-LFP 51.2V 100Ah", "DE-LFP 51.2V 200Ah"]) : sec(["DE-HYB 5K", "DE-HYB 8K", "DE-HYB 10K"]),
      parti: p.kod,
      musteri_id: sahada ? sec(MUSTERILER).musteri_id : null,
      durum,
      saglik,
      uretim_tarihi: gunOnce(p.gun + tam(0, 12)),
      kurulum_tarihi: sahada ? gunOnce(p.gun - tam(20, 60)) : null,
      kapasite_ah: p.tip === "aku" ? 100 : null,
      hucre_sayisi: p.tip === "aku" ? 16 : null,
      guc_kw: p.tip === "inverter" ? tam(5, 10) : null,
      son_soc: p.tip === "aku" && sahada ? tam(22, 97) : null,
      gunluk_kwh: p.tip === "inverter" && sahada ? Number(aralik(8, 46).toFixed(1)) : null,
      oncelikli: mek,
      ozet: mek ? GEREKCE[mek] : "",
      kalan_gun: mek ? Number((saglik < 65 ? aralik(0.5, 3) : aralik(4, 21)).toFixed(1)) : null,
      guven: mek ? tam(62, 93) : null,
    });
  }
}
// Model etiketi kapasite ile tutarlı olsun.
CIHAZLAR.forEach((c) => { if (c.tip === "aku" && c.model.includes("200Ah")) c.kapasite_ah = 200; });
// Test müşterisinin (MUS-1003) en az iki akü ve bir inverteri olsun; biri izlemede.
{
  const akuler = CIHAZLAR.filter((c) => c.tip === "aku" && c.musteri_id);
  const inv = CIHAZLAR.find((c) => c.tip === "inverter" && c.durum === "aktif");
  const izlemede = akuler.find((c) => c.durum === "uyari");
  const saglikli = akuler.find((c) => c.durum === "aktif");
  for (const c of [izlemede, saglikli, inv]) if (c) c.musteri_id = "MUS-1003";
}

const GARANTI = CIHAZLAR.filter((c) => c.durum === "arizali" || (c.durum === "uyari" && r() < 0.4))
  .slice(0, 7)
  .map((c, i) => ({
    talep_id: `GT-${2400 + i * 7}`,
    cihaz_id: c.cihaz_id,
    musteri_id: c.musteri_id,
    aciklama: c.tip === "aku" ? sec(["Kapasite hızlı düşüyor", "Gece yarısı kesiliyor", "BMS uyarı veriyor"])
                              : sec(["Öğlen saatlerinde güç düşüyor", "Fan sesi arttı", "Şebeke senkron hatası"]),
    durum: sec(["inceleniyor", "inceleniyor", "onaylandi", "reddedildi"]),
    sinif: sec(["uretim", "kullanim", "dis", "uretim"]),
    guven: Number(aralik(0.6, 0.94).toFixed(2)),
    tarih: gunOnce(tam(1, 60)),
  }));

const BASVURULAR = [
  { musteri_id: "BAS-311", ad: "Mehmet Kaya", email: "mkaya@ornek.com", telefon: "0532 418 22 90",
    il: "Adana", ilce: "Çukurova", adres: "Turgut Özal Blv. No:118 D:6", posta_kodu: "01170", urun: "ikisi", olusturma: gunOnce(1) },
  { musteri_id: "BAS-312", ad: "Selin Arslan", email: "selin.arslan@ornek.com", telefon: "0544 902 13 55",
    il: "Mersin", ilce: "Mezitli", adres: "Deniz Mh. 3212 Sk. No:4", posta_kodu: "33200", urun: "aku", olusturma: gunOnce(2) },
  { musteri_id: "BAS-313", ad: "Ceyhan Tarım Ltd.", email: "bilgi@ceyhantarim.com", telefon: "0322 613 40 40",
    il: "Adana", ilce: "Ceyhan", adres: "Organize Sanayi 4. Cd. No:9", posta_kodu: "01960", urun: "inverter", olusturma: gunOnce(4) },
];

/* ── ölçüm üreticileri ── */

function sonOlcum(c) {
  const bozuk = c.saglik != null && c.saglik < 85;
  if (c.tip === "aku") {
    if (!c.musteri_id) return null;
    const taban = 3290 + tam(-15, 15);
    const hucreler = Array.from({ length: 16 }, () => taban + tam(-12, 12));
    if (bozuk) hucreler[6] -= c.saglik < 65 ? tam(70, 120) : tam(35, 60);
    const fark = Math.max(...hucreler) - Math.min(...hucreler);
    const sicakliklar = [tam(24, 33), tam(24, 33), bozuk ? tam(36, 43) : tam(25, 32), -40];
    return {
      // backend'in kaydettiği türetilmiş alanlar (DEVIR §4)
      gerilim: Number((hucreler.reduce((a, b) => a + b, 0) / 1000).toFixed(2)),
      max_hucre_mv: Math.max(...hucreler),
      min_hucre_mv: Math.min(...hucreler),
      min_hucre_no: hucreler.indexOf(Math.min(...hucreler)) + 1,
      max_sicaklik: Math.max(...sicakliklar),
      zaman: new Date(Date.now() - tam(2, 9) * 60000).toISOString(),
      hucreler,
      hucre_farki_mv: fark,
      sicakliklar,
      sarj_mos: true,
      desarj_mos: !(c.durum === "arizali" && r() < 0.5),
      dengeleme_hucreleri: bozuk ? [7] : [],
      hata_kodlari: bozuk
        ? [{ kod: "W-012", mesaj: "Hücre gerilim farkı eşik üzerinde", seviye: c.saglik < 65 ? "kritik" : "uyari" }]
        : [],
      akim: Number(aralik(-28, 34).toFixed(1)),
      soc: c.son_soc,
      cevrim: tam(180, 1250),
      oncelikli_mekanizma: c.oncelikli,
      ozet: c.ozet,
    };
  }
  if (!c.musteri_id) return null;
  return {
    zaman: new Date(Date.now() - tam(2, 9) * 60000).toISOString(),
    igbt: tam(bozuk ? 64 : 44, bozuk ? 78 : 60),
    sogutucu: tam(bozuk ? 49 : 34, bozuk ? 58 : 46),
    dc_gerilim: tam(380, 420),
    ac_gerilim: tam(226, 234),
    frekans: 50.0,
    guc_faktoru: Number(aralik(0.95, 0.99).toFixed(2)),
    thd: Number(aralik(bozuk ? 4.2 : 1.8, bozuk ? 6.8 : 3.6).toFixed(1)),
    gunluk_kwh: c.gunluk_kwh,
    oncelikli_mekanizma: c.oncelikli,
    ozet: c.ozet,
  };
}

function gecmis(c, gun) {
  const olcumler = [];
  const bozuk = c.saglik != null && c.saglik < 85;
  for (let g = gun - 1; g >= 0; g--) {
    const zaman = gunOnce(g);
    if (c.tip === "aku") {
      const artis = bozuk ? (gun - g) * (c.saglik < 65 ? 3.2 : 1.6) : 0;
      olcumler.push({ zaman, hucre_farki_mv: 18 + artis + tam(-3, 3) });
    } else {
      const bulut = r() < 0.2 ? aralik(0.35, 0.7) : aralik(0.85, 1.05);
      olcumler.push({ zaman, gunluk_kwh: Number(((c.gunluk_kwh || 30) * bulut * (bozuk ? 0.9 : 1)).toFixed(1)) });
    }
  }
  return olcumler;
}

/* ── yönlendirici ── */

const bekle = (ms) => new Promise((ok) => setTimeout(ok, ms));

const MUSTERI_OTURUMU = "MUS-1003";

// Testlerin denetlediği yan etkiler
export const KAYITLAR = [];
export const SILINENLER = [];
export const ABONELIKLER = new Map();
export const ASISTAN_ISTEKLERI = [];
const SIFRE_KODLARI = {};

/** yol: "/de/..." (?sorgu dahil), govde: nesne, token: Bearer değeri. */
export async function sahteIstek(yol, govde = {}, token = "") {
  await bekle(40 + Math.random() * 80);
  const [yolu, sorgu = ""] = yol.split("?");
  const q = Object.fromEntries(new URLSearchParams(sorgu));
  const musteri = token === "T-MUSTERI" ? MUSTERI_OTURUMU : null;
  // Müşteri rolünde backend veriyi kendiliğinden süzer (DEVIR §3).
  const gorunur = (c) => !musteri || c.musteri_id === musteri;
  const cihaz = (id) => CIHAZLAR.find((c) => c.cihaz_id === id && gorunur(c));

  switch (yolu) {
    case "/de/asistan": {
      ASISTAN_ISTEKLERI.push(govde);
      // Gerçek uç dil modeline gider. Burada: genel sorular için sahte yanıt.
      // Sistem verisi (baglam) GÖNDERİLMEMELİ — veri soruları ayrıştırıcıda yanıtlanır.
      if (govde.baglam) throw Object.assign(new Error("baglam gönderilmemeli"), { durum: 400 });
      if (/sınır testi/i.test(govde.soru || "")) {
        throw Object.assign(new Error("Bugünkü soru hakkınız doldu; yarın tekrar sorabilirsiniz."), { durum: 429 });
      }
      if (!["musteri", "uretici"].includes(govde.panel)) throw Object.assign(new Error("panel eksik"), { durum: 400 });
      if (govde.gorsel) {
        const g = govde.gorsel;
        if (g.tur !== "image/jpeg" || !/^[A-Za-z0-9+/]+=*$/.test(g.veri) || g.veri.length > 3_000_000) {
          throw Object.assign(new Error("Fotoğraf okunamadı."), { durum: 400 });
        }
        return { yanit: `FOTOĞRAF İNCELENDİ (${Math.round(g.veri.length / 1024)} KB, soru: ${govde.soru || "-"}). Etikette 51,2 V yazıyor.` };
      }
      if (/dolar|kur/i.test(govde.soru || "")) {
        return { yanit: "Bugün 1 dolar yaklaşık 41 TL.\n\nKaynaklar:\n- [tcmb.gov.tr](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA)",
                 arama: '<div class="chip"><a href="https://www.google.com/search?q=dolar+kuru">dolar kuru bugün</a></div>' };
      }
      if (/kod yaz/i.test(govde.soru || "")) {
        return { yanit: "İşte örnek:\n```python\ndef topla(a, b):\n    return a + b\n```\nBaşka dil istersen söyle." };
      }
      const veriSizdi = (govde.gecmis || []).some((m) => /şarj %|adres:|tel:/.test(m.metin));
      return { yanit: `**Genel yanıt** (${govde.panel}, geçmiş ${govde.gecmis?.length ?? 0}${veriSizdi ? ", VERİ SIZDI" : ""}):\n` +
        `Bu genel bir sorudur.\n\nKaynaklar:\n- https://ornek.org/lfp-bakim` };
    }
    // ── hesap uçları (aws/ekler/hesap.py) ──
    case "/de/sifre/unuttum":
      if (String(govde.kaptcha_cevap).toLowerCase() !== "k4tm9")
        throw Object.assign(new Error("Dogrulama kodu hatali veya suresi doldu"), { durum: 400 });
      SIFRE_KODLARI[String(govde.eposta)] = "123456";
      return { ok: true, mesaj: "Bu e-posta ile bir hesap varsa dogrulama kodu gonderildi." };
    case "/de/sifre/sifirla":
      if (SIFRE_KODLARI[String(govde.eposta)] !== govde.kod) throw Object.assign(new Error("Kod hatali"), { durum: 400 });
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(govde.yeni_sifre || ""))
        throw Object.assign(new Error("Sifre kurallara uymuyor: en az 8 karakter, buyuk harf, kucuk harf ve rakam"), { durum: 400 });
      delete SIFRE_KODLARI[String(govde.eposta)];
      return { ok: true };
    case "/de/hesap/sil":
      if (!musteri) throw Object.assign(new Error("Bu islem yalnizca musteri hesaplari icindir"), { durum: 403 });
      if (govde.sifre !== "Sifre1234") throw Object.assign(new Error("Sifre hatali"), { durum: 403 });
      SILINENLER.push(musteri);
      return { ok: true };
    case "/de/bildirim/abone":
    case "/de/bildirim/iptal": {
      const uc = String(govde.abonelik?.endpoint || "");
      if (!/^https:\/\/([^/]+\.)?(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com)\//.test(uc))
        throw Object.assign(new Error("Gecersiz bildirim aboneligi"), { durum: 400 });
      if (yolu.endsWith("abone")) ABONELIKLER.set(uc, { rol: musteri ? "musteri" : "uretici", anahtarlar: govde.abonelik.keys });
      else ABONELIKLER.delete(uc);
      return { ok: true };
    }
    case "/de/kaptcha":
      return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="46"><rect width="150" height="46" fill="#F8FAFC"/><text x="22" y="31" font-size="24" font-family="monospace" fill="#0F172A">k4Tm9</text></svg>',
               token: "kaptcha-test", saniye: 30 };
    case "/de/giris": {
      if (String(govde.kaptcha_cevap).toLowerCase() !== "k4tm9")
        throw Object.assign(new Error("Dogrulama kodu hatali veya suresi doldu"), { durum: 400 });
      const m = String(govde.eposta).includes("musteri");
      return { erisim: m ? "T-MUSTERI" : "T-URETICI", yenile: "Y", eposta: govde.eposta };
    }
    case "/de/token/yenile":
      return { erisim: token || "T-URETICI" };
    case "/de/musteri/kayit":
      // KVKK yaması: aydınlatma onayı zorunlu (aws/ekler/yamala.py, H)
      if (govde.kvkk_aydinlatma !== true) throw Object.assign(new Error("Kayit icin Aydinlatma Metni onayi gerekli"), { durum: 400 });
      KAYITLAR.push(govde);
      // Canlı backend OTOMATIK_ONAY açıkken (varsayılan) hesap hemen onaylanır
      return { musteri_id: "MST-9001", otomatik_onay: true, mesaj: "Hesabiniz acildi. Giris yapabilirsiniz." };
    case "/de/ozet": {
      const s = (f) => CIHAZLAR.filter(f).length;
      return { ozet: {
        toplam: CIHAZLAR.length,
        sahada: s((c) => c.musteri_id),
        depoda: s((c) => c.durum === "depoda"),
        sevkte: s((c) => c.durum === "sevkte"),
        arizali: s((c) => c.durum === "arizali"),
        uyarida: s((c) => c.durum === "uyari"),
        aku: s((c) => c.tip === "aku" && c.musteri_id),
        inverter: s((c) => c.tip === "inverter" && c.musteri_id),
      } };
    }
    case "/de/cihaz/liste":
      return { cihazlar: CIHAZLAR.filter((c) => gorunur(c) &&
        (!q.tip || c.tip === q.tip) && (!q.musteri_id || c.musteri_id === q.musteri_id)) };
    case "/de/cihaz/detay": {
      const c = cihaz(q.cihaz_id);
      if (!c) throw Object.assign(new Error("Cihaz bulunamadı"), { durum: 404 });
      return {
        cihaz: c,
        son_olcum: sonOlcum(c),
        temel_durum: null,
        kalan_sure: c.kalan_gun != null ? { kalan_gun: c.kalan_gun, guven: c.guven } : null,
      };
    }
    case "/de/cihaz/gecmis": {
      const c = cihaz(q.cihaz_id);
      return { olcumler: c?.musteri_id ? gecmis(c, Number(q.gun) || 30) : [] };
    }
    case "/de/musteri/liste":
      return { musteriler: MUSTERILER.filter((m) => !musteri || m.musteri_id === musteri) };
    case "/de/musteri/guncelle": {
      const m = MUSTERILER.find((x) => x.musteri_id === govde.musteri_id);
      if (!m) throw Object.assign(new Error("Müşteri bulunamadı"), { durum: 404 });
      for (const k of ["ad", "tip", "il", "ilce", "adres", "telefon", "email", "lat", "lng"]) {
        if (govde[k] !== undefined) m[k] = govde[k];
      }
      return { ok: true };
    }
    case "/de/garanti/liste":
      return { talepler: GARANTI.filter((t) => !musteri || t.musteri_id === musteri) };
    case "/de/garanti/guncelle": {
      const t = GARANTI.find((x) => x.talep_id === govde.talep_id);
      if (t) { t.durum = govde.durum ?? t.durum; t.sinif = govde.sinif ?? t.sinif; }
      return { ok: true };
    }
    case "/de/parti/liste":
      return { partiler: PARTILER.map((p) => {
        const c = CIHAZLAR.filter((x) => x.parti === p.kod);
        const uretilen = c.length * 12;
        const kurulu = c.filter((x) => x.musteri_id).length * 9;
        return {
          parti_kod: p.kod, tip: p.tip, uretilen,
          sevk: Math.round(uretilen * 0.86), kurulu,
          depoda: uretilen - Math.round(uretilen * 0.86),
          arizali: c.filter((x) => x.durum === "arizali").length * 2 + (p.kod === "D24-A02" ? 4 : 0),
          son_uretim: gunOnce(p.gun),
        };
      }) };
    case "/de/analiz/kaynak": {
      const c = cihaz(q.cihaz_id);
      if (!c?.oncelikli) throw Object.assign(new Error("Analiz yok"), { durum: 404 });
      // Sonuç cihaz başına sabit olsun: sayfa her açıldığında değişmesin.
      const h = [...c.cihaz_id].reduce((t, ch) => t + ch.charCodeAt(0), 0);
      const uretim = c.parti === "D24-A02" || c.oncelikli === "kondansator_esr" || h % 3 === 0;
      return { analiz: {
        sinif: uretim ? "uretim" : h % 2 ? "kullanim" : "dis",
        guven: Number((0.62 + (h % 30) / 100).toFixed(2)),
        gerekceler: [c.ozet, uretim
          ? "Aynı partideki diğer cihazlarda benzer eğilim var."
          : "Bozulma, kullanım profilindeki değişiklikle eş zamanlı başladı."],
        garanti_yorum: uretim ? "Garanti değerlendirmesine uygun" : "Garanti dışı değerlendirilebilir",
      } };
    }
    case "/de/kayit/liste":
      return { basvurular: BASVURULAR };
    case "/de/musteri/olustur": {
      if (!govde.ad?.trim()) throw Object.assign(new Error("Ad zorunlu"), { durum: 400 });
      const m = {
        musteri_id: `MUS-${1001 + MUSTERILER.length}`,
        ad: govde.ad.trim(), tip: govde.tip || "Konut", il: govde.il || "", ilce: govde.ilce || "",
        adres: govde.adres || "", telefon: govde.telefon || "", email: govde.email || "",
        lat: govde.lat ?? null, lng: govde.lng ?? null, olusturma: new Date().toISOString(),
      };
      MUSTERILER.push(m);
      return { musteri_id: m.musteri_id };
    }
    case "/de/garanti/talep": {
      const c = cihaz(govde.cihaz_id);
      if (!c) throw Object.assign(new Error("Cihaz bulunamadı"), { durum: 404 });
      const t = {
        talep_id: `GT-${2500 + GARANTI.length}`, cihaz_id: c.cihaz_id, musteri_id: c.musteri_id,
        aciklama: govde.aciklama, durum: "inceleniyor", sinif: "belirsiz", guven: null,
        tarih: new Date().toISOString(),
      };
      GARANTI.unshift(t);
      return { talep_id: t.talep_id };
    }
    case "/de/kayit/karar": {
      const i = BASVURULAR.findIndex((b) => b.musteri_id === govde.musteri_id);
      if (i >= 0) BASVURULAR.splice(i, 1);
      return { ok: true };
    }
    default:
      throw Object.assign(new Error(`Demo modunda desteklenmeyen uç nokta: ${yolu}`), { durum: 404 });
  }
}
