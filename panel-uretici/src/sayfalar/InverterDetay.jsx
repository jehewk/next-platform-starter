import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChevronLeft, Cpu, AlertTriangle } from "lucide-react";
import { Kart, Olcum, OlcumSeridi } from "../bilesenler/Kart";
import { useGrafikRenkleri, Ipucu } from "../bilesenler/Grafik";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { useVeri } from "../api/useVeri";
import {
  cihazBul, musteriBul, inverterDetayUyarla, uretimGecmisiGetir, kaynakAnalizi,
} from "../api/servis";
import {
  saglikDurumu, DURUM_ADI, durumRengi, garantiDurumu, tarihTR, sureMetni, KAYNAK_ADI, DURUM_YAZI, onceMetni,
} from "../veri/yardimci";

const deger = (v, birim = "") => (v == null ? "—" : `${v}${birim}`);
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";

export default function InverterDetay() {
  const { id } = useParams();
  const [sekme, setSekme] = useState("olcum");
  const r = useGrafikRenkleri();
  const { veri: cHam, yukleniyor, hata, yenile } = useVeri(() => cihazBul(id), [id]);
  const { veri: m } = useVeri(
    () => (cHam?.musteriId ? musteriBul(cHam.musteriId) : Promise.resolve(null)),
    [cHam?.musteriId]
  );
  const { veri: uretimVerisi } = useVeri(() => uretimGecmisiGetir(id), [id]);
  const { veri: kaynakVerisi } = useVeri(
    () => (sekme === "kaynak" ? kaynakAnalizi(id) : Promise.resolve(null)),
    [id, sekme]
  );

  if (yukleniyor) return <Iskelet satir={3} yukseklik="h-20" />;
  if (hata) return <HataKutusu hata={hata} yenile={yenile} />;

  if (!cHam || cHam.tip !== "inverter") {
    return (
      <Kart cocuk={
        <div className="px-5 py-14 text-center">
          <p className="text-sm text-soluk">İnverter bulunamadı.</p>
          <Link to="/inverterler" className="mt-3 inline-block text-xs text-soluk hover:text-metin">
            ← inverter listesine dön
          </Link>
        </div>
      }/>
    );
  }

  const c = { ...cHam, ...inverterDetayUyarla(cHam), kaynak: kaynakVerisi };
  const d = saglikDurumu(c.saglik);
  const yazi = DURUM_YAZI[d];
  const g = garantiDurumu(c);

  return (
    <div className="space-y-5">
      <div>
        <Link to={m ? `/musteri/${m.id}` : "/inverterler"}
          className="mb-3 inline-flex items-center gap-1 text-xs text-sonuk hover:text-metin">
          <ChevronLeft size={13} /> {m ? m.ad : "inverterler"}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md bg-panel2 ring-1 ring-cizgi">
              <Cpu size={20} strokeWidth={1.6} className="text-soluk" />
            </span>
            <div>
              <h1 className="font-mono text-2xl tracking-tight">{c.id}</h1>
              <p className="mt-1 text-xs text-sonuk">
                {c.model} · {c.gucKw} kW · parti {c.parti} · üretim {tarihTR(c.uretim)}
                {c.sonOlcum?.zaman && <> · son ölçüm {onceMetni(c.sonOlcum.zaman)}</>}
              </p>
            </div>
          </div>
          <Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum]} />
        </div>
      </div>

      <OlcumSeridi sutun={5}>
        <Olcum etiket="Sağlık" deger={c.saglik ?? "—"} vurgu={yazi} />
        <Olcum etiket="Bugünkü üretim" deger={c.gunlukKwh ?? "—"} birim="kWh" />
        <Olcum etiket="IGBT" deger={c.igbt ?? "—"} birim="°C"
          vurgu={(c.igbt ?? 0) > 65 ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Soğutucu" deger={c.sogutucu ?? "—"} birim="°C"
          vurgu={(c.sogutucu ?? 0) > 50 ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Garanti" deger={g.gecerli ? Math.round(g.kalanGun / 30) : 0} birim="ay"
          vurgu={g.gecerli ? "text-metin" : "text-kritik"} />
      </OlcumSeridi>

      {c.tahmin && (
        <div className={`rounded-lg border border-cizgi bg-panel px-4 py-3 border-l-[3px] ${
          d === "kritik" ? "border-l-kritik" : "border-l-uyari"}`}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${yazi}`} />
            <div>
              <p className="text-sm">
                <span className={`font-medium ${yazi}`}>{c.tahmin.bilesen}</span>
                {c.tahmin.kalanSaat != null && <span className="text-soluk"> · müdahale penceresi {sureMetni(c.tahmin.kalanSaat)}</span>}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-soluk">{c.tahmin.gerekce}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-cizgi">
        {[
          { id: "olcum",  ad: "Ölçümler" },
          { id: "uretim", ad: "Üretim" },
          ...(c.kaynak ? [{ id: "kaynak", ad: "Arıza Kaynağı" }] : []),
        ].map((s) => (
          <button key={s.id} onClick={() => setSekme(s.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              sekme === s.id ? "border-metin text-metin"
                             : "border-transparent text-soluk hover:text-metin"}`}>
            {s.ad}
          </button>
        ))}
      </div>

      {sekme === "olcum" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Kart baslik="Elektriksel" cocuk={
            <div className="divide-y divide-cizgi">
              <Satir e="DC gerilim"    v={deger(c.dcV, " V")} />
              <Satir e="AC gerilim"    v={deger(c.acV, " V")} />
              <Satir e="Frekans"       v={deger(c.frekans, " Hz")} />
              <Satir e="Güç faktörü"   v={deger(c.pf)} />
              <Satir e="THD"           v={c.thd == null ? "—" : `%${c.thd}`} uyar={c.thd > 5} />
            </div>
          }/>
          <Kart baslik="Termal" cocuk={
            <div className="divide-y divide-cizgi">
              <Satir e="IGBT sıcaklığı"     v={deger(c.igbt, " °C")} uyar={c.igbt > 65} />
              <Satir e="Soğutucu sıcaklığı" v={deger(c.sogutucu, " °C")} uyar={c.sogutucu > 50} />
              <Satir e="Fark"               v={c.igbt != null && c.sogutucu != null ? `${(c.igbt - c.sogutucu).toFixed(1)} °C` : "—"} />
              <div className="px-4 py-3">
                <div className="mb-2 text-xs text-sonuk">Sağlık skoru</div>
                <SaglikCubugu deger={c.saglik ?? 0} durum={d} />
              </div>
            </div>
          }/>
        </div>
      )}

      {sekme === "uretim" && (
        <Kart baslik="Günlük üretim" ustBilgi={<span className="text-xs text-sonuk">son 14 gün · kWh</span>} cocuk={
          !uretimVerisi?.length ? <p className="px-5 py-16 text-center text-sm text-sonuk">Üretim verisi yok.</p> : (
          <div className="h-[320px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={uretimVerisi} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="uretimDolgu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={r.seriDolgu} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={r.seriDolgu} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={r.izgara} vertical={false} />
                <XAxis dataKey="gun" tick={{ fill: r.eksen, fontSize: 11 }} axisLine={false} tickLine={false}
                  interval="preserveStartEnd" tickFormatter={(g) => g.split("-").reverse().join(".")} />
                <YAxis tick={{ fill: r.eksen, fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                <Tooltip cursor={{ stroke: r.eksen, strokeDasharray: "3 3" }}
                  content={<Ipucu bicim={(v) => `${v} kWh`} etiket={(g) => g.split("-").reverse().join(".")} />} />
                <Area type="monotone" dataKey="uretim" name="Üretim" stroke={r.seri} strokeWidth={2}
                  fill="url(#uretimDolgu)" isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: r.yuzey }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )
        }/>
      )}

      {sekme === "kaynak" && c.kaynak && (
        <Kart
          baslik="Arıza Kaynağı Analizi"
          ustBilgi={
            <Rozet durum={c.kaynak.sinif === "uretim" ? "uyari" : "bilgi"}
              cocuk={`${KAYNAK_ADI[c.kaynak.sinif]} · %${Math.round(c.kaynak.guven * 100)}`} />
          }
          cocuk={
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-sm font-medium">Bulgu</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-soluk">{c.kaynak.bulgu}</p>
              </div>
              <div className="border-t border-cizgi pt-4">
                <h3 className="text-sm font-medium">Değerlendirme</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-soluk">
                  {c.kaynak.sinif === "uretim"
                    ? "Bozulma kademeli seyretmiş ve sistem arızadan önce uyarı üretmiştir. Kullanım kaynaklı bir tetikleyici bulunmadığından garanti değerlendirmesine uygundur."
                    : "Arıza öncesinde kademeli bozulma eğrisi görülmemiştir. Ölçüm kayıtlarında aşırı yük veya sıcaklık aşımı bulunduğundan kullanım kaynaklı değerlendirilmiştir."}
                </p>
              </div>
              <div className="border-t border-cizgi pt-4">
                <p className="text-2xs leading-relaxed text-sonuk">
                  Bu analiz ölçüm verisine dayalı bir değerlendirmedir; garanti kararı üreticiye aittir.
                </p>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}

function Satir({ e, v, uyar }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-soluk">{e}</span>
      <span className={`text-sm tabular-nums ${uyar ? "text-uyari" : "text-metin"}`}>{v}</span>
    </div>
  );
}
