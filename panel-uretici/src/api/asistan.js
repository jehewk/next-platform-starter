import { api } from "./istemci";
import {
  cihazListesi, musteriListesi, partiListesi, garantiListesi,
  mudahaleKuyrugu, cihazBul, kaynakAnalizi,
} from "./servis";
import { garantiDurumu, sureMetni, tarihTR, KAYNAK_ADI, DURUM_ADI } from "../veri/yardimci";

/**
 * Sohbet yanıtları.
 *
 * VITE_ASISTAN_YOLU tanımlıysa soru backend'e gönderilir (ör. dil modeli
 * bağlantısı; API anahtarı sunucuda kalır). Tanımlı değilse ya da çağrı
 * başarısız olursa, sistem verisi üzerinde çalışan yerel motor yanıtlar.
 *
 * Beklenen backend sözleşmesi:  POST {soru, gecmis:[{rol, metin}]} → {yanit}
 */

const UZAK_YOL = import.meta.env.VITE_ASISTAN_YOLU;

export const ORNEK_SORULAR = [
  "Genel durumu özetle",
  "Şu an kaç cihaz arızalı?",
  "Hangi partide arıza yoğunluğu var?",
  "Garantisi yakında dolan cihazlar",
  "Depoda kaç ürün var?",
];

let onbellek = null;
let onbellekZamani = 0;

/** Yerel motorun ihtiyaç duyduğu listeler; 60 sn önbelleklenir. */
async function sistemVerisi() {
  if (onbellek && Date.now() - onbellekZamani < 60000) return onbellek;
  const [cihazlar, musteriler, partiler, talepler, isler] = await Promise.all([
    cihazListesi(), musteriListesi(), partiListesi(), garantiListesi(), mudahaleKuyrugu(),
  ]);
  onbellek = { cihazlar, musteriler, partiler, talepler, isler };
  onbellekZamani = Date.now();
  return onbellek;
}

export async function soruSor(soru, gecmis = []) {
  if (UZAK_YOL) {
    try {
      const c = await api.post(UZAK_YOL, { soru, gecmis: gecmis.slice(-12) });
      if (c?.yanit) return c.yanit;
    } catch { /* yerel motora düş */ }
  }
  const veri = await sistemVerisi();
  return yanitla(soru, veri);
}

