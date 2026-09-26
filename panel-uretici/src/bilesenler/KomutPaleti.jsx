import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, BatteryCharging, Cpu, User, CornerDownLeft } from "lucide-react";
import { GRUPLAR } from "./Kenar";
import { cihazListesi, musteriListesi } from "../api/servis";

/**
 * ⌘K / Ctrl+K arama paleti: sayfalar, cihazlar (seri no, model, parti)
 * ve müşteriler arasında klavyeyle gezinme. Listeler ilk açılışta bir
 * kez çekilir.
 */
export default function KomutPaleti({ acik, kapat }) {
  const git = useNavigate();
  const [ara, setAra] = useState("");
  const [secili, setSecili] = useState(0);
  const [veri, setVeri] = useState(null);

  useEffect(() => {
    if (!acik) return;
    setAra(""); setSecili(0);
    if (!veri) {
      Promise.all([cihazListesi(), musteriListesi()])
        .then(([c, m]) => setVeri({ cihazlar: c, musteriler: m }))
        .catch(() => setVeri({ cihazlar: [], musteriler: [] }));
    }
  }, [acik, veri]);

  const sonuclar = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr");
    const eslesir = (...m) => !q || m.join(" ").toLocaleLowerCase("tr").includes(q);
    const sayfalar = GRUPLAR.flatMap((g) => g.baglar)
      .filter((b) => eslesir(b.ad))
      .map((b) => ({ tur: "Sayfalar", ikon: b.ikon, ad: b.ad, yol: b.yol }));
    if (!q) return sayfalar;
    const cihazlar = (veri?.cihazlar || [])
      .filter((c) => eslesir(c.id, c.model, c.parti)).slice(0, 8)
      .map((c) => ({ tur: "Cihazlar", ikon: c.tip === "aku" ? BatteryCharging : Cpu,
                     ad: c.id, alt: `${c.model} · ${c.parti}`, yol: `/${c.tip === "aku" ? "aku" : "inverter"}/${c.id}` }));
    const musteriler = (veri?.musteriler || [])
      .filter((m) => eslesir(m.ad, m.il, m.ilce, m.id)).slice(0, 6)
      .map((m) => ({ tur: "Müşteriler", ikon: User, ad: m.ad, alt: `${m.ilce}, ${m.il}`, yol: `/musteri/${m.id}` }));
    return [...sayfalar, ...cihazlar, ...musteriler];
  }, [ara, veri]);

  if (!acik) return null;

  function sec(s) { kapat(); git(s.yol); }

  function tus(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSecili((i) => Math.min(sonuclar.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSecili((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter" && sonuclar[secili]) sec(sonuclar[secili]);
    if (e.key === "Escape") kapat();
  }

  let oncekiTur = null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
         onMouseDown={(e) => e.target === e.currentTarget && kapat()}>
      <div className="w-full max-w-xl animate-belir overflow-hidden rounded-xl border border-cizgi bg-panel shadow-yuzen">
        <div className="flex items-center gap-2.5 border-b border-cizgi px-4">
          <Search size={16} className="text-sonuk" />
          <input autoFocus value={ara} onKeyDown={tus}
            onChange={(e) => { setAra(e.target.value); setSecili(0); }}
            placeholder="Sayfa, seri no, parti veya müşteri ara…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-sonuk" />
          <kbd className="rounded border border-cizgi px-1.5 font-mono text-2xs text-sonuk">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {sonuclar.length === 0 && <p className="px-3 py-8 text-center text-sm text-sonuk">Sonuç yok.</p>}
          {sonuclar.map((s, i) => {
            const baslik = s.tur !== oncekiTur ? s.tur : null;
            oncekiTur = s.tur;
            return (
              <div key={s.tur + s.yol}>
                {baslik && <div className="px-2.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-wider text-sonuk">{baslik}</div>}
                <button onMouseMove={() => setSecili(i)} onClick={() => sec(s)}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm ${
                    i === secili ? "bg-panel2 text-metin" : "text-soluk"}`}>
                  <s.ikon size={15} className="shrink-0" />
                  <span className={s.tur === "Cihazlar" ? "font-mono text-xs" : ""}>{s.ad}</span>
                  {s.alt && <span className="truncate text-xs text-sonuk">{s.alt}</span>}
                  {i === secili && <CornerDownLeft size={13} className="ml-auto shrink-0 text-sonuk" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
