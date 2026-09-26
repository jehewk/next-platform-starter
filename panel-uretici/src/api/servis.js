import { api } from "./istemci";
import { mekanizmaAdi, ESIK } from "../veri/yardimci";

/**
 * Backend ↔ frontend adaptör katmanı.
 *
 * Backend snake_case (cihaz_id, uretim_tarihi, guc_kw) kullanır,
 * mevcut sayfalar Türkçe camelCase (cihazId, uretim, gucKw) bekler.
 * Bu dosya tek yerdir bu iki sözlük birbirine çevrilir — sayfa kodu
 * hangi kaynaktan veri geldiğini bilmek zorunda kalmaz.
 */

// ══════════════════ CİHAZ ══════════════════

function cihazUyarla(c) {
  return {
    id: c.cihaz_id,
    tip: c.tip,
    model: c.model,
    parti: c.parti,
    musteriId: c.musteri_id,
    durum: c.durum,
    saglik: c.saglik ?? null,
    uretim: c.uretim_tarihi,
    kurulum: c.kurulum_tarihi,
    kapasiteAh: c.kapasite_ah,
    hucreSayisi: c.hucre_sayisi,
    gucKw: c.guc_kw,
    sarj: c.son_soc ?? null,
    gunlukKwh: c.gunluk_kwh ?? null,
    oncelikli: c.oncelikli || null,   // fizik motorunun öne çıkardığı mekanizma
    ozet: c.ozet || "",
    kalanSaat: c.kalan_gun != null ? Math.round(c.kalan_gun * 24) : null,
    guven: c.guven ?? null,
  };
}

export async function cihazListesi(filtre = {}) {
  const qs = new URLSearchParams(filtre).toString();
  const { cihazlar } = await api.get(`/de/cihaz/liste${qs ? "?" + qs : ""}`);
  return cihazlar.map(cihazUyarla);
}

export async function cihazBul(cihazId) {
  const { cihaz, son_olcum, temel_durum, kalan_sure } = await api.get(
    `/de/cihaz/detay?cihaz_id=${encodeURIComponent(cihazId)}`
  );

  // GenelBakis kuyruğu ve kart bileşenleri "tahmin" adında tek bir
  // nesne bekler; backend bu bilgiyi iki ayrı yerden verir
  // (son_olcum.oncelikli_mekanizma + kalan_sure). Burada birleştirilir.
  const saglikDusuk = cihaz.saglik != null && Number(cihaz.saglik) < ESIK.uyari;
  const tahmin = saglikDusuk && son_olcum?.oncelikli_mekanizma
    ? {
        mekanizma: son_olcum.oncelikli_mekanizma,
        bilesen: mekanizmaAdi(son_olcum.oncelikli_mekanizma),
        gerekce: son_olcum.ozet || "",
        kalanSaat: kalan_sure?.kalan_gun != null ? Math.round(kalan_sure.kalan_gun * 24) : null,
        guven: kalan_sure?.guven ?? null,
      }
    : null;

  return {
    ...cihazUyarla(cihaz), sonOlcum: son_olcum, temelDurum: temel_durum,
    kalanSure: kalan_sure, tahmin,
  };
}

/**
 * AkuDetay.jsx / InverterDetay.jsx'in beklediği zengin şekle çevirir.
 *
 * Backend tek bir "son ölçüm" gönderir (anlık durum); geçmiş eğilimi
 * ayrı bir çağrıyla (cihazGecmisi) istenir. Ölçüm yoksa (cihaz henüz
 * hiç veri göndermemiş) alanlar null döner — sayfa bunu "veri
 * bekleniyor" olarak göstermelidir, sıfır olarak değil.
 */
