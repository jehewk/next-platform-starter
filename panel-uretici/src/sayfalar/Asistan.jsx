import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Kart } from "../bilesenler/Kart";
import { useVeri } from "../api/useVeri";
import {
  cihazListesi, musteriListesi, partiListesi, garantiListesi,
  mudahaleKuyrugu, cihazBul, kaynakAnalizi,
} from "../api/servis";
import { garantiDurumu, sureMetni, tarihTR, KAYNAK_ADI } from "../veri/yardimci";

const ORNEK_SORULAR = [
  "Şu an kaç cihaz arızalı?",
  "Hangi partide arıza yoğunluğu var?",
  "AKU-D23-0044 durumunu anlat",
  "Garantisi yakında dolan cihazlar",
  "Depoda kaç ürün var?",
];

/**
 * Yerel yanıt motoru — gerçek dil modeli bağlanana kadar.
 *
 * Sistem verisi artık API'den geliyor; bu bileşen sayfa açılışında
 * gereken listeleri bir kez çeker, her soruda tekrar istek atmaz.
 * Yalnızca "tek cihaz" sorgusu ek bir çağrı yapar (o cihazın kaynak
 * analizi) çünkü bu bilgi listede yer almaz.
 */
export default function Asistan() {
  const { veri: cihazlar } = useVeri(cihazListesi);
  const { veri: musteriler } = useVeri(musteriListesi);
  const { veri: partiler } = useVeri(partiListesi);
  const { veri: talepler } = useVeri(garantiListesi);
  const { veri: isler } = useVeri(mudahaleKuyrugu);

  const veriHazir = cihazlar && musteriler && partiler && talepler && isler;

  const [mesajlar, setMesajlar] = useState([
    { rol: "asistan", metin:
      "Merhaba. Sistemdeki tüm cihazlara, üretim partilerine ve garanti kayıtlarına " +
      "erişebiliyorum. Aşağıdan bir örnek seçebilir ya da doğrudan sorabilirsiniz." },
  ]);
  const [giris, setGiris] = useState("");
  const [bekle, setBekle] = useState(false);
  const sonRef = useRef(null);

  useEffect(() => { sonRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mesajlar]);

  async function gonder(metin) {
    const soru = (metin ?? giris).trim();
    if (!soru || bekle || !veriHazir) return;
    setMesajlar((m) => [...m, { rol: "kullanici", metin: soru }]);
    setGiris("");
    setBekle(true);
    const cevap = await yanitla(soru, { cihazlar, musteriler, partiler, talepler, isler });
    setMesajlar((m) => [...m, { rol: "asistan", metin: cevap }]);
    setBekle(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Asistan</h1>
        <p className="mt-1 text-sm text-soluk">
          Sistem verilerine dayalı soru-cevap. Cihaz durumları, arıza kaynakları ve
          üretim istatistikleri hakkında sorabilirsiniz.
        </p>
      </div>

      <Kart
        baslik="Sohbet"
        ustBilgi={<span className="text-xs text-sonuk">canlı sistem verisi</span>}
        cocuk={
          <div className="flex flex-col" style={{ height: "min(620px, calc(100vh - 300px))" }}>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {mesajlar.map((m, i) => (
                <div key={i} className={m.rol === "kullanici" ? "flex justify-end" : ""}>
                  <div className={`text-sm leading-relaxed ${
                    m.rol === "kullanici"
                      ? "max-w-[78%] bg-panel2 px-3.5 py-2.5 text-metin"
                      : "max-w-[86%] text-metin"}`}>
                    <span className="whitespace-pre-line">{m.metin}</span>
                  </div>
                </div>
              ))}
              {bekle && <p className="text-sm text-sonuk">yanıtlanıyor…</p>}
              <div ref={sonRef} />
            </div>

            {mesajlar.length <= 3 && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-cizgi px-4 py-3">
                {ORNEK_SORULAR.map((s) => (
                  <button key={s} onClick={() => gonder(s)} disabled={!veriHazir}
                    className="text-xs text-soluk underline decoration-cizgi underline-offset-4
                               transition-colors hover:text-metin hover:decoration-soluk disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 border-t border-cizgi p-3">
              <input
                value={giris}
                onChange={(e) => setGiris(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && gonder()}
                placeholder={veriHazir ? "Sorunuzu yazın…" : "Veriler yükleniyor…"}
                disabled={!veriHazir}
                className="flex-1 border border-cizgi bg-panel px-3 py-2.5 text-sm outline-none
                           transition-colors placeholder:text-sonuk focus:border-soluk disabled:opacity-60"
              />
              <button onClick={() => gonder()} disabled={bekle || !giris.trim() || !veriHazir}
                className="flex items-center gap-2 bg-metin px-4 text-sm text-koyu
                           transition-opacity hover:opacity-90 disabled:opacity-30">
                <Send size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        }
      />

      <p className="px-1 text-xs leading-relaxed text-sonuk">
        Asistan sistem verisi üzerinde çalışan yerel bir yanıt motoru kullanıyor;
        serbest konuşma için dil modeli bağlantısı sunucu tarafında eklenecek.
      </p>
    </div>
  );
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
    t += `Durum: ${c.durum}${c.saglik != null ? ` · sağlık ${c.saglik}` : ""}\n`;
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
