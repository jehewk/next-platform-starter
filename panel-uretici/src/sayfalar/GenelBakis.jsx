import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { RefreshCw, ArrowUpRight, BatteryCharging, Cpu, AlertTriangle } from "lucide-react";
import { Kart, SayfaBasligi } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { Iskelet, SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useGrafikRenkleri, Ipucu } from "../bilesenler/Grafik";
import Harita from "./Harita";
import { useVeri } from "../api/useVeri";
import { genelOzet, mudahaleKuyrugu, musteriListesi, cihazListesi, partiListesi } from "../api/servis";
import { saglikDurumu, sureMetni, sayi, DURUM_YAZI, DURUM_ADI } from "../veri/yardimci";

const PARTI_ESIK = 8; // % — bu oranın üstündeki partiler kırmızı gösterilir

export default function GenelBakis() {
  const [surum, setSurum] = useState(0);
  const [zaman, setZaman] = useState(() => new Date());
  const ozet = useVeri(genelOzet, [surum]);
  const isler = useVeri(mudahaleKuyrugu, [surum]);
  const musteriler = useVeri(musteriListesi, [surum]);
  const cihazlar = useVeri(cihazListesi, [surum]);
  const partiler = useVeri(partiListesi, [surum]);

  const yenile = () => { setSurum((s) => s + 1); setZaman(new Date()); };
  const anaHata = ozet.hata || isler.hata || musteriler.hata;

  return (
    <div className="space-y-6">
      <SayfaBasligi
        baslik="Genel Bakış"
        aciklama={`Üretilen ürünlerin ve sahadaki sistemlerin durumu · ${zaman.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} itibarıyla`}
        eylem={
          <button onClick={yenile} className="dugme-ikincil">
            <RefreshCw size={14} className={ozet.yukleniyor ? "animate-spin" : ""} /> Yenile
          </button>
        }
      />

      {anaHata ? <HataKutusu hata={anaHata} yenile={yenile} /> : (
        <>
          <KpiSeridi ozet={ozet.veri} cihazlar={cihazlar.veri} />

          <div className="grid gap-4 xl:grid-cols-3">
            <Kart className="xl:col-span-2" baslik="Saha haritası"
              ustBilgi={<Link to="/harita" className="flex items-center gap-1 text-xs text-soluk hover:text-metin">Tam ekran <ArrowUpRight size={13} /></Link>}>
              <div className="h-[380px]"><Harita gomulu yukseklik="100%" /></div>
            </Kart>
            <MudahaleKuyrugu durum={isler} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DurumDagilimi ozet={ozet.veri} />
            <PartiArizaOrani partiler={partiler.veri} />
          </div>

          <MusteriOzeti musteriler={musteriler} cihazlar={cihazlar.veri} />
        </>
      )}
    </div>
  );
}

/* ── KPI kartları ── */

function KpiSeridi({ ozet, cihazlar }) {
  if (!ozet) {
    return <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-[112px] animate-pulse rounded-lg border border-cizgi bg-panel" />)}
    </div>;
  }
  const mudahale = ozet.arizali + ozet.uyarida;
  const olculen = (cihazlar || []).filter((c) => c.saglik != null);
  const ortSaglik = olculen.length ? Math.round(olculen.reduce((t, c) => t + c.saglik, 0) / olculen.length) : null;
  const d = saglikDurumu(ortSaglik);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Kpi etiket="Toplam ürün" deger={sayi(ozet.toplam)}
        alt={<>{ozet.depoda} depoda · {ozet.sevkte} sevkte</>} />
      <Kpi etiket="Sahada kurulu" deger={sayi(ozet.sahada)}
        alt={<><BatteryCharging size={12} className="inline" /> {ozet.aku} akü · <Cpu size={12} className="inline" /> {ozet.inverter} inverter</>} />
      <Kpi etiket="Müdahale bekleyen" deger={mudahale} vurgu={mudahale ? "text-kritik" : ""}
        ikon={mudahale ? <AlertTriangle size={16} className="text-kritik" /> : null}
        alt={<><span className="text-kritik">{ozet.arizali} arızalı</span> · <span className="text-uyari">{ozet.uyarida} izlemede</span></>}
        yol="/arizalar" />
      <Kpi etiket="Ortalama filo sağlığı" deger={ortSaglik ?? "—"} vurgu={DURUM_YAZI[d]}
        alt={ortSaglik != null ? <div className="pt-1"><SaglikCubugu deger={ortSaglik} durum={d} ince /></div> : "Ölçüm yok"} />
    </div>
  );
}

