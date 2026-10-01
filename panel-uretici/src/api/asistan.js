import { api } from "./istemci";
import {
  cihazListesi, musteriListesi, partiListesi, garantiListesi,
  mudahaleKuyrugu, cihazBul, kaynakAnalizi, basvuruListesi,
} from "./servis";
import { garantiDurumu, sureMetni, tarihTR, utcTarih, KAYNAK_ADI, DURUM_ADI } from "../veri/yardimci";
import { ureticiNiyeti } from "./ayristirici";

/**
 * Sohbet yanıtları — iki katman:
 *
 *  1) Ayrıştırıcı (ayristirici.js): sistem verisiyle ilgili sorular serbest Türkçeyle
 *     sorulsa da ("dostum bugün kayıt olan kullanıcıları ver") tanınır; yanıt burada,
 *     gerçek veriden üretilir. Veri tarayıcıdan dışarı çıkmaz, ücretsizdir.
 *  2) Dil modeli (VITE_ASISTAN_YOLU → POST /de/asistan; aws/asistan-kur.ps1):
 *     genel sorular ("selam", "LiFePO4 nedir"). Yalnızca SORU METNİ gider; veriden
 *     üretilmiş önceki yanıtlar konuşma geçmişinden de çıkarılır.
 *
 * soruSor {metin, kaynak: "yerel" | "model"} döndürür; kaynak geçmiş süzmesi içindir.
 */

const UZAK_YOL = import.meta.env.VITE_ASISTAN_YOLU;