/* ═══════════ yerel yanıt motoru ═══════════ */
async function yanitla(soru, { cihazlar, musteriler, partiler, talepler, isler }) {
  const s = soru.toLocaleLowerCase("tr");
  const gecer = (...k) => k.some((x) => s.includes(x));
  const musteriBul = (id) => musteriler.find((m) => m.id === id);

  // belirli cihaz sorgusu — tek ek API çağrısı burada yapılır
  const kod = soru.match(/\b(AKU|INV)-D\d{2}-\d{4}\b/i)?.[0]?.toUpperCase();
  if (kod) {
    let c;
    try { c = await cihazBul(kod); } catch { return `${kod} kayıtlarda bulunamadı.`; }
    if (!c?.id) return `${kod} kayıtlarda bulunamadı.`;

    const m = musteriBul(c.musteriId);
    const g = garantiDurumu(c);
    let t = `${c.id} · ${c.model}\n`;
    t += `Durum: ${DURUM_ADI[c.durum] || c.durum}${c.saglik != null ? ` · sağlık ${c.saglik}` : ""}\n`;
    t += m ? `Müşteri: ${m.ad} (${m.ilce}, ${m.il})\n` : "Henüz kurulmamış.\n";
    t += `Üretim: ${tarihTR(c.uretim)} · parti ${c.parti}\n`;
    t += `Garanti: ${g.gecerli ? `${Math.round(g.kalanGun / 30)} ay kaldı` : "süresi doldu"}\n`;
    if (c.tahmin) t += `\nÖngörü: ${c.tahmin.bilesen} — ${sureMetni(c.tahmin.kalanSaat)} içinde. ${c.tahmin.gerekce}`;

    try {
      const kaynak = await kaynakAnalizi(kod);
      if (kaynak?.sinif) t += `\nArıza kaynağı: ${KAYNAK_ADI[kaynak.sinif]} (%${Math.round((kaynak.guven || 0) * 100)} güven).`;
    } catch { /* kaynak analizi bu cihaz için mevcut değil */ }
    return t;
  }

  if (gecer("parti", "yoğun", "yogun", "hangi üretim", "üretim partisi")) {
    const sirali = [...partiler]
      .map((p) => ({ ...p, oran: p.kurulu ? (p.arizali / p.kurulu) * 100 : 0 }))
      .sort((a, b) => b.oran - a.oran);
    let t = `Toplam ${partiler.reduce((x, p) => x + p.adet, 0)} ürün üretildi.\n\nArıza oranı en yüksek partiler:\n`;
    sirali.slice(0, 4).forEach((p) => {
      t += `· ${p.kod} (${p.tip === "aku" ? "akü" : "inverter"}) — ${p.kurulu} kurulu, ${p.arizali} arızalı` +
           `${p.kurulu ? ` (%${p.oran.toFixed(1)})` : ""}\n`;
    });
    if (sirali[0]?.oran > 8) t += `\n${sirali[0].kod} partisinde arıza oranı belirgin şekilde yüksek.`;
    return t;
  }

  if (gecer("arıza", "ariza", "bozuk", "sorun")) {
    const arizali = cihazlar.filter((c) => c.durum === "arizali");
    const uyarida = cihazlar.filter((c) => c.durum === "uyari");
    let t = `${arizali.length} cihaz arızalı, ${uyarida.length} cihaz izlemede.\n`;
    if (isler.length) {
      t += `\nÖngörülen arızalar (aciliyet sırasına göre):\n`;
      // Süre yalnızca hesaplanabildiyse yazılır; aksi halde cümle
      // "… , kaldı" gibi sakat kalıyordu.
      isler.slice(0, 6).forEach((i) => {
        const sure = i.kalanSaat != null ? `, ${sureMetni(i.kalanSaat)} kaldı` : "";
        t += `· ${i.id} — ${i.bilesen}${sure} (${i.musteriAd})\n`;
      });
    }
    return t;
  }

  if (gecer("garanti")) {
    const sahada = cihazlar.filter((c) => c.musteriId);
    const yakin = sahada.map((c) => ({ c, g: garantiDurumu(c) }))
      .filter((x) => x.g.gecerli && x.g.kalanGun < 400).sort((a, b) => a.g.kalanGun - b.g.kalanGun);
    const dolmus = sahada.filter((c) => !garantiDurumu(c).gecerli);
    let t = `Sahadaki ${sahada.length} cihazdan ${dolmus.length} tanesinin garantisi dolmuş.\n`;
    if (yakin.length) {
      t += `\nGarantisi en yakın dolacaklar:\n`;
      yakin.slice(0, 5).forEach(({ c, g }) => { t += `· ${c.id} — ${Math.round(g.kalanGun / 30)} ay (${musteriBul(c.musteriId)?.ad})\n`; });
    }
    const acik = talepler.filter((x) => x.durum === "inceleniyor");
    if (acik.length) t += `\n${acik.length} garanti talebi inceleme aşamasında.`;
    return t;
  }

  if (gecer("depo", "stok", "sevk", "kaç ürün", "kac urun")) {
    const depoda = cihazlar.filter((c) => c.durum === "depoda");
    const sevkte = cihazlar.filter((c) => c.durum === "sevkte");
    const sahada = cihazlar.filter((c) => c.musteriId);
    return `Depoda ${depoda.length} ürün bekliyor, ${sevkte.length} ürün sevkte, ` +
      `${sahada.length} ürün sahada kurulu.\n\nDepodakiler:\n` +
      depoda.map((c) => `· ${c.id} (${c.model})`).join("\n");
  }

  if (gecer("müşteri", "musteri", "kurulum")) {
    let t = `${musteriler.length} müşteride kurulu sistem var.\n\n`;
    musteriler.forEach((m) => {
      const c = cihazlar.filter((x) => x.musteriId === m.id);
      const sorun = c.filter((x) => ["arizali", "uyari"].includes(x.durum)).length;
      t += `· ${m.ad} (${m.ilce}) — ${c.filter((x) => x.tip === "aku").length} akü, ` +
           `${c.filter((x) => x.tip === "inverter").length} inverter${sorun ? ` · ${sorun} sorunlu` : ""}\n`;
    });
    return t;
  }

  if (gecer("akü", "aku", "batarya")) {
    const a = cihazlar.filter((c) => c.tip === "aku");
    const sahada = a.filter((c) => c.musteriId);
    const ort = sahada.length ? Math.round(sahada.reduce((t, c) => t + (c.saglik || 0), 0) / sahada.length) : 0;
    return `Toplam ${a.length} akü üretildi; ${sahada.length} tanesi sahada.\n` +
      `Ortalama sağlık skoru ${ort}.\nSorunlu olanlar: ` +
      (sahada.filter((c) => ["arizali", "uyari"].includes(c.durum)).map((c) => c.id).join(", ") || "yok");
  }
  if (gecer("inverter", "invertör", "evirici")) {
    const v = cihazlar.filter((c) => c.tip === "inverter");
    const sahada = v.filter((c) => c.musteriId);
    const uretim = sahada.reduce((t, c) => t + (c.gunlukKwh || 0), 0);
    return `Toplam ${v.length} inverter üretildi; ${sahada.length} tanesi sahada.\n` +
      `Bugünkü toplam üretim ${uretim.toFixed(1)} kWh.\nSorunlu olanlar: ` +
      (sahada.filter((c) => ["arizali", "uyari"].includes(c.durum)).map((c) => c.id).join(", ") || "yok");
  }

  if (gecer("özet", "ozet", "durum", "genel", "merhaba", "selam")) {
    const sahada = cihazlar.filter((c) => c.musteriId).length;
    const arizali = cihazlar.filter((c) => c.durum === "arizali").length;
    const uyarida = cihazlar.filter((c) => c.durum === "uyari").length;
    return `Genel durum:\n· Toplam ${cihazlar.length} ürün kayıtlı, ${sahada} tanesi sahada\n` +
      `· ${arizali} arızalı, ${uyarida} izlemede\n· ${musteriler.length} müşteri, ${partiler.length} üretim partisi\n` +
      `· ${isler.length} cihaz için arıza öngörüsü var`;
  }

  return "Bu soruyu şu an yanıtlayamıyorum. Cihaz seri numarası, arızalar, partiler, " +
    "garanti, depo durumu veya müşteriler hakkında sorabilirsiniz.";
}
