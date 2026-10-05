import { Link } from "react-router-dom";
import { BatteryCharging, Sun, ChevronRight, Plus } from "lucide-react";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useCanli } from "../api/useCanli";
import { sistemimiGetir } from "../api/sistem";
import { musteriDurumu } from "../veri/sadeDil";
import { onceMetni } from "../veri/yardimci";

const RENK = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik", sonuk: "text-sonuk" };

export default function Cihazlar() {
  const { veri, hata, yukleniyor, yenile } = useCanli(sistemimiGetir, 60000);
  if (yukleniyor) return <SatirIskelet satir={3} />;
  if (!veri) return <HataKutusu hata={hata} yenile={yenile} />;

  const liste = veri.cihazlar.filter((c) => ["aktif", "uyari", "arizali"].includes(c.durum));
  const gruplar = [
    { ad: "Aküler", tip: "aku", ikon: BatteryCharging },
    { ad: "İnverterler", tip: "inverter", ikon: Sun },
  ].map((g) => ({ ...g, cihazlar: liste.filter((c) => c.tip === g.tip) })).filter((g) => g.cihazlar.length);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Cihazlarım</h1>
        <Link to="/cihaz-ekle" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-cizgi px-3 text-sm font-medium text-metin active:bg-panel2">
          <Plus size={16} /> Cihaz ekle
        </Link>
      </div>
      {!gruplar.length && (
        <div className="rounded-xl border border-cizgi bg-panel px-5 py-12 text-center">
          <p className="text-sm text-soluk">Hesabınızda henüz kurulu cihaz yok.</p>
          <Link to="/cihaz-ekle" className="dugme-ana mt-4 inline-flex"><Plus size={16} /> Cihaz ekle</Link>
        </div>
      )}
      {gruplar.map((g) => (
        <section key={g.tip}>
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-sonuk">{g.ad}</h2>
          <ul className="divide-y divide-cizgi overflow-hidden rounded-xl border border-cizgi bg-panel">
            {g.cihazlar.map((c) => {
              const d = musteriDurumu(c.saglik);
              const soc = c.sonOlcum?.soc ?? c.sarj;
              return (
                <li key={c.id}>
                  <Link to={`/cihaz/${c.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 active:bg-panel2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 ring-1 ring-cizgi">
                      <g.ikon size={18} className="text-soluk" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{c.model || (c.tip === "aku" ? "Akü" : "İnverter")}</div>
                      <div className="mt-0.5 truncate text-xs text-sonuk">
                        <span className={RENK[d.renk]}>{d.ad}</span>
                        {c.tip === "aku" && soc != null && ` · şarj %${Math.round(Number(soc))}`}
                        {c.tip === "inverter" && c.gunlukKwh != null && ` · bugün ${Number(c.gunlukKwh).toFixed(1)} kWh`}
                        {c.sonOlcum?.zaman && ` · ${onceMetni(c.sonOlcum.zaman)}`}
                      </div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-sonuk" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
