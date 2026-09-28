import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChevronLeft, LifeBuoy, ShieldCheck, Thermometer, Gauge, Clock } from "lucide-react";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useGrafikRenkleri, Ipucu } from "../bilesenler/Grafik";
import Halka from "../bilesenler/Halka";
import DestekTalebi from "../bilesenler/DestekTalebi";
import { useCanli } from "../api/useCanli";
import { useVeri } from "../api/useVeri";
import { cihazBul, uretimGecmisiGetir } from "../api/servis";
import { olcumYasiDk, SESSIZ_DAKIKA } from "../api/sistem";
import { musteriDurumu, musteriMesaji, yaklasikZaman, enerjiAkisi, paketGerilimi, enYuksekSicaklik } from "../veri/sadeDil";
import { garantiDurumu, onceMetni, tarihTR } from "../veri/yardimci";

const RENK = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik", sonuk: "text-sonuk" };

/**
 * Müşteriye dönük cihaz sayfası. Teknisyen ayrıntısı (hücre gerilimleri,
 * IGBT, hata kodları) gösterilmez; aynı veri sade dile çevrilir.
 */
export default function CihazDetay() {
  const { id } = useParams();
  const { veri: c, hata, yukleniyor, yenile } = useCanli(() => cihazBul(id), 30000);
  const [destek, setDestek] = useState(false);

  if (yukleniyor) return <Iskelet satir={3} yukseklik="h-32" />;
  if (!c) return <HataKutusu hata={hata} yenile={yenile} />;

  const d = musteriDurumu(c.saglik);
  const mesaj = c.tahmin ? musteriMesaji(c.tahmin, c.saglik) : null;
  const g = garantiDurumu(c);
  const yas = olcumYasiDk(c);

  return (
    <div className="space-y-4">
      <Link to="/cihazlar" className="inline-flex items-center gap-1 text-sm text-soluk hover:text-metin">
        <ChevronLeft size={16} /> Cihazlarım
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{c.tip === "aku" ? "Akü" : "İnverter"}</h1>
        <p className="mt-0.5 font-mono text-xs text-sonuk">{c.id}{c.model ? ` · ${c.model}` : ""}</p>
      </div>

      <section className="rounded-xl border border-cizgi bg-panel p-5">
        <p className={`text-lg font-semibold ${RENK[d.renk]}`}>{d.ad}</p>
        {mesaj ? (
          <>
            <p className="mt-2 text-sm font-medium">{mesaj.baslik}</p>
            <p className="mt-1 text-sm leading-relaxed text-soluk">{mesaj.aciklama}</p>
            {d.anahtar === "dikkat" && c.tahmin?.kalanSaat != null && (
              <p className="mt-2 text-xs text-sonuk">Ekibimiz {yaklasikZaman(c.tahmin.kalanSaat)} sizinle iletişime geçecek.</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-soluk">{c.saglik == null ? "İlk ölçüm bekleniyor." : "Cihazınız normal çalışıyor."}</p>
        )}
        {c.saglik != null && <p className="mt-3 text-xs text-sonuk">Sağlık puanı {c.saglik}/100</p>}
      </section>

      {yas != null && yas >= SESSIZ_DAKIKA && (
        <p className="rounded-xl border border-uyari/30 bg-uyari/10 p-4 text-sm">
          Bu cihazdan {onceMetni(c.sonOlcum.zaman)} beri veri gelmiyor. Açık olduğundan ve Wi-Fi'ye bağlı olduğundan emin olun.
        </p>
      )}

      {c.tip === "aku" ? <AkuBilgisi c={c} /> : <InverterBilgisi c={c} />}

      <section className="grid grid-cols-2 gap-3">
        <Bilgi ikon={ShieldCheck} etiket="Garanti"
          deger={g.bitis ? (g.gecerli ? `${Math.round(g.kalanGun / 30)} ay kaldı` : "Süresi doldu") : "—"}
          alt={g.bitis ? `${g.bitis.toLocaleDateString("tr-TR")} tarihine kadar` : null} />
        <Bilgi ikon={Clock} etiket="Kurulum" deger={tarihTR(c.kurulum)} alt={c.sonOlcum?.zaman ? `Son ölçüm ${onceMetni(c.sonOlcum.zaman)}` : null} />
      </section>

      <button onClick={() => setDestek(true)} className="dugme-ikincil min-h-[48px] w-full">
        <LifeBuoy size={16} /> Bu cihazla ilgili destek iste
      </button>

      <DestekTalebi acik={destek} kapat={() => setDestek(false)} cihazlar={[c]} />
    </div>
  );
}

function AkuBilgisi({ c }) {
  const o = c.sonOlcum;
  const soc = o?.soc != null ? Math.round(Number(o.soc)) : c.sarj;
  const akis = o ? enerjiAkisi(paketGerilimi(o), Number(o.akim)) : null;
  const sicaklik = enYuksekSicaklik(o);
  return (
    <section className="rounded-xl border border-cizgi bg-panel p-5">
      <div className="flex items-center gap-5">
        <Halka yuzde={soc} renk={soc == null ? "sonuk" : soc < 20 ? "uyari" : "saglikli"} etiket="şarj" boyut={120} />
        <div className="space-y-2 text-sm">
          <p className="font-medium">{akis ? akis.metin : "Ölçüm bekleniyor"}{akis?.kw > 0 && <span className="font-normal text-soluk"> · {akis.kw.toFixed(1)} kW</span>}</p>
          {soc != null && c.kapasiteAh && <p className="text-soluk">≈ {Math.round((soc / 100) * c.kapasiteAh)} / {c.kapasiteAh} Ah</p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Bilgi ikon={Thermometer} etiket="Sıcaklık" deger={sicaklik != null ? `${sicaklik} °C` : "—"}
          alt={sicaklik == null ? null : sicaklik >= 45 ? "Normalden sıcak" : "Normal aralıkta"} vurgu={sicaklik >= 45 ? "text-uyari" : ""} />
        <Bilgi ikon={Gauge} etiket="Şarj döngüsü" deger={o?.cevrim != null ? String(Math.round(Number(o.cevrim))) : "—"} alt="Tam şarj-deşarj sayısı" />
      </div>
    </section>
  );
}

function InverterBilgisi({ c }) {
  const r = useGrafikRenkleri();
  const { veri: gunler } = useVeri(() => uretimGecmisiGetir(c.id, 14), [c.id]);
  const bugun = c.sonOlcum?.gunluk_kwh ?? c.gunlukKwh;
  const tarih = (g) => g.split("-").reverse().join(".");
  return (
    <section className="rounded-xl border border-cizgi bg-panel p-5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums">{bugun != null ? Number(bugun).toFixed(1) : "—"}</span>
        <span className="text-sm text-soluk">kWh bugün</span>
      </div>
      {gunler?.length > 1 ? (
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={gunler} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="mUretim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={r.seriDolgu} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={r.seriDolgu} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={r.izgara} vertical={false} />
              <XAxis dataKey="gun" tickFormatter={tarih} tick={{ fill: r.eksen, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fill: r.eksen, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<Ipucu bicim={(v) => `${v} kWh`} etiket={tarih} />} />
              <Area type="monotone" dataKey="uretim" name="Üretim" stroke={r.seri} strokeWidth={2} fill="url(#mUretim)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="mt-3 text-sm text-sonuk">Günlük üretim grafiği birkaç gün sonra oluşur.</p>}
    </section>
  );
}

function Bilgi({ ikon: Ikon, etiket, deger, alt, vurgu = "" }) {
  return (
    <div className="rounded-xl border border-cizgi bg-panel p-4">
      <div className="flex items-center gap-1.5 text-xs text-sonuk"><Ikon size={13} /> {etiket}</div>
      <div className={`mt-1.5 text-base font-semibold ${vurgu}`}>{deger}</div>
      {alt && <div className="mt-0.5 text-xs text-sonuk">{alt}</div>}
    </div>
  );
}
