import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, AlertTriangle, Clock, Sparkles } from "lucide-react";
import { useVeri } from "../api/useVeri";
import { cihazBul, musteriBul, akuDetayUyarla, cihazGecmisi } from "../api/servis";
import {
  saglikDurumu, DURUM_ADI, durumRengi, garantiDurumu, tarihTR, sureMetni, onceMetni, DURUM_YAZI,
} from "../veri/yardimci";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useGrafikRenkleri, Ipucu } from "../bilesenler/Grafik";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

/**
 * Akü detay sayfası. Düzen BMS ekranlarını izler (hücre gerilimleri,
 * sıcaklık sensörleri, MOSFET durumu, hata kodları); üzerine sistemin
 * kendi katkısı olan öngörü ve hücre eğilimi eklenir.
 */

export default function AkuDetay() {
  const { id } = useParams();
  const git = useNavigate();
  const { veri: aku, yukleniyor, hata, yenile } = useVeri(() => cihazBul(id), [id]);
  const { veri: musteri } = useVeri(
    () => (aku?.musteriId ? musteriBul(aku.musteriId) : Promise.resolve(null)),
    [aku?.musteriId]
  );
  const { veri: gecmis } = useVeri(() => cihazGecmisi(id), [id]);

  if (yukleniyor) return <Iskelet satir={4} yukseklik="h-24" />;
  if (hata) return <HataKutusu hata={hata} yenile={yenile} />;

  if (!aku || aku.tip !== "aku") {
    return (
      <div className="rounded-lg border border-cizgi bg-panel px-5 py-14 text-center">
        <p className="text-sm text-soluk">Akü bulunamadı.</p>
        <Link to="/akuler" className="mt-3 inline-block text-xs text-bilgi hover:underline">
          ← akü listesine dön
        </Link>
      </div>
    );
  }

  const d = akuDetayUyarla({ ...aku, gecmis });
  const durum = saglikDurumu(aku.saglik);
  const g = garantiDurumu(aku);
  const yazi = DURUM_YAZI[durum];
  const olcumZamani = aku.sonOlcum?.zaman;

  return (
    <div className="space-y-4">
      <div>
        <Link
          to={musteri ? `/musteri/${musteri.id}` : "/akuler"}
          className="mb-3 inline-flex items-center gap-1 text-xs
                     text-sonuk transition-colors hover:text-metin"
        >
          <ChevronLeft size={13} /> {musteri ? musteri.ad : "aküler"}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl tracking-tight">{aku.id}</h1>
            <p className="mt-1 text-xs text-sonuk">
              {aku.model} · 16S · parti {aku.parti} · üretim {tarihTR(aku.uretim)}
            </p>
            <p className="mt-1 text-xs text-sonuk">
              {d.veriYok ? "Cihaz henüz ölçüm göndermedi" : olcumZamani ? `Son ölçüm ${onceMetni(olcumZamani)}` : "Son ölçüm alındı"}
            </p>
          </div>
          <DurumEtiketi durum={durumRengi(aku.durum)} metin={DURUM_ADI[aku.durum]} />
        </div>
      </div>

      {/* ══ ÜST ŞERİT — BMS ana göstergeleri ══ */}
      <div className="overflow-hidden rounded-lg border border-cizgi bg-panel">
        <div className="grid divide-y divide-cizgi lg:grid-cols-[264px_1fr] lg:divide-x lg:divide-y-0">
          <div className="flex items-center gap-5 p-6">
            <Batarya yuzde={aku.sarj} durum={durum} />
            <div>
              <div className={`text-[2.75rem] font-semibold leading-none tabular-nums ${yazi}`}>
                {aku.sarj ?? "—"}<span className="text-xl font-normal text-sonuk">%</span>
              </div>
              <div className="mt-2 text-xs font-medium tracking-wide text-sonuk">
                Şarj durumu
              </div>
              <div className="mt-3 text-sm text-soluk tabular-nums">
                {d.kalanKapasiteAh ?? "—"} / {d.toplamKapasiteAh ?? "—"} Ah
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-cizgi sm:grid-cols-4">
            <Olcum e="Paket gerilimi" v={d.paketGerilim ?? "—"} b={d.paketGerilim != null ? "V" : null} />
            <Olcum e="Akım" v={d.akim == null ? "—" : d.akim > 0 ? `+${d.akim}` : d.akim} b={d.akim != null ? "A" : null} />
            <Olcum e="Sağlık" v={aku.saglik ?? "—"} vurgu={yazi} />
            <Olcum e="Çevrim" v={d.cevrim ?? "—"} vurgu={d.cevrim > 1000 ? "text-uyari" : ""} />
            <Olcum e="Hücre farkı" v={d.fark != null ? (d.fark * 1000).toFixed(0) : "—"} b={d.fark != null ? "mV" : null}
                   vurgu={d.fark > 0.08 ? "text-uyari" : ""} />
            <Olcum e="Ortalama" v={d.ortalama ?? "—"} b={d.ortalama != null ? "V" : null} />
            <Olcum e="Sıcaklık" v={d.sicaklik ?? "—"} b={d.sicaklik != null ? "°C" : null}
                   vurgu={d.sicaklik > 35 ? "text-uyari" : ""} />
            <Olcum e="Garanti" v={g.gecerli ? Math.round(g.kalanGun / 30) : 0} b="ay"
                   vurgu={g.gecerli ? "" : "text-kritik"} />
          </div>
        </div>
      </div>

      {aku.tahmin && (
        <div className={`rounded-lg border border-l-[3px] border-cizgi bg-panel px-5 py-4
                        ${durum === "kritik" ? "border-l-kritik" : "border-l-uyari"}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={17} strokeWidth={1.9} className={`mt-0.5 shrink-0 ${yazi}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${yazi}`}>{aku.tahmin.bilesen}</p>
              <p className="mt-1 text-sm leading-relaxed text-soluk">{aku.tahmin.gerekce}</p>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-sonuk">
                <Clock size={12} />
                {aku.tahmin.kalanSaat != null ? `müdahale penceresi ${sureMetni(aku.tahmin.kalanSaat)}` : "müdahale penceresi hesaplanmadı"}
                <span className="mx-1 text-cizgi">|</span>
                {aku.tahmin.guven != null ? `%${aku.tahmin.guven} güven` : "güven hesaplanmadı"}
              </div>
              <button
                onClick={() => git("/asistan", { state: { soru:
                  `${aku.id}${aku.model ? ` (${aku.model})` : ""} akümde "${aku.tahmin.bilesen}" sorunu görülüyor. ` +
                  `${aku.tahmin.gerekce} Sağlık ${aku.saglik ?? "?"}/100. ` +
                  "Bu arızanın nedenini, olası sebeplerini ve çözüm/müdahale adımlarını kısaca açıkla." } })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-cizgi px-3 py-1.5 text-xs font-medium text-metin hover:bg-panel2">
                <Sparkles size={13} /> Bu arızayı asistana açıkla
              </button>
            </div>
          </div>
        </div>
      )}

      <Panel
        baslik="Hücre gerilimleri"
        sag={d.enYuksek && d.enDusuk &&
          <span className="text-xs text-soluk">
            en yüksek <b className="font-medium text-metin">{d.enYuksek.deger}V</b> h{d.enYuksek.no}
            <span className="mx-2 text-cizgi">·</span>
            en düşük{" "}
            <b className={`font-medium ${d.fark > 0.08 ? "text-uyari" : "text-metin"}`}>
              {d.enDusuk.deger}V
            </b>{" "}
            h{d.enDusuk.no}
          </span>
        }
      >
        {d.hucreler.length ? <Hucreler detay={d} /> : <VeriBekleniyor />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel baslik="Sıcaklık sensörleri">
          <div className="divide-y divide-cizgi">
            {d.sicakliklar.length === 0 && <VeriBekleniyor />}
            {d.sicakliklar.map((s) => {
              // BMS dort sensor bildirir ama sahada hepsi bagli olmayabilir.
              // Bagli olmayan sensor "—" gosterilir; sifir gostermek yanlis olur.
              const bagli = s.deger != null && s.deger > -40;
              const yuksek = bagli && s.deger > 35;
              return (
                <div key={s.no} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-sonuk">Sensör {s.no}</span>
                  {bagli ? (
                    <div className="flex items-center gap-3">
                      <div className="h-1 w-16 overflow-hidden bg-cizgi">
                        <div className={`h-full ${yuksek ? "bg-uyari" : "bg-soluk"}`}
                             style={{ width: `${Math.min(100, (s.deger / 55) * 100)}%` }} />
                      </div>
                      <span className={`w-14 text-right font-mono text-sm tabular-nums
                                       ${yuksek ? "text-uyari" : "text-metin"}`}>
                        {s.deger}°C
                      </span>
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-sonuk">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel baslik="Sistem durumu">
          <div className="divide-y divide-cizgi">
            <Satir e="Şarj MOSFET" v={d.sarjMos == null ? "—" : d.sarjMos ? "Açık" : "Kapalı"} iyi={d.sarjMos} />
            <Satir e="Deşarj MOSFET" v={d.desarjMos == null ? "—" : d.desarjMos ? "Açık" : "Kapalı"} iyi={d.desarjMos} />
            <Satir e="Dengeleme"
                   v={d.dengeleme == null ? "—" : d.dengeleme.length ? `Hücre ${d.dengeleme.join(", ")}` : "Pasif"}
                   iyi={null} />
            <Satir e="Hücre sayısı" v={`${aku.hucreSayisi ?? 16}S`} iyi={null} />
          </div>
        </Panel>

        <Panel baslik="Uyarı ve hata kodları"
               sag={<span className="text-xs text-sonuk">{d.hatalar.length}</span>}>
          {d.hatalar.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-sonuk">Aktif uyarı yok</p>
            </div>
          ) : (
            <div className="divide-y divide-cizgi">
              {d.hatalar.map((h) => {
                const renk = { kritik: "text-kritik", uyari: "text-uyari", bilgi: "text-sonuk" }[h.seviye];
                return (
                  <div key={h.kod} className="flex items-start gap-3 px-5 py-3">
                    <span className={`shrink-0 text-xs ${renk}`}>{h.kod}</span>
                    <span className="text-sm leading-snug">{h.mesaj}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel baslik="Hücre yaşlanma eğilimi"
             sag={<span className="text-xs text-sonuk">son 30 gün · günlük ortalama</span>}>
        <div className="p-4">
          <p className="mb-5 max-w-[78ch] text-sm leading-relaxed text-soluk">
            En yüksek ve en düşük hücre arasındaki gerilim farkı. Sürekli artan fark,
            bir hücrenin ayrıştığını ve kapasite kaybının başladığını gösterir.
          </p>
          {d.egilim.length ? <Egilim veri={d.egilim} /> : <VeriBekleniyor metin="Eğilim için en az iki günlük ölçüm gerekir." />}
        </div>
      </Panel>
    </div>
  );
}

/* ═══════════════ PARÇALAR ═══════════════ */

function VeriBekleniyor({ metin = "Ölçüm verisi bekleniyor." }) {
  return <p className="px-5 py-10 text-center text-xs text-sonuk">{metin}</p>;
}

function Panel({ baslik, sag, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-cizgi bg-panel">
      <header className="flex min-h-[44px] items-center justify-between gap-3 border-b border-cizgi px-4 py-2.5">
        <h2 className="text-sm font-medium">{baslik}</h2>
        {sag}
      </header>
      {children}
    </section>
  );
}

function DurumEtiketi({ durum, metin }) {
  const stil = {
    saglikli: "text-saglikli border-saglikli/30",
    uyari: "text-uyari border-uyari/30",
    kritik: "text-kritik border-kritik/30",
    notr: "text-sonuk border-cizgi",
  }[durum] || "text-sonuk border-cizgi";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1
                      text-xs tracking-wide ${stil}`}>
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {metin}
    </span>
  );
}

function Batarya({ yuzde, durum }) {
  const renk = `rgb(var(--${{ saglikli: "saglikli", uyari: "uyari", kritik: "kritik" }[durum] || "sonuk"}))`;
  const dolu = Math.max(0, Math.min(100, yuzde ?? 0));
  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      {/* Gerçek ürün görseli — marka kimliği için. Şarj yüzdesi zaten
          yanında büyük punto ile gösterildiğinden, burada yalnızca
          ince bir dolum çubuğu yeterli; ayrı bir şematik gösterge
          gerekmiyor. */}
      <img
        src="/gorseller/aku-orta.webp"
        alt="Dennis Energy akü"
        width={80} height={80}
        className="rounded-md bg-white object-contain p-1"
      />
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-cizgi">
        <div className="h-full rounded-full transition-all" style={{ width: `${dolu}%`, background: renk }} />
      </div>
    </div>
  );
}

function Hucreler({ detay }) {
  const { hucreler, enYuksek, enDusuk, ortalama } = detay;
  const alt = enDusuk.deger - 0.02;
  const ust = enYuksek.deger + 0.01;
  const aralik = ust - alt || 0.01;

  return (
    <div className="p-4">
      <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 224 }}>
        {hucreler.map((h) => {
          const oran = ((h.gerilim - alt) / aralik) * 100;
          const sorunlu = ortalama - h.gerilim > 0.05;
          const enYuksekMu = h.no === enYuksek.no;
          return (
            <div key={h.no} className="flex h-full min-w-[28px] flex-1 flex-col items-center gap-2">
              <span className={`text-xs tabular-nums
                               ${sorunlu ? "font-medium text-kritik" : "text-sonuk"}`}>
                {h.gerilim.toFixed(3)}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div className={`w-full rounded-t-sm
                                ${sorunlu ? "bg-kritik" : enYuksekMu ? "bg-metin" : "bg-soluk"}`}
                     style={{ height: `${Math.max(4, oran)}%`, opacity: sorunlu ? 1 : 0.65 }} />
              </div>
              <span className={`text-xs
                               ${sorunlu ? "font-medium text-kritik" : "text-sonuk"}`}>
                {h.no}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FARK_ESIK_MV = 80; // BMS dengeleme sınırı; üstü "izlemede" sayılır

function Egilim({ veri }) {
  const r = useGrafikRenkleri();
  const tarih = (g) => g.slice(5).split("-").reverse().join(".");
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={veri} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={r.izgara} vertical={false} />
          <XAxis dataKey="gun" tickFormatter={tarih} tick={{ fill: r.eksen, fontSize: 11 }}
            axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fill: r.eksen, fontSize: 11 }} axisLine={false} tickLine={false} unit=" mV" width={64} />
          <ReferenceLine y={FARK_ESIK_MV} stroke={r.uyari} strokeDasharray="4 4" strokeOpacity={0.7}
            label={{ value: `eşik ${FARK_ESIK_MV} mV`, position: "insideTopLeft", fill: r.soluk, fontSize: 11 }} />
          <Tooltip cursor={{ stroke: r.eksen, strokeDasharray: "3 3" }}
            content={<Ipucu bicim={(v) => `${v} mV`} etiket={tarih} />} />
          <Line type="monotone" dataKey="farkMv" name="Hücre farkı" stroke={r.seri} strokeWidth={2}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: r.yuzey }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ölçüm hücresi.
 *
 * Tipografi kontrastı bilinçli: etiket küçük ve soluk, değer büyük ve
 * kalın. Göz önce sayıyı görür, sonra ne olduğunu okur — gösterge
 * panelinde doğru sıra budur.
 */
function Olcum({ e, v, b, vurgu }) {
  return (
    <div className="bg-panel px-4 py-3">
      <div className="text-xs text-sonuk">{e}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums
                       ${vurgu || "text-metin"}`}>
        {v}
        {b && <span className="ml-1 text-sm font-normal text-sonuk">{b}</span>}
      </div>
    </div>
  );
}

function Satir({ e, v, iyi }) {
  const renk = iyi == null ? "text-soluk" : iyi ? "text-saglikli" : "text-kritik";
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-sonuk">{e}</span>
      <span className={`text-xs font-medium ${renk}`}>{v}</span>
    </div>
  );
}
