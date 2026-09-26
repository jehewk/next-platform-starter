import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChevronLeft, Cpu, AlertTriangle } from "lucide-react";
import { Kart, Olcum } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { useVeri } from "../api/useVeri";
import {
  cihazBul, musteriBul, inverterDetayUyarla, uretimGecmisiGetir, kaynakAnalizi,
} from "../api/servis";
import {
  saglikDurumu, DURUM_ADI, durumRengi, garantiDurumu, tarihTR, sureMetni, KAYNAK_ADI,
} from "../veri/yardimci";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";

export default function InverterDetay() {
  const { id } = useParams();
  const [sekme, setSekme] = useState("olcum");
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
          <p className="text-sm">İnverter bulunamadı.</p>
          <Link to="/inverterler" className="mt-3 inline-block text-xs text-soluk hover:text-metin">
            ← inverter listesine dön
          </Link>
        </div>
      }/>
    );
  }

  const c = { ...cHam, ...inverterDetayUyarla(cHam), kaynak: kaynakVerisi };
  const d = saglikDurumu(c.saglik);
  const yazi = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik", notr: "text-sonuk" }[d];
  const g = garantiDurumu(c);

  return (
    <div className="space-y-4">
      <div>
        <Link to={m ? `/musteri/${m.id}` : "/inverterler"}
          className="mb-3 inline-flex items-center gap-1 text-xs text-sonuk hover:text-metin">
          <ChevronLeft size={13} /> {m ? m.ad : "inverterler"}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Cpu size={20} strokeWidth={1.6} className="mt-1 text-soluk" />
            <div>
              <h1 className="font-mono text-lg">{c.id}</h1>
              <p className="mt-0.5 text-xs text-sonuk">
                {c.model} · {c.gucKw} kW · parti {c.parti} · üretim {tarihTR(c.uretim)}
              </p>
            </div>
          </div>
          <Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum]} />
        </div>
      </div>

      <div className="grid grid-cols-2 border border-cizgi bg-panel md:grid-cols-5">
        <Olcum etiket="Sağlık" deger={c.saglik ?? "—"} vurgu={yazi} />
        <Olcum etiket="Bugünkü üretim" deger={c.gunlukKwh ?? "—"} birim="kWh" />
        <Olcum etiket="IGBT" deger={c.igbt ?? "—"} birim="°C"
          vurgu={(c.igbt ?? 0) > 65 ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Soğutucu" deger={c.sogutucu ?? "—"} birim="°C"
          vurgu={(c.sogutucu ?? 0) > 50 ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Garanti" deger={g.gecerli ? Math.round(g.kalanGun / 30) : 0} birim="ay"
          vurgu={g.gecerli ? "text-metin" : "text-kritik"} />
      </div>

      {c.tahmin && (
        <div className={`border border-cizgi bg-panel px-4 py-3 border-l-2 ${
          d === "kritik" ? "border-l-kritik" : "border-l-uyari"}`}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${yazi}`} />
            <div>
              <p className="text-sm">
                <span className={`font-medium ${yazi}`}>{c.tahmin.bilesen}</span>
                <span className="text-soluk"> · müdahale penceresi {sureMetni(c.tahmin.kalanSaat)}</span>
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
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
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
              <Satir e="DC gerilim"    v={`${c.dcV} V`} />
              <Satir e="AC gerilim"    v={`${c.acV} V`} />
              <Satir e="Frekans"       v={`${c.frekans} Hz`} />
              <Satir e="Güç faktörü"   v={c.pf} />
              <Satir e="THD"           v={`%${c.thd}`} uyar={c.thd > 5} />
            </div>
          }/>
          <Kart baslik="Termal" cocuk={
            <div className="divide-y divide-cizgi">
              <Satir e="IGBT sıcaklığı"     v={`${c.igbt} °C`} uyar={c.igbt > 65} />
              <Satir e="Soğutucu sıcaklığı" v={`${c.sogutucu} °C`} uyar={c.sogutucu > 50} />
              <Satir e="Fark"               v={`${(c.igbt - c.sogutucu).toFixed(1)} °C`} />
              <div className="px-4 py-3">
                <div className="mb-2 text-xs text-sonuk">SAĞLIK SKORU</div>
                <SaglikCubugu deger={c.saglik ?? 0} durum={d} />
              </div>
            </div>
          }/>
        </div>
      )}

      {sekme === "uretim" && (
        <Kart baslik="Son 14 gün" cocuk={
          <div className="h-[320px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={uretimVerisi || []} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E6E9ED" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#E6E9ED" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#242B35" vertical={false} />
                <XAxis dataKey="gun" tick={{ fill: "#5B6472", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  axisLine={{ stroke: "#242B35" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#5B6472", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  axisLine={false} tickLine={false} width={46} />
                <Tooltip contentStyle={{ background: "#1B2029", border: "1px solid #242B35",
                  borderRadius: 2, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                  labelStyle={{ color: "#8A93A0" }}
                  formatter={(v, ad) => [`${v} kWh`, ad === "uretim" ? "gerçekleşen" : "beklenen"]} />
                <Area type="monotone" dataKey="beklenen" stroke="#5B6472" strokeWidth={1}
                  strokeDasharray="3 4" fill="none" />
                <Area type="monotone" dataKey="uretim" stroke="#E6E9ED" strokeWidth={1.8} fill="url(#dg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
      <span className="text-xs font-medium text-sonuk">{e}</span>
      <span className={`font-mono text-sm ${uyar ? "text-uyari" : "text-metin"}`}>{v}</span>
    </div>
  );
}
