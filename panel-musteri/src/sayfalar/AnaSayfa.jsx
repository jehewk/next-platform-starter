import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, WifiOff, ChevronRight, Sun, BatteryCharging, ArrowDownToLine, ArrowUpFromLine, Pause } from "lucide-react";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useGrafikRenkleri, Ipucu } from "../bilesenler/Grafik";
import Halka from "../bilesenler/Halka";
import { useCanli } from "../api/useCanli";
import { useVeri } from "../api/useVeri";
import { sistemimiGetir, olcumYasiDk, SESSIZ_DAKIKA } from "../api/sistem";
import { uretimGecmisiGetir } from "../api/servis";
import { musteriDurumu, musteriMesaji, yaklasikZaman, enerjiAkisi, paketGerilimi, enYuksekSicaklik } from "../veri/sadeDil";
import { onceMetni } from "../veri/yardimci";

const RENK = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik", sonuk: "text-sonuk" };
const ZEMIN = { saglikli: "bg-saglikli", uyari: "bg-uyari", kritik: "bg-kritik", sonuk: "bg-sonuk" };

export default function AnaSayfa() {
  const { veri, hata, yukleniyor, yenileniyor, sonGuncelleme, yenile } = useCanli(sistemimiGetir, 30000);

  if (yukleniyor) return <Iskelet satir={3} yukseklik="h-36" />;
  if (!veri) return <HataKutusu hata={hata} yenile={yenile} />;

  const { profil, cihazlar } = veri;
  const sahada = cihazlar.filter((c) => ["aktif", "uyari", "arizali"].includes(c.durum));
  const akuler = sahada.filter((c) => c.tip === "aku");
  const invler = sahada.filter((c) => c.tip === "inverter");
  const ilkAd = profil?.ad?.split(" ")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{ilkAd ? `Merhaba, ${ilkAd}` : "Sistemim"}</h1>
          <p className="mt-0.5 text-xs text-sonuk">
            {sonGuncelleme ? `Güncellendi ${sonGuncelleme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            {" · her 30 sn yenilenir"}
          </p>
        </div>
        <button onClick={yenile} aria-label="Yenile" className="dugme-ikincil h-10 w-10 p-0">
          <RefreshCw size={16} className={yenileniyor ? "animate-spin" : ""} />
        </button>
      </div>

      {hata && <p className="rounded-md border border-uyari/30 bg-uyari/10 px-3 py-2 text-xs text-uyari">Yenilenemedi: {hata.message}. Son bilinen durum gösteriliyor.</p>}

      {sahada.length === 0 ? (
        <div className="rounded-xl border border-cizgi bg-panel px-5 py-12 text-center">
          <p className="text-sm font-medium">Hesabınızda henüz kurulu cihaz yok</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-soluk">Kurulum ekibimiz akünüzü veya inverterinizi eşleştirdiğinde burada görünecek.</p>
        </div>
      ) : (
        <>
          <GenelDurum cihazlar={sahada} />
          <SessizCihazlar cihazlar={sahada} />
          {akuler.map((c) => <AkuKarti key={c.id} c={c} />)}
          {invler.map((c) => <InverterKarti key={c.id} c={c} />)}
        </>
      )}
    </div>
  );
}

/** Sistem durumu EN KÖTÜ cihazdan gelir (DEVIR §8, hata 8). */
function GenelDurum({ cihazlar }) {
  const olculen = cihazlar.filter((c) => c.saglik != null);
  const enKotu = olculen.length ? olculen.reduce((a, b) => (b.saglik < a.saglik ? b : a)) : null;
  const d = musteriDurumu(enKotu?.saglik ?? null);
  const mesaj = enKotu?.tahmin ? musteriMesaji(enKotu.tahmin, enKotu.saglik) : null;
  const zaman = enKotu?.tahmin ? yaklasikZaman(enKotu.tahmin.kalanSaat) : null;

  return (
    <section className="rounded-xl border border-cizgi bg-panel p-5">
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 shrink-0 rounded-full ${ZEMIN[d.renk]}`} aria-hidden="true" />
        <h2 className={`text-lg font-semibold ${RENK[d.renk]}`}>{d.ad}</h2>
      </div>
      {mesaj ? (
        <div className="mt-3">
          <p className="text-sm font-medium">{mesaj.baslik}</p>
          <p className="mt-1 text-sm leading-relaxed text-soluk">{mesaj.aciklama}</p>
          {zaman && d.anahtar === "dikkat" && <p className="mt-2 text-xs text-sonuk">Ekibimiz {zaman} sizinle iletişime geçecek.</p>}
          <Link to={`/cihaz/${enKotu.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-metin">
            Ayrıntılar <ChevronRight size={15} />
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm text-soluk">
          {d.anahtar === "bilinmiyor"
            ? "Cihazlarınızdan ilk ölçüm bekleniyor."
            : `${cihazlar.length} cihazınız izleniyor, ilgilenmeniz gereken bir durum yok.`}
        </p>
      )}
    </section>
  );
}

function SessizCihazlar({ cihazlar }) {
  const sessiz = cihazlar.filter((c) => {
    const yas = olcumYasiDk(c);
    return yas != null && yas >= SESSIZ_DAKIKA;
  });
  if (!sessiz.length) return null;
  return (
    <div className="flex gap-3 rounded-xl border border-uyari/30 bg-uyari/10 p-4">
      <WifiOff size={18} className="mt-0.5 shrink-0 text-uyari" />
      <div className="text-sm">
        <p className="font-medium">{sessiz.length === 1 ? "Bir cihazınızdan" : `${sessiz.length} cihazınızdan`} bir süredir veri gelmiyor</p>
        <p className="mt-1 text-soluk">
          Son ölçüm {onceMetni(sessiz[0].sonOlcum.zaman)}. Cihazın açık olduğundan ve Wi-Fi bağlantısından emin olun.
        </p>
      </div>
    </div>
  );
}

function AkuKarti({ c }) {
  const o = c.sonOlcum;
  const soc = o?.soc != null ? Math.round(Number(o.soc)) : c.sarj;
  const akis = o ? enerjiAkisi(paketGerilimi(o), Number(o.akim)) : null;
  const AkisIkon = { sarj: ArrowDownToLine, desarj: ArrowUpFromLine, bekleme: Pause }[akis?.yon] || Pause;
  const kalanAh = soc != null && c.kapasiteAh ? Math.round((soc / 100) * c.kapasiteAh) : null;
  const sicaklik = enYuksekSicaklik(o);
  const d = musteriDurumu(c.saglik);

  return (
    <Link to={`/cihaz/${c.id}`} className="block rounded-xl border border-cizgi bg-panel p-5 transition-colors active:bg-panel2">
      <div className="flex items-center justify-between">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-soluk">
          <BatteryCharging size={16} className="shrink-0" /> <span className="truncate">Akü{c.kapasiteAh ? ` · ${c.kapasiteAh} Ah` : ""}</span>
        </h2>
        <span className={`text-xs font-medium ${RENK[d.renk]}`}>{d.ad}</span>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <Halka yuzde={soc} renk={soc == null ? "sonuk" : soc < 20 ? "uyari" : "saglikli"} etiket="şarj" />
        <div className="min-w-0 space-y-2.5">
          {akis ? (
            <div className="flex items-center gap-2">
              <AkisIkon size={16} className={akis.yon === "bekleme" ? "text-sonuk" : "text-saglikli"} />
              <span className="text-sm font-medium">{akis.metin}</span>
              {akis.kw > 0 && <span className="text-sm tabular-nums text-soluk">{akis.kw.toFixed(1)} kW</span>}
            </div>
          ) : <p className="text-sm text-sonuk">Ölçüm bekleniyor</p>}
          {kalanAh != null && <p className="text-xs text-soluk">Kalan enerji ≈ <b className="font-medium text-metin">{kalanAh} Ah</b> / {c.kapasiteAh} Ah</p>}
          {sicaklik != null && <p className="text-xs text-soluk">Sıcaklık {sicaklik} °C</p>}
          {o?.zaman && <p className="text-xs text-sonuk">Son ölçüm {onceMetni(o.zaman)}</p>}
        </div>
      </div>
    </Link>
  );
}

function InverterKarti({ c }) {
  const r = useGrafikRenkleri();
  const { veri: gunler } = useVeri(() => uretimGecmisiGetir(c.id, 7), [c.id]);
  const bugun = c.sonOlcum?.gunluk_kwh ?? c.gunlukKwh;
  const d = musteriDurumu(c.saglik);
  const toplam = (gunler || []).reduce((t, g) => t + g.uretim, 0);

  return (
    <Link to={`/cihaz/${c.id}`} className="block rounded-xl border border-cizgi bg-panel p-5 transition-colors active:bg-panel2">
      <div className="flex items-center justify-between">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-soluk">
          <Sun size={16} className="shrink-0" /> <span className="truncate">Güneş üretimi{c.gucKw ? ` · ${c.gucKw} kW inverter` : ""}</span>
        </h2>
        <span className={`text-xs font-medium ${RENK[d.renk]}`}>{d.ad}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{bugun != null ? Number(bugun).toFixed(1) : "—"}</span>
        <span className="text-sm text-soluk">kWh bugün</span>
      </div>
      {gunler?.length > 1 && (
        <>
          <div className="mt-3 h-28" onClick={(e) => e.preventDefault()}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gunler} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
                <XAxis dataKey="gun" tickFormatter={(g) => g.split("-").reverse().join(".")} tick={{ fill: r.eksen, fontSize: 10 }}
                  axisLine={false} tickLine={false} interval={0} />
                <Tooltip cursor={{ fill: r.izgara, fillOpacity: 0.4 }}
                  content={<Ipucu bicim={(v) => `${v} kWh`} etiket={(g) => g.split("-").reverse().join(".")} />} />
                <Bar dataKey="uretim" name="Üretim" fill={r.seri} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-sonuk">Son {gunler.length} günde {toplam.toFixed(1)} kWh</p>
        </>
      )}
    </Link>
  );
}