export function akuDetayUyarla(cihaz) {
  const o = cihaz.sonOlcum;
  if (!o) {
    return {
      veriYok: true,
      hucreler: [], enYuksek: null, enDusuk: null, ortalama: null, fark: null,
      sicakliklar: [], sarjMos: null, desarjMos: null, dengeleme: [],
      hatalar: [], egilim: [], akim: null,
      kalanKapasiteAh: null, toplamKapasiteAh: cihaz.kapasiteAh ?? null,
      paketGerilim: null, sicaklik: null, cevrim: null,
    };
  }

  const hucreler = (o.hucreler || []).map((mv, i) => ({ no: i + 1, gerilim: mv / 1000 }));
  const gerilimler = hucreler.map((h) => h.gerilim);
  const enYuksek = hucreler.reduce((a, b) => (b.gerilim > a.gerilim ? b : a), hucreler[0]);
  const enDusuk = hucreler.reduce((a, b) => (b.gerilim < a.gerilim ? b : a), hucreler[0]);
  const ortalama = gerilimler.length
    ? gerilimler.reduce((a, b) => a + b, 0) / gerilimler.length : null;

  return {
    veriYok: false,
    hucreler,
    enYuksek: enYuksek ? { no: enYuksek.no, deger: enYuksek.gerilim } : null,
    enDusuk: enDusuk ? { no: enDusuk.no, deger: enDusuk.gerilim } : null,
    ortalama: ortalama != null ? Number(ortalama.toFixed(3)) : null,
    fark: o.hucre_farki_mv != null ? o.hucre_farki_mv / 1000 : null,
    sicakliklar: (o.sicakliklar || []).map((s, i) => ({ no: i + 1, deger: s })),
    sarjMos: o.sarj_mos ?? null,
    desarjMos: o.desarj_mos ?? null,
    dengeleme: o.dengeleme_hucreleri || [],
    hatalar: (o.hata_kodlari || []).map((h) => ({
      kod: h.kod || h, mesaj: h.mesaj || "", seviye: h.seviye || "uyari",
    })),
    egilim: cihaz.gecmis || [],
    akim: o.akim ?? null,
    kalanKapasiteAh: o.soc != null && cihaz.kapasiteAh
      ? Number(((o.soc / 100) * cihaz.kapasiteAh).toFixed(1)) : null,
    toplamKapasiteAh: cihaz.kapasiteAh ?? null,
    // Paket gerilimi hücrelerin toplamıdır; sıcaklık bağlı sensörlerin en yükseği.
    paketGerilim: o.paket_gerilim ?? (gerilimler.length
      ? Number(gerilimler.reduce((a, b) => a + b, 0).toFixed(2)) : null),
    sicaklik: (() => {
      const bagli = (o.sicakliklar || []).filter((t) => t != null && t > -40);
      return bagli.length ? Math.max(...bagli) : null;
    })(),
    cevrim: o.cevrim ?? null,
  };
}

/** Geçmiş ölçümlerden günlük hücre gerilim farkını (ortalama, mV) çıkarır. */
export async function cihazGecmisi(cihazId, gunSayisi = 30) {
  const { olcumler } = await api.get(
    `/de/cihaz/gecmis?cihaz_id=${encodeURIComponent(cihazId)}&gun=${gunSayisi}`
  );
  if (!olcumler?.length) return [];

  // günlük ortanca — tek bir aykırı ölçüm günü bozmasın
  const gunler = {};
  for (const o of olcumler) {
    const gun = (o.zaman || "").slice(0, 10);
    if (!gun || o.hucre_farki_mv == null) continue;
    (gunler[gun] ??= []).push(o.hucre_farki_mv);
  }
  const sirali = Object.entries(gunler).sort(([a], [b]) => a.localeCompare(b));
  if (sirali.length < 2) return [];

  const ilkGun = sirali[0][1];
  const ilkDeger = ilkGun.reduce((a, b) => a + b, 0) / ilkGun.length;

  return sirali.map(([gun, degerler], i) => {
    const ort = degerler.reduce((a, b) => a + b, 0) / degerler.length;
    return {
      no: i + 1,
      gun,
      farkMv: Math.round(ort),
      degisim: Number((((ilkDeger - ort) / ilkDeger) * 100).toFixed(1)),
    };
  });
}

// ══════════════════ MÜŞTERİ ══════════════════

function musteriUyarla(m) {
  return {
    id: m.musteri_id, ad: m.ad, tip: m.tip, il: m.il, ilce: m.ilce,
    adres: m.adres, telefon: m.telefon, email: m.email,
    lat: m.lat ?? null, lng: m.lng ?? null, kurulum: m.olusturma,
  };
}

export async function musteriListesi() {
  const { musteriler } = await api.get("/de/musteri/liste");
  return musteriler.map(musteriUyarla);
}

export async function musteriBul(musteriId) {
  const hepsi = await musteriListesi();
  return hepsi.find((m) => m.id === musteriId) || null;
}

/** Müşteri kaydını düzenler. Yalnızca gönderilen alanlar değişir. */
export async function musteriGuncelle(musteriId, alanlar) {
  return api.post("/de/musteri/guncelle", { musteri_id: musteriId, ...alanlar });
}

export async function musteriOlustur(veri) {
  return api.post("/de/musteri/olustur", veri);
}

// ══════════════════ ÖZET / KUYRUK ══════════════════

export async function genelOzet() {
  const { ozet } = await api.get("/de/ozet");
  return {
    toplam: ozet.toplam, sahada: ozet.sahada, depoda: ozet.depoda,
    sevkte: ozet.sevkte, arizali: ozet.arizali, uyarida: ozet.uyarida,
    aku: ozet.aku, inverter: ozet.inverter,
  };
}

/** Sağlığı düşük cihazları önceliğe göre sıralar — Genel İzleme'nin kuyruğu. */
export async function mudahaleKuyrugu() {
  const cihazlar = await cihazListesi();
  const musteriler = await musteriListesi();
  const musteriMap = Object.fromEntries(musteriler.map((m) => [m.id, m.ad]));

  return cihazlar
    .filter((c) => c.saglik != null && c.saglik < ESIK.uyari)
    .sort((a, b) => a.saglik - b.saglik)
    .map((c) => ({
      id: c.id, tip: c.tip, musteriId: c.musteriId,
      musteriAd: musteriMap[c.musteriId] || "—",
      saglik: c.saglik,
      bilesen: c.oncelikli ? mekanizmaAdi(c.oncelikli) : "İzleniyor",
      gerekce: c.ozet || "",
      kalanSaat: c.kalanSaat ?? null,
      guven: c.guven ?? null,
    }));
}