export const ORNEK_SORULAR = [
  "Genel durumu özetle",
  "Bugün kayıt olan müşteriler",
  "Şu an kaç cihaz arızalı?",
  "Garantisi yakında dolan cihazlar",
  "Onay bekleyen başvurular",
  "LiFePO4 hücre dengeleme nasıl çalışır?",
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

/** Dil modeline giden geçmiş: veriden üretilen yanıtlar ve onları doğuran sorular çıkarılır. */
function modelGecmisi(gecmis) {
  const sonuc = [];
  for (let i = 0; i < gecmis.length; i++) {
    const m = gecmis[i];
    if (m.rol === "kullanici" && gecmis[i + 1]?.kaynak === "yerel") { i++; continue; }
    if (m.rol === "asistan" && m.kaynak !== "model") continue;
    // Fotoğraf geçmişe girmez; yalnızca gönderildiği soruyla birlikte gider
    sonuc.push({ rol: m.rol, metin: m.gorsel ? `[fotoğraf] ${m.metin}`.trim() : m.metin });
  }
  return sonuc.slice(-12);
}

export async function soruSor(soru, gecmis = [], { gorsel } = {}) {
  // Fotoğraflı soru her zaman dil modeline gider (inceleme/yorum)
  if (!gorsel) {
    const veri = await sistemVerisi();
    const niyet = ureticiNiyeti(soru, veri);
    if (niyet) return { metin: await yanitla(niyet, veri), kaynak: "yerel" };
  }

  if (!UZAK_YOL) return { metin: anlamadim(), kaynak: "yerel" };
  try {
    const c = await api.post(UZAK_YOL, {
      soru, gecmis: modelGecmisi(gecmis), panel: "uretici",
      ...(gorsel ? { gorsel: { tur: gorsel.tur, veri: gorsel.veri } } : {}),
    });
    if (c?.yanit) return { metin: c.yanit, kaynak: "model", ...(c.arama ? { arama: c.arama } : {}) };
    return { metin: anlamadim("boş yanıt"), kaynak: "yerel" };
  } catch (e) {
    // Günlük sınır / zaman aşımı: sunucunun mesajı. Diğer hatalar: yardım + neden.
    if (e?.durum === 429 || e?.durum === 504 || (gorsel && e?.durum === 400)) return { metin: e.message, kaynak: "yerel" };
    return { metin: anlamadim(`${e?.message || "bağlantı hatası"}${e?.durum ? ` (${e.durum})` : ""}`), kaynak: "yerel" };
  }
}

function anlamadim(neden) {
  return "Bu soruyu sistem verisinden yanıtlayamadım. Örneğin şunları sorabilirsiniz:\n" +
    "· bugün / bu hafta kayıt olan müşteriler\n· bir müşterinin adresi, telefonu (adıyla)\n" +
    "· Adana'daki müşteriler\n· arızalı cihazlar, garantisi dolanlar, depo durumu\n" +
    "· onay bekleyen başvurular, açık garanti talepleri\n· bir cihazın seri numarası (ör. AKU-D24-0071)" +
    (neden ? `\n\n(Genel sorular için asistana ulaşılamadı: ${neden}.)` : "");
}

/* ═══════════ yerel yanıt motoru ═══════════ */

const musteriSatiri = (m, alan, cihazSayisi) => {
  const yer = [m.ilce, m.il].filter(Boolean).join("/") || "-";
  if (alan === "adres") return `· ${m.ad} — ${m.adres || "adres kayıtlı değil"} (${yer})`;
  if (alan === "telefon") return `· ${m.ad} — ${m.telefon || "telefon kayıtlı değil"}`;
  if (alan === "eposta") return `· ${m.ad} — ${m.email || "e-posta kayıtlı değil"}`;
  const kayit = utcTarih(m.kurulum);
  return `· ${m.ad} (${m.id}) — ${yer}; tel: ${m.telefon || "-"}; e-posta: ${m.email || "-"}; ` +
    `adres: ${m.adres || "-"}${kayit ? `; kayıt: ${kayit.toLocaleDateString("tr-TR")}` : ""}; ${cihazSayisi} cihaz`;
};

async function yanitla(n, { cihazlar, musteriler, partiler, talepler, isler }) {
  const musteriBul = (id) => musteriler.find((m) => m.id === id);
  const cihazSayisi = (m) => cihazlar.filter((c) => c.musteriId === m.id).length;

  switch (n.niyet) {
    case "musteri_kayit": {
      const yeni = musteriler
        .map((m) => ({ m, t: utcTarih(m.kurulum) }))
        .filter(({ t }) => t && t >= n.zaman.bas && t < n.zaman.bit)
        .sort((a, b) => b.t - a.t);
      if (!yeni.length) return `${n.zaman.ad[0].toLocaleUpperCase("tr") + n.zaman.ad.slice(1)} kayıt olan müşteri yok.`;
      return `${n.zaman.ad[0].toLocaleUpperCase("tr") + n.zaman.ad.slice(1)} kayıt olan ${yeni.length} müşteri:\n` +
        yeni.slice(0, 25).map(({ m }) => musteriSatiri(m, n.alan, cihazSayisi(m))).join("\n") +
        (yeni.length > 25 ? `\n… ve ${yeni.length - 25} müşteri daha (Müşteriler sayfası).` : "");
    }

    case "musteri_bilgi":
      return (n.musteriler.length > 1 ? `${n.musteriler.length} eşleşen müşteri:\n` : "") +
        n.musteriler.slice(0, 10).map((m) => musteriSatiri(m, n.alan, cihazSayisi(m))).join("\n");

    case "musteri_listesi": {
      const liste = n.il ? musteriler.filter((m) => m.il === n.il) : musteriler;
      if (!liste.length) return n.il ? `${n.il} ilinde müşteri yok.` : "Henüz onaylı müşteri yok.";
      return `${n.il ? `${n.il} ilinde ` : ""}${liste.length} müşteri:\n` +
        liste.slice(0, 30).map((m) => musteriSatiri(m, n.alan, cihazSayisi(m))).join("\n") +
        (liste.length > 30 ? `\n… ve ${liste.length - 30} müşteri daha (Müşteriler sayfası).` : "");
    }

    case "basvurular": {
      const b = await basvuruListesi().catch(() => []);
      if (!b.length) return "Onay bekleyen başvuru yok (kayıtlar otomatik onaylanıyor).";
      return `${b.length} başvuru onay bekliyor:\n` + b.slice(0, 20).map((x) =>
        `· ${x.ad} — ${[x.ilce, x.il].filter(Boolean).join("/")}; tel: ${x.telefon || "-"}; ${x.eposta || "-"}`).join("\n");
    }

    case "talepler": {
      const acik = talepler.filter((t) => t.durum === "inceleniyor");
      if (!talepler.length) return "Garanti/destek talebi yok.";
      return `${talepler.length} talep var, ${acik.length} tanesi inceleniyor.\n` +
        acik.slice(0, 10).map((t) => `· ${t.cihazId}${t.aciklama ? ` — ${String(t.aciklama).slice(0, 100)}` : ""}`).join("\n");
    }

    case "cihaz": {
      let c;
      try { c = await cihazBul(n.kod); } catch { return `${n.kod} kayıtlarda bulunamadı.`; }
      if (!c?.id) return `${n.kod} kayıtlarda bulunamadı.`;
      const m = musteriBul(c.musteriId);
      const g = garantiDurumu(c);
      let t = `${c.id} · ${c.model}\n`;
      t += `Durum: ${DURUM_ADI[c.durum] || c.durum}${c.saglik != null ? ` · sağlık ${c.saglik}` : ""}\n`;
      t += m ? `Müşteri: ${m.ad} (${m.ilce}, ${m.il})\n` : "Henüz kurulmamış.\n";
      t += `Üretim: ${tarihTR(c.uretim)} · parti ${c.parti}\n`;
      t += `Garanti: ${g.gecerli ? `${Math.round(g.kalanGun / 30)} ay kaldı` : "süresi doldu"}\n`;
      if (c.tahmin) t += `\nÖngörü: ${c.tahmin.bilesen} — ${sureMetni(c.tahmin.kalanSaat)} içinde. ${c.tahmin.gerekce}`;
      try {
        const kaynak = await kaynakAnalizi(n.kod);
        if (kaynak?.sinif) t += `\nArıza kaynağı: ${KAYNAK_ADI[kaynak.sinif]} (%${Math.round((kaynak.guven || 0) * 100)} güven).`;
      } catch { /* kaynak analizi bu cihaz için mevcut değil */ }
      return t;
    }

    case "parti": {
      const sirali = [...partiler]
        .map((p) => ({ ...p, oran: p.kurulu ? (p.arizali / p.kurulu) * 100 : 0 }))
        .sort((a, b) => b.oran - a.oran);
      if (!sirali.length) return "Henüz üretim partisi kaydı yok.";
      let t = `Toplam ${partiler.reduce((x, p) => x + p.adet, 0)} ürün üretildi.\n\nArıza oranı en yüksek partiler:\n`;
      sirali.slice(0, 4).forEach((p) => {
        t += `· ${p.kod} (${p.tip === "aku" ? "akü" : "inverter"}) — ${p.kurulu} kurulu, ${p.arizali} arızalı` +
             `${p.kurulu ? ` (%${p.oran.toFixed(1)})` : ""}\n`;
      });
      if (sirali[0]?.oran > 8) t += `\n${sirali[0].kod} partisinde arıza oranı belirgin şekilde yüksek.`;
      return t;
    }

    case "ariza": {
      const arizali = cihazlar.filter((c) => c.durum === "arizali");
      const uyarida = cihazlar.filter((c) => c.durum === "uyari");
      let t = `${arizali.length} cihaz arızalı, ${uyarida.length} cihaz izlemede.\n`;
      [...arizali, ...uyarida].slice(0, 10).forEach((c) => {
        t += `· ${c.id} — ${DURUM_ADI[c.durum] || c.durum}${c.saglik != null ? `, sağlık ${c.saglik}` : ""} (${musteriBul(c.musteriId)?.ad || "-"})\n`;
      });
      if (isler.length) {
        t += `\nÖngörülen arızalar (aciliyet sırasına göre):\n`;
        // Süre yalnızca hesaplanabildiyse yazılır; aksi halde cümle "… , kaldı" gibi sakat kalıyordu.
        isler.slice(0, 6).forEach((i) => {
          const sure = i.kalanSaat != null ? `, ${sureMetni(i.kalanSaat)} kaldı` : "";
          t += `· ${i.id} — ${i.bilesen}${sure} (${i.musteriAd})\n`;
        });
      }
      return t;
    }

    case "garanti": {
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

    case "depo": {
      const depoda = cihazlar.filter((c) => c.durum === "depoda");
      const sevkte = cihazlar.filter((c) => c.durum === "sevkte");
      const sahada = cihazlar.filter((c) => c.musteriId);
      return `Depoda ${depoda.length} ürün bekliyor, ${sevkte.length} ürün sevkte, ` +
        `${sahada.length} ürün sahada kurulu.` +
        (depoda.length ? `\n\nDepodakiler:\n${depoda.slice(0, 20).map((c) => `· ${c.id} (${c.model})`).join("\n")}` : "");
    }

    case "aku": {
      const a = cihazlar.filter((c) => c.tip === "aku");
      const sahada = a.filter((c) => c.musteriId);
      const ort = sahada.length ? Math.round(sahada.reduce((t, c) => t + (c.saglik || 0), 0) / sahada.length) : 0;
      return `Toplam ${a.length} akü üretildi; ${sahada.length} tanesi sahada.\n` +
        `Ortalama sağlık skoru ${ort}.\nSorunlu olanlar: ` +
        (sahada.filter((c) => ["arizali", "uyari"].includes(c.durum)).map((c) => c.id).join(", ") || "yok");
    }

    case "inverter": {
      const v = cihazlar.filter((c) => c.tip === "inverter");
      const sahada = v.filter((c) => c.musteriId);
      const uretim = sahada.reduce((t, c) => t + (c.gunlukKwh || 0), 0);
      return `Toplam ${v.length} inverter üretildi; ${sahada.length} tanesi sahada.\n` +
        `Bugünkü toplam üretim ${uretim.toFixed(1)} kWh.\nSorunlu olanlar: ` +
        (sahada.filter((c) => ["arizali", "uyari"].includes(c.durum)).map((c) => c.id).join(", ") || "yok");
    }

    default: {
      const sahada = cihazlar.filter((c) => c.musteriId).length;
      const arizali = cihazlar.filter((c) => c.durum === "arizali").length;
      const uyarida = cihazlar.filter((c) => c.durum === "uyari").length;
      return `Genel durum:\n· Toplam ${cihazlar.length} ürün kayıtlı, ${sahada} tanesi sahada\n` +
        `· ${arizali} arızalı, ${uyarida} izlemede\n· ${musteriler.length} müşteri, ${partiler.length} üretim partisi\n` +
        `· ${isler.length} cihaz için arıza öngörüsü var`;
    }
  }
}
