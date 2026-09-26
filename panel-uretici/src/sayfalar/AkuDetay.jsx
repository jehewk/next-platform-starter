import { useParams, Link } from "react-router-dom";
import { ChevronLeft, AlertTriangle, Clock } from "lucide-react";
import { useVeri } from "../api/useVeri";
import { cihazBul, musteriBul, akuDetayUyarla, cihazGecmisi } from "../api/servis";
import {
  saglikDurumu, DURUM_ADI, durumRengi, garantiDurumu, tarihTR, sureMetni,
} from "../veri/yardimci";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";

/**
 * Akü gösterge paneli — Daly BMS arayüzü referans alındı.
 *
 * Tasarım ilkesi: BMS ekranında ne varsa aynı yerde, aynı sadelikte
 * olsun. Teknisyen alışkın olduğu düzeni bulsun. Sistemin kendi
 * katkısı (trend, müdahale penceresi) bunun üstüne eklenir.
 *
 * Beyaz tema: gölge yok, ince kenar çizgileri var. Renk yalnızca
 * durum bildirir — dekorasyon için kullanılmaz.
 */

export default function AkuDetay() {
  const { id } = useParams();
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
      <div className="border border-cizgi px-5 py-14 text-center">
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
  const yazi = {
    saglikli: "text-saglikli", uyari: "text-uyari",
    kritik: "text-kritik", notr: "text-sonuk",
  }[durum];

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
              Son ölçüm 4 dk önce · örnekleme 10 dk
            </p>
          </div>
          <DurumEtiketi durum={durumRengi(aku.durum)} metin={DURUM_ADI[aku.durum]} />
        </div>
      </div>

      {/* ══ ÜST ŞERİT — BMS ana göstergeleri ══ */}
      <div className="overflow-hidden border border-cizgi">
        <div className="grid divide-y divide-cizgi lg:grid-cols-[264px_1fr] lg:divide-x lg:divide-y-0">
          <div className="flex items-center gap-5 p-6">
            <Batarya yuzde={aku.sarj} durum={durum} />
            <div>
              <div className={`text-[2.75rem] font-semibold leading-none tabular-nums ${yazi}`}>
                {aku.sarj}<span className="text-xl font-normal text-sonuk">%</span>
              </div>
              <div className="mt-2 text-xs font-medium tracking-wide text-sonuk">
                Şarj durumu
              </div>
              <div className="mt-3 text-sm text-soluk tabular-nums">
                {d.kalanKapasiteAh} / {d.toplamKapasiteAh} Ah
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-cizgi sm:grid-cols-4">
            <Olcum e="Paket gerilimi" v={aku.gerilim} b="V" />
            <Olcum e="Akım" v={d.akim > 0 ? `+${d.akim}` : d.akim} b="A" />
            <Olcum e="Sağlık" v={aku.saglik} vurgu={yazi} />
            <Olcum e="Çevrim" v={aku.cevrim} vurgu={aku.cevrim > 1000 ? "text-uyari" : ""} />
            <Olcum e="Hücre farkı" v={(d.fark * 1000).toFixed(0)} b="mV"
                   vurgu={d.fark > 0.08 ? "text-uyari" : ""} />
            <Olcum e="Ortalama" v={d.ortalama} b="V" />
            <Olcum e="Sıcaklık" v={aku.sicaklik} b="°C"
                   vurgu={aku.sicaklik > 35 ? "text-uyari" : ""} />
            <Olcum e="Garanti" v={g.gecerli ? Math.round(g.kalanGun / 30) : 0} b="ay"
                   vurgu={g.gecerli ? "" : "text-kritik"} />
          </div>
        </div>
      </div>

      {aku.tahmin && (
        <div className={`rounded-lg border border-l-[3px] border-cizgi px-5 py-4
                        ${durum === "kritik" ? "border-l-kritik" : "border-l-uyari"}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={17} strokeWidth={1.9} className={`mt-0.5 shrink-0 ${yazi}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${yazi}`}>{aku.tahmin.bilesen}</p>
              <p className="mt-1 text-sm leading-relaxed text-soluk">{aku.tahmin.gerekce}</p>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-sonuk">
                <Clock size={12} />
                müdahale penceresi {sureMetni(aku.tahmin.kalanSaat)}
                <span className="mx-1 text-cizgi">|</span>
                %{aku.tahmin.guven} güven
              </div>
            </div>
          </div>
        </div>
      )}

      <Panel
        baslik="Hücre Gerilimleri"
        sag={
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
        <Hucreler detay={d} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel baslik="Sıcaklık Sensörleri">
          <div className="divide-y divide-cizgi">
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

        <Panel baslik="Sistem Durumu">
          <div className="divide-y divide-cizgi">
            <Satir e="ŞARJ MOSFET" v={d.sarjMos ? "AÇIK" : "KAPALI"} iyi={d.sarjMos} />
            <Satir e="DEŞARJ MOSFET" v={d.desarjMos ? "AÇIK" : "KAPALI"} iyi={d.desarjMos} />
            <Satir e="DENGELEME"
                   v={d.dengeleme.length ? `HÜCRE ${d.dengeleme.join(", ")}` : "PASİF"}
                   iyi={null} />
            <Satir e="HÜCRE SAYISI" v="16S" iyi={null} />
          </div>
        </Panel>

        <Panel baslik="Uyarı ve Hata Kodları"
               sag={<span className="text-xs text-sonuk">{d.hatalar.length}</span>}>
          {d.hatalar.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-sonuk">AKTİF UYARI YOK</p>
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

      <Panel baslik="Hücre Yaşlanma Eğilimi"
             sag={<span className="text-xs text-sonuk">son 30 gün · mV</span>}>
        <div className="p-4">
          <p className="mb-5 max-w-[78ch] text-sm leading-relaxed text-soluk">
            BMS anlık değerleri verir; sistem bu değerlerin zaman içindeki seyrini izler.
            Belirgin şekilde ayrışan hücre, kapasite kaybının ilk işaretidir.
          </p>
          <Egilim veri={d.egilim} />
        </div>
      </Panel>
    </div>
  );
}

/* ═══════════════ PARÇALAR ═══════════════ */

function Panel({ baslik, sag, children }) {
  return (
    <section className="overflow-hidden border border-cizgi bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-cizgi px-4 py-2.5">
        <h2 className="text-xs font-medium tracking-wide text-sonuk">{baslik}</h2>
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
  const renk = { saglikli: "#1F7A4D", uyari: "#A8751B", kritik: "#C0392B", notr: "#9AA1AB" }[durum];
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
        className="border border-cizgi bg-white object-contain p-1"
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

function Egilim({ veri }) {
  return (
    <div className="relative overflow-x-auto">
      <div className="absolute left-0 right-0 top-1/2 h-px bg-cizgi" />
      <div className="relative flex items-center gap-2" style={{ height: 120 }}>
        {veri.map((e) => {
          const v = Number(e.degisim);
          const kotu = v < -15;
          const yuk = Math.min(46, Math.abs(v) * 1.6 + 3);
          return (
            <div key={e.no} className="flex h-full min-w-[24px] flex-1 flex-col items-center">
              <div className="flex w-full flex-1 items-end justify-center">
                {v > 0 && <div className="w-full rounded-t-sm bg-soluk"
                               style={{ height: `${yuk}%`, opacity: 0.4 }} />}
              </div>
              <div className="flex w-full flex-1 flex-col items-center">
                {v < 0 && <div className={`w-full rounded-b-sm ${kotu ? "bg-kritik" : "bg-soluk"}`}
                               style={{ height: `${yuk}%`, opacity: kotu ? 1 : 0.4 }} />}
                <span className={`mt-auto text-xs
                                 ${kotu ? "font-medium text-kritik" : "text-sonuk"}`}>
                  {e.no}
                </span>
              </div>
            </div>
          );
        })}
      </div>
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
    <div className="px-4 py-3 transition-colors duration-200 hover:bg-panel2">
      <div className="text-xs font-medium tracking-wide text-sonuk">{e}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums
                       ${vurgu || "text-metin"}`}>
        {v}
        {b && <span className="ml-1 text-sm font-normal text-sonuk">{b}</span>}
      </div>
    </div>
  );
}

function Satir({ e, v, iyi }) {
  const renk = iyi === null ? "text-soluk" : iyi ? "text-saglikli" : "text-kritik";
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs font-medium text-sonuk">{e}</span>
      <span className={`text-xs font-medium ${renk}`}>{v}</span>
    </div>
  );
}