function Kpi({ etiket, deger, alt, vurgu = "", ikon, yol }) {
  const icerik = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-soluk sm:text-sm">{etiket}</span>
        {ikon}
      </div>
      <div className={`mt-2 text-2xl font-semibold sm:text-3xl tabular-nums tracking-tight ${vurgu}`}>{deger}</div>
      <div className="mt-1.5 text-xs text-sonuk">{alt}</div>
    </>
  );
  const sinif = "block rounded-lg border border-cizgi bg-panel p-4";
  return yol
    ? <Link to={yol} className={`${sinif} transition-colors hover:border-soluk/40`}>{icerik}</Link>
    : <div className={sinif}>{icerik}</div>;
}

/* ── Müdahale kuyruğu ── */

function MudahaleKuyrugu({ durum }) {
  const { veri: isler, yukleniyor } = durum;
  return (
    <Kart baslik="Müdahale kuyruğu"
      ustBilgi={!yukleniyor && <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs tabular-nums text-soluk">{isler?.length ?? 0}</span>}>
      <div className="max-h-[380px] overflow-y-auto">
        {yukleniyor ? <div className="p-4"><SatirIskelet satir={4} /></div>
          : isler.length === 0 ? <p className="px-5 py-14 text-center text-sm text-soluk">Bekleyen müdahale yok.</p>
          : isler.map((is) => {
            const yazi = DURUM_YAZI[saglikDurumu(is.saglik)];
            return (
              <Link key={is.id} to={is.tip === "aku" ? `/aku/${is.id}` : `/inverter/${is.id}`}
                className="flex items-center gap-3 border-b border-cizgi px-4 py-3 last:border-b-0 hover:bg-panel2/60">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs">{is.id}</span>
                    <span className="truncate text-xs text-sonuk">{is.musteriAd}</span>
                  </div>
                  <div className={`mt-0.5 text-sm ${yazi}`}>{is.bilesen}</div>
                  {is.kalanSaat != null && <div className="mt-0.5 text-xs text-sonuk">{sureMetni(is.kalanSaat)} içinde müdahale</div>}
                </div>
                <div className="text-right">
                  <div className={`text-lg font-semibold tabular-nums ${yazi}`}>{is.saglik}</div>
                  <div className="text-2xs text-sonuk">sağlık</div>
                </div>
              </Link>
            );
          })}
      </div>
    </Kart>
  );
}

/* ── Durum dağılımı: tek oran çubuğu + sayılar ── */

function DurumDagilimi({ ozet }) {
  if (!ozet) return <Iskelet satir={1} yukseklik="h-[292px]" />;
  const aktif = ozet.sahada - ozet.arizali - ozet.uyarida;
  const dilimler = [
    { id: "aktif",   n: aktif,         sinif: "bg-saglikli" },
    { id: "uyari",   n: ozet.uyarida,  sinif: "bg-uyari" },
    { id: "arizali", n: ozet.arizali,  sinif: "bg-kritik" },
    { id: "sevkte",  n: ozet.sevkte,   sinif: "bg-bilgi" },
    { id: "depoda",  n: ozet.depoda,   sinif: "bg-sonuk" },
  ];
  const toplam = dilimler.reduce((t, d) => t + d.n, 0) || 1;

  return (
    <Kart baslik="Ürün durumu" ustBilgi={<span className="text-xs text-sonuk">{ozet.toplam} ürün</span>}>
      <div className="p-5">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {dilimler.filter((d) => d.n > 0).map((d) => (
            <div key={d.id} className={d.sinif} style={{ width: `${(d.n / toplam) * 100}%` }}
                 title={`${DURUM_ADI[d.id]}: ${d.n}`} />
          ))}
        </div>
        <div className="mt-5 divide-y divide-cizgi">
          {dilimler.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
              <i className={`h-2.5 w-2.5 rounded-sm ${d.sinif}`} />
              <span className="text-soluk">{DURUM_ADI[d.id]}</span>
              <span className="ml-auto font-medium tabular-nums">{d.n}</span>
              <span className="w-12 text-right text-xs tabular-nums text-sonuk">%{Math.round((d.n / toplam) * 100)}</span>
            </div>
          ))}
        </div>
      </div>
    </Kart>
  );
}

