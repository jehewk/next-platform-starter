import { api } from "./istemci";
import { garantiListesi, uretimGecmisiGetir } from "./servis";
import { sistemimiGetir, olcumYasiDk, SESSIZ_DAKIKA } from "./sistem";
import { garantiDurumu, onceMetni } from "../veri/yardimci";
import { musteriDurumu, musteriMesaji, enerjiAkisi, paketGerilimi, enYuksekSicaklik, TALEP_DURUMU } from "../veri/sadeDil";
import { musteriNiyeti } from "./ayristirici";

/**
 * Müşteri sohbeti — iki katman:
 *
 *  1) Ayrıştırıcı (ayristirici.js): "akümde ne kadar enerji var", "bugün ne kadar
 *     ürettim" gibi kendi sistemiyle ilgili sorular serbest Türkçeyle sorulsa da tanınır;
 *     yanıt müşterinin KENDİ cihazlarının son ölçümlerinden, sade dille üretilir.
 *     Veri tarayıcıdan dışarı çıkmaz. Teknik gerekçe (hücre no, mV) gösterilmez — sadeDil.js.
 *  2) Dil modeli (VITE_ASISTAN_YOLU → POST /de/asistan; aws/asistan-kur.ps1): genel
 *     sorular ("selam", "akü kışın nasıl korunur"). Yalnızca SORU METNİ gider; veriden
 *     üretilmiş önceki yanıtlar konuşma geçmişinden de çıkarılır.
 *
 * soruSor {metin, kaynak: "yerel" | "model"} döndürür.
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

/** Dil modeline giden geçmiş: veriden üretilen yanıtlar ve onları doğuran sorular çıkarılır. */
function modelGecmisi(gecmis) {
  const sonuc = [];
  for (let i = 0; i < gecmis.length; i++) {
    const m = gecmis[i];
    if (m.rol === "kullanici" && gecmis[i + 1]?.kaynak === "yerel") { i++; continue; }
    if (m.rol === "asistan" && m.kaynak !== "model") continue;
    sonuc.push({ rol: m.rol, metin: m.metin });
  }
  return sonuc.slice(-12);
}

export async function soruSor(soru, gecmis = []) {
  const niyet = musteriNiyeti(soru);
  if (niyet) {
    const { cihazlar } = await sistemimiGetir();
    return { metin: await yanitla(niyet.niyet, cihazlar.filter((c) => ["aktif", "uyari", "arizali"].includes(c.durum))), kaynak: "yerel" };
  }
  if (!UZAK_YOL) return { metin: anlamadim(), kaynak: "yerel" };
  try {
    const c = await api.post(UZAK_YOL, { soru, gecmis: modelGecmisi(gecmis), panel: "musteri" });
    if (c?.yanit) return { metin: c.yanit, kaynak: "model" };
    return { metin: anlamadim("boş yanıt"), kaynak: "yerel" };
  } catch (e) {
    // Günlük sınır / zaman aşımı: sunucunun mesajı. Diğer hatalar: yardım + neden.
    if (e?.durum === 429 || e?.durum === 504) return { metin: e.message, kaynak: "yerel" };
    return { metin: anlamadim(`${e?.message || "bağlantı hatası"}${e?.durum ? ` (${e.durum})` : ""}`), kaynak: "yerel" };
  }
}

function anlamadim(neden) {
  return "Bu soruyu şu an yanıtlayamıyorum. Sisteminizle ilgili şunları sorabilirsiniz:\n" +
    "· Sistemim nasıl?\n· Akümde ne kadar enerji var?\n· Bugün ne kadar ürettim?\n" +
    "· Garantim ne zaman bitiyor?\n· Destek talebim ne durumda?" +
    (neden ? `\n\n(Genel sorular için asistana ulaşılamadı: ${neden}.)` : "");
}

const ad = (c) => (c.tip === "aku" ? "Akü" : "İnverter");

async function yanitla(niyet, cihazlar) {
  const akuler = cihazlar.filter((c) => c.tip === "aku");
  const invler = cihazlar.filter((c) => c.tip === "inverter");

  if (niyet === "talep") {
    const talepler = await garantiListesi().catch(() => []);
    if (!talepler.length) {
      return "Açık bir destek talebiniz yok. Bir sorun yaşıyorsanız Destek sekmesinden " +
        "yeni talep oluşturabilirsiniz; ekibimiz cihaz verilerinizle birlikte inceler.";
    }
    return "Destek talepleriniz:\n" + talepler.slice(0, 5).map((t) =>
      `· ${t.cihazId} — ${TALEP_DURUMU[t.durum]?.ad || t.durum}${t.aciklama ? ` („${t.aciklama}")` : ""}`).join("\n");
  }

  if (!cihazlar.length) {
    return "Hesabınızda henüz kurulu cihaz görünmüyor. Kurulum ekibimiz cihazınızı eşleştirdiğinde " +
      "durumunu buradan sorabilirsiniz.";
  }

  if (niyet === "garanti") {
    return "Garanti süreleriniz:\n" + cihazlar.map((c) => {
      const g = garantiDurumu(c);
      if (!g.bitis) return `· ${ad(c)} ${c.id} — bilgi yok`;
      const tarih = g.bitis.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
      return g.gecerli
        ? `· ${ad(c)} ${c.id} — ${tarih} tarihine kadar (${Math.round(g.kalanGun / 30)} ay)`
        : `· ${ad(c)} ${c.id} — garanti süresi ${tarih} tarihinde doldu`;
    }).join("\n") + "\n\nGaranti süresi üretim tarihinden itibaren başlar.";
  }

  if (niyet === "uretim") {
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

  if (niyet === "sarj") {
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

  if (niyet === "sicaklik") {
    return akuler.map((c) => {
      const t = enYuksekSicaklik(c.sonOlcum);
      if (t == null) return `${c.id}: sıcaklık bilgisi yok.`;
      const not = t >= 45 ? " Normalden sıcak; cihazın çevresinin havalandığından emin olun." : " Normal aralıkta.";
      return `${c.id}: ${t} °C.${not}`;
    }).join("\n") || "Sıcaklık bilgisi akü üzerinden gelir; hesabınızda akü görünmüyor.";
  }

  if (niyet === "cihazlar") {
    return `${cihazlar.length} cihazınız izleniyor:\n` + cihazlar.map((c) => {
      const d = musteriDurumu(c.saglik ?? null);
      return `· ${ad(c)} ${c.id}${c.model ? ` (${c.model})` : ""} — ${d.ad}`;
    }).join("\n");
  }

  // durum: genel durum (sistemim nasıl, sorun var mı…)
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
  return t;
}
