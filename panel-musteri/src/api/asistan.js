import { api } from "./istemci";
import { garantiListesi, uretimGecmisiGetir } from "./servis";
import { sistemimiGetir, olcumYasiDk, SESSIZ_DAKIKA } from "./sistem";
import { garantiDurumu, onceMetni } from "../veri/yardimci";
import { musteriDurumu, musteriMesaji, enerjiAkisi, paketGerilimi, enYuksekSicaklik, TALEP_DURUMU } from "../veri/sadeDil";

/**
 * Müşteri sohbeti.
 *
 * VITE_ASISTAN_YOLU tanımlıysa soru sunucuya gider (dil modeli; anahtar
 * sunucuda — aws/asistan-kur.ps1). Her konuda soru sorulabilir; müşterinin
 * kendi sisteminin kısa özeti (baglam) de gönderilir, böylece sistem
 * soruları da yanıtlanır. Yoksa ya da çağrı başarısız olursa, müşterinin KENDİ
 * cihazlarının son ölçümleriyle çalışan yerel motor sade dilde yanıtlar.
 * Teknik gerekçe (hücre no, mV) müşteriye gösterilmez — sadeDil.js.
 */

const UZAK_YOL = import.meta.env.VITE_ASISTAN_YOLU;

export const ORNEK_SORULAR = [
  "Sistemim nasıl?",
  "Akümde ne kadar enerji var?",
  "Bugün ne kadar ürettim?",
  "Garantim ne zaman bitiyor?",
  "Destek talebim ne durumda?",
  "Akümün ömrünü nasıl uzatırım?",
];

export async function soruSor(soru, gecmis = []) {
  let uzakHata = null;
  if (UZAK_YOL) {
    try {
      const baglam = await baglamOlustur().catch(() => "");
      const c = await api.post(UZAK_YOL, { soru, gecmis: gecmis.slice(-12), baglam, panel: "musteri" });
      if (c?.yanit) return c.yanit;
      uzakHata = "boş yanıt";
    } catch (e) {
      // Günlük sınır ya da zaman aşımı: sunucunun mesajı gösterilir. Diğer
      // hatalarda yerel motor yanıtlar ve nedeni yanıtın altına yazılır.
      if (e?.durum === 429 || e?.durum === 504) return e.message;
      uzakHata = `${e?.message || "bağlantı hatası"}${e?.durum ? ` (${e.durum})` : ""}`;
    }
  }
  const { cihazlar } = await sistemimiGetir();
  const yerel = await yanitla(soru, cihazlar.filter((c) => ["aktif", "uyari", "arizali"].includes(c.durum)));
  return uzakHata ? `${yerel}\n\n(Asistana şu an ulaşılamadı: ${uzakHata}. Bu yanıt cihaz verinizden hazırlandı.)` : yerel;
}

const ad = (c) => (c.tip === "aku" ? "Akü" : "İnverter");

/** Dil modeline giden kısa özet: yalnızca bu müşterinin kendi cihazları ve talepleri. */
async function baglamOlustur() {
  const { cihazlar } = await sistemimiGetir();
  const satirlar = [`Tarih: ${new Date().toLocaleString("tr-TR")}`];
  if (!cihazlar.length) return satirlar.concat("Müşterinin hesabında henüz kurulu cihaz yok.").join("\n");
  satirlar.push(`Cihazlar (${cihazlar.length}):`);
  for (const c of cihazlar.slice(0, 20)) {
    const o = c.sonOlcum || {};
    const p = [`${ad(c)} ${c.id}`];
    const ekle = (f) => { try { const v = f(); if (v) p.push(v); } catch { /* eksik alan */ } };
    ekle(() => c.model && `model ${c.model}`);
    ekle(() => c.durum && `durum ${c.durum}`);
    ekle(() => c.saglik != null && `sağlık ${Math.round(c.saglik)}/100`);
    ekle(() => o.soc != null && `şarj %${Math.round(Number(o.soc))}`);
    ekle(() => c.kapasiteAh && `kapasite ${c.kapasiteAh} Ah`);
    ekle(() => { const a = enerjiAkisi(paketGerilimi(o), Number(o.akim)); return a && `${a.metin}${a.kw != null ? ` ${a.kw.toFixed(1)} kW` : ""}`; });
    ekle(() => { const t = enYuksekSicaklik(o); return t != null && `sıcaklık ${t} °C`; });
    ekle(() => { const k = o.gunluk_kwh ?? c.gunlukKwh; return k != null && `bugünkü üretim ${Number(k).toFixed(1)} kWh`; });
    ekle(() => o.zaman && `son ölçüm ${onceMetni(o.zaman)}`);
    ekle(() => { const g = garantiDurumu(c); return g.bitis && `garanti ${g.bitis.toLocaleDateString("tr-TR")}${g.gecerli ? "'e kadar" : " tarihinde doldu"}`; });
    ekle(() => c.tahmin && `uyarı: ${musteriMesaji(c.tahmin, c.saglik).baslik}`);
    satirlar.push("- " + p.join("; "));
  }
  const talepler = await garantiListesi().catch(() => []);
  if (talepler.length) {
    satirlar.push("Destek talepleri:");
    talepler.slice(0, 5).forEach((t) => satirlar.push(`- ${t.cihazId}: ${TALEP_DURUMU[t.durum]?.ad || t.durum}${t.aciklama ? ` — ${String(t.aciklama).slice(0, 120)}` : ""}`));
  }
  return satirlar.join("\n");
}