/* ── Parti bazında arıza oranı ── */

function PartiArizaOrani({ partiler }) {
  const r = useGrafikRenkleri();
  if (!partiler) return <Iskelet satir={1} yukseklik="h-[292px]" />;
  const veri = partiler.map((p) => ({
    kod: p.kod, oran: p.kurulu ? Number(((p.arizali / p.kurulu) * 100).toFixed(1)) : 0,
  }));

  return (
    <Kart baslik="Parti bazında arıza oranı"
      ustBilgi={<Link to="/uretim" className="flex items-center gap-1 text-xs text-soluk hover:text-metin">Üretim <ArrowUpRight size={13} /></Link>}>
      <div className="h-[252px] px-2 pb-2 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={veri} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barCategoryGap="28%">
            <CartesianGrid stroke={r.izgara} vertical={false} />
            <XAxis dataKey="kod" tick={{ fill: r.eksen, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: r.eksen, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `%${v}`} />
            <ReferenceLine y={PARTI_ESIK} stroke={r.kritik} strokeDasharray="4 4" strokeOpacity={0.6}
              label={{ value: `eşik %${PARTI_ESIK}`, position: "insideTopLeft", fill: r.soluk, fontSize: 11 }} />
            <Tooltip cursor={{ fill: r.izgara, fillOpacity: 0.4 }}
              content={<Ipucu bicim={(v) => `%${v}`} />} />
            <Bar dataKey="oran" name="Arıza oranı" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {veri.map((v) => <Cell key={v.kod} fill={v.oran > PARTI_ESIK ? r.kritik : r.seri} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Kart>
  );
}

/* ── Müşteri özeti ── */

function MusteriOzeti({ musteriler: { veri: musteriler, yukleniyor }, cihazlar }) {
  return (
    <Kart baslik="Müşteriler"
      ustBilgi={<Link to="/musteriler" className="flex items-center gap-1 text-xs text-soluk hover:text-metin">Tümü <ArrowUpRight size={13} /></Link>}>
      {yukleniyor ? <div className="p-4"><SatirIskelet satir={3} /></div> : (
        <div className="grid gap-px bg-cizgi sm:grid-cols-2 xl:grid-cols-3">
          {musteriler.slice(0, 6).map((m) => {
            const cm = (cihazlar || []).filter((c) => c.musteriId === m.id);
            const sorunlu = cm.filter((c) => ["arizali", "uyari"].includes(c.durum)).length;
            const olculen = cm.filter((c) => c.saglik != null);
            const ort = olculen.length ? Math.min(...olculen.map((c) => c.saglik)) : null; // en kötü cihaz
            const d = saglikDurumu(ort);
            return (
              <Link key={m.id} to={`/musteri/${m.id}`} className="bg-panel p-4 transition-colors hover:bg-panel2/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{m.ad}</h3>
                    <p className="mt-0.5 text-xs text-sonuk">{m.ilce}, {m.il} · {m.tip}</p>
                  </div>
                  <Rozet durum={!sorunlu ? "saglikli" : d === "saglikli" ? "uyari" : d} cocuk={sorunlu ? `${sorunlu} sorun` : "Normal"} />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className={`w-8 text-lg font-semibold tabular-nums ${DURUM_YAZI[d]}`}>{ort ?? "—"}</span>
                  <SaglikCubugu deger={ort ?? 0} durum={d} ince />
                </div>
                <div className="mt-3 flex gap-4 text-xs text-sonuk">
                  <span className="flex items-center gap-1.5"><BatteryCharging size={13} /> {cm.filter((c) => c.tip === "aku").length} akü</span>
                  <span className="flex items-center gap-1.5"><Cpu size={13} /> {cm.filter((c) => c.tip === "inverter").length} inverter</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Kart>
  );
}