// ══════════════════ GARANTİ ══════════════════

function garantiUyarla(g) {
  return {
    id: g.talep_id, cihazId: g.cihaz_id, musteriId: g.musteri_id,
    aciklama: g.aciklama, durum: g.durum, sinif: g.sinif,
    guven: g.guven, oneri: g.oneri, oneriNot: g.oneri_not,
    gerekceler: g.gerekceler || [], tarih: g.tarih,
  };
}

export async function garantiListesi() {
  const { talepler } = await api.get("/de/garanti/liste");
  return talepler.map(garantiUyarla);
}

export async function garantiTalepOlustur(cihazId, aciklama) {
  return api.post("/de/garanti/talep", { cihaz_id: cihazId, aciklama });
}

export async function garantiGuncelle(talepId, durum, sinif) {
  return api.post("/de/garanti/guncelle", { talep_id: talepId, durum, sinif });
}

// ══════════════════ PARTİ / ÜRETİM ══════════════════

export async function partiListesi() {
  const { partiler } = await api.get("/de/parti/liste");
  return partiler.map((p) => ({
    kod: p.parti_kod, tip: p.tip, adet: p.uretilen || 0,
    sevk: p.sevk || 0, kurulu: p.kurulu || 0, depoda: p.depoda || 0, arizali: p.arizali || 0,
    tarih: p.son_uretim || null,
  }));
}

/**
 * Üretim hattında yeni cihaz kaydı.
 * veri: {tip, model, parti, adet, kapasite_ah?, guc_kw?} → {cihazlar: [cihaz_id…]}
 */
export async function cihazUret(veri) {
  return api.post("/de/cihaz/uret", veri);
}

/**
 * Cihazın lojistik durumunu / müşterisini değiştirir.
 * alanlar: {durum?: "depoda"|"sevkte"|"aktif", musteri_id?: string|null}
 */
export async function cihazGuncelle(cihazId, alanlar) {
  return api.post("/de/cihaz/guncelle", { cihaz_id: cihazId, ...alanlar });
}

// ══════════════════ İNVERTER DETAYI ══════════════════

/** InverterDetay.jsx'in beklediği şekle çevirir (bkz. akuDetayUyarla). */
export function inverterDetayUyarla(cihaz) {
  const o = cihaz.sonOlcum;
  return {
    igbt: o?.igbt ?? null,
    sogutucu: o?.sogutucu ?? null,
    dcV: o?.dc_gerilim ?? null,
    acV: o?.ac_gerilim ?? null,
    frekans: o?.frekans ?? null,
    pf: o?.guc_faktoru ?? null,
    thd: o?.thd ?? null,
    gunlukKwh: o?.gunluk_kwh ?? null,
  };
}

export async function uretimGecmisiGetir(cihazId, gunSayisi = 14) {
  const { olcumler } = await api.get(
    `/de/cihaz/gecmis?cihaz_id=${encodeURIComponent(cihazId)}&gun=${gunSayisi}`
  );
  const gunler = {};
  for (const o of olcumler || []) {
    const gun = (o.zaman || "").slice(5, 10);
    if (!gun) continue;
    // gunluk_kwh inverterin gün içi kümülatif sayacıdır; aynı günün
    // ölçümlerini toplamak üretimi onlarca kat şişirir. Günün en büyük
    // değeri o günün üretimidir.
    gunler[gun] = Math.max(gunler[gun] || 0, Number(o.gunluk_kwh) || 0);
  }
  return Object.entries(gunler)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([gun, uretim]) => ({ gun, uretim: Number(uretim.toFixed(1)) }));
}

// ══════════════════ ARIZA KAYNAĞI ANALİZİ ══════════════════

export async function kaynakAnalizi(cihazId) {
  const { analiz } = await api.get(`/de/analiz/kaynak?cihaz_id=${encodeURIComponent(cihazId)}`);
  return {
    sinif: analiz.sinif,
    guven: analiz.guven,
    bulgu: (analiz.gerekceler || []).join(" "),
    gerekceler: analiz.gerekceler || [],
    garantiYorum: analiz.garanti_yorum,
  };
}

// ══════════════════ KAYIT BAŞVURULARI ══════════════════

export async function basvuruListesi() {
  const { basvurular } = await api.get("/de/kayit/liste");
  return basvurular.map((b) => ({
    id: b.musteri_id, ad: b.ad, eposta: b.email, telefon: b.telefon,
    il: b.il, ilce: b.ilce, adres: b.adres, postaKodu: b.posta_kodu || "",
    urun: b.urun, tarih: b.olusturma,
  }));
}

/** karar: "onay" | "ret" */
export async function basvuruKarar(musteriId, karar) {
  return api.post("/de/kayit/karar", { musteri_id: musteriId, karar });
}