async function yanitla(soru, cihazlar) {
  const s = soru.toLocaleLowerCase("tr");
  const gecer = (...k) => k.some((x) => s.includes(x));
  const akuler = cihazlar.filter((c) => c.tip === "aku");
  const invler = cihazlar.filter((c) => c.tip === "inverter");

  if (!cihazlar.length) {
    return "Hesabınızda henüz kurulu cihaz görünmüyor. Kurulum ekibimiz cihazınızı eşleştirdiğinde " +
      "durumunu buradan sorabilirsiniz.";
  }

  if (gecer("destek", "talep", "servis", "başvuru", "basvuru", "şikayet")) {
    const talepler = await garantiListesi().catch(() => []);
    if (!talepler.length) {
      return "Açık bir destek talebiniz yok. Bir sorun yaşıyorsanız Destek sekmesinden " +
        "yeni talep oluşturabilirsiniz; ekibimiz cihaz verilerinizle birlikte inceler.";
    }
    return "Destek talepleriniz:\n" + talepler.slice(0, 5).map((t) =>
      `· ${t.cihazId} — ${TALEP_DURUMU[t.durum]?.ad || t.durum}${t.aciklama ? ` („${t.aciklama}")` : ""}`).join("\n");
  }

  if (gecer("garanti")) {
    return "Garanti süreleriniz:\n" + cihazlar.map((c) => {
      const g = garantiDurumu(c);
      if (!g.bitis) return `· ${ad(c)} ${c.id} — bilgi yok`;
      const tarih = g.bitis.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
      return g.gecerli
        ? `· ${ad(c)} ${c.id} — ${tarih} tarihine kadar (${Math.round(g.kalanGun / 30)} ay)`
        : `· ${ad(c)} ${c.id} — garanti süresi ${tarih} tarihinde doldu`;
    }).join("\n") + "\n\nGaranti süresi üretim tarihinden itibaren başlar.";
  }

  if (gecer("üret", "uret", "güneş", "gunes", "kwh", "panel")) {
    if (!invler.length) return "Hesabınızda inverter görünmüyor; üretim bilgisi inverter üzerinden gelir.";
    const satirlar = await Promise.all(invler.map(async (c) => {
      const bugun = c.sonOlcum?.gunluk_kwh ?? c.gunlukKwh;
      const gunler = await uretimGecmisiGetir(c.id, 7).catch(() => []);
      const hafta = gunler.reduce((t, g) => t + g.uretim, 0);
      let t = `· Bugün ${bugun != null ? Number(bugun).toFixed(1) : "—"} kWh ürettiniz`;
      if (gunler.length > 1) t += `, son ${gunler.length} günde toplam ${hafta.toFixed(1)} kWh`;
      return t + ` (${c.id}).`;
    }));
    return satirlar.join("\n");
  }

  if (gecer("akü", "aku", "şarj", "sarj", "batarya", "enerji var", "kalan")) {
    if (!akuler.length) return "Hesabınızda akü görünmüyor.";
    return akuler.map((c) => {
      const o = c.sonOlcum;
      if (!o) return `${c.id}: henüz ölçüm gelmedi.`;
      const soc = Math.round(Number(o.soc));
      const akis = enerjiAkisi(paketGerilimi(o), Number(o.akim));
      const kalan = c.kapasiteAh ? ` Yaklaşık ${Math.round((soc / 100) * c.kapasiteAh)} Ah enerji kaldı.` : "";
      const yon = akis?.yon === "bekleme" ? "Şu an beklemede." : akis ? `${akis.metin} (${akis.kw.toFixed(1)} kW).` : "";
      return `${c.id}: şarj %${soc}.${kalan} ${yon} Son ölçüm ${onceMetni(o.zaman)}.`;
    }).join("\n");
  }

  if (gecer("sıcak", "sicak", "ısı", "isi")) {
    return akuler.map((c) => {
      const t = enYuksekSicaklik(c.sonOlcum);
      if (t == null) return `${c.id}: sıcaklık bilgisi yok.`;
      const not = t >= 45 ? " Normalden sıcak; cihazın çevresinin havalandığından emin olun." : " Normal aralıkta.";
      return `${c.id}: ${t} °C.${not}`;
    }).join("\n") || "Sıcaklık bilgisi akü üzerinden gelir; hesabınızda akü görünmüyor.";
  }

  // Varsayılan: genel durum (merhaba, nasıl, durum, sorun var mı…)
  const olculen = cihazlar.filter((c) => c.saglik != null);
  const enKotu = olculen.length ? olculen.reduce((a, b) => (b.saglik < a.saglik ? b : a)) : null;
  const d = musteriDurumu(enKotu?.saglik ?? null);
  let t = `${d.ad}. ${cihazlar.length} cihazınız izleniyor: ` +
    [akuler.length && `${akuler.length} akü`, invler.length && `${invler.length} inverter`].filter(Boolean).join(", ") + ".";
  if (enKotu?.tahmin) {
    const m = musteriMesaji(enKotu.tahmin, enKotu.saglik);
    t += `\n\n${m.baslik} (${enKotu.id}). ${m.aciklama}`;
  }
  const sessiz = cihazlar.filter((c) => (olcumYasiDk(c) ?? 0) >= SESSIZ_DAKIKA);
  if (sessiz.length) t += `\n\n${sessiz.map((c) => c.id).join(", ")} bir süredir veri göndermiyor; Wi-Fi bağlantısını kontrol edin.`;
  if (!gecer("durum", "nasıl", "nasil", "sorun", "merhaba", "selam", "genel")) {
    t += "\n\nŞunları da sorabilirsiniz: akü şarjı, bugünkü üretim, garanti süresi, destek talepleri.";
  }
  return t;
}
