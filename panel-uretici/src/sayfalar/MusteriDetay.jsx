import { useParams, Link } from "react-router-dom";
import { ChevronLeft, BatteryCharging, Cpu, MapPin, Phone, Calendar, ExternalLink } from "lucide-react";
import { Kart, Olcum } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriBul, cihazListesi } from "../api/servis";
import { saglikDurumu, DURUM_ADI, garantiDurumu, tarihTR } from "../veri/yardimci";

export default function MusteriDetay() {
  const { id } = useParams();
  const { veri: m, yukleniyor: mYukleniyor, hata: mHata } = useVeri(() => musteriBul(id), [id]);
  const { veri: hepsi, yukleniyor: cYukleniyor, hata: cHata } =
    useVeri(() => cihazListesi({ musteri_id: id }), [id]);

  if (mYukleniyor) return <Iskelet satir={2} yukseklik="h-20" />;
  if (mHata) return <HataKutusu hata={mHata} />;
  if (!m) return <Bulunamadi />;

  const cihazlar = hepsi || [];
  const akuler = cihazlar.filter((c) => c.tip === "aku");
  const invler = cihazlar.filter((c) => c.tip === "inverter");
  const ort = cihazlar.length
    ? Math.round(cihazlar.reduce((t, c) => t + (c.saglik || 0), 0) / cihazlar.length) : null;
  const d = saglikDurumu(ort);
  const uretim = invler.reduce((t, c) => t + (c.gunlukKwh || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/musteriler" className="mb-3 inline-flex items-center gap-1 text-xs text-sonuk hover:text-metin">
          <ChevronLeft size={13} /> müşteriler
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{m.ad}</h1>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sonuk">
              <span className="flex items-center gap-1.5"><MapPin size={11} /> {m.adres}, {m.ilce}/{m.il}</span>
              <span className="flex items-center gap-1.5"><Phone size={11} /> {m.telefon}</span>
              <span className="flex items-center gap-1.5"><Calendar size={11} /> kurulum {tarihTR(m.kurulum)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Rozet durum={d} cocuk={DURUM_ADI[cihazlar.find((c) => c.durum === "arizali") ? "arizali" : "aktif"]} />
            <a
              href={`${import.meta.env.VITE_MUSTERI_APP_URL}/${m.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 border border-cizgi px-3 py-1.5
                         text-xs text-soluk transition-colors hover:border-metin/20 hover:text-metin"
            >
              <ExternalLink size={12} strokeWidth={1.75} />
              Müşteri görünümü
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border border-cizgi bg-panel md:grid-cols-4">
        <Olcum etiket="Sistem sağlığı" deger={ort ?? "—"}
          vurgu={{ saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik" }[d]} />
        <Olcum etiket="Akü" deger={akuler.length} />
        <Olcum etiket="İnverter" deger={invler.length} />
        <Olcum etiket="Günlük üretim" deger={uretim.toFixed(1)} birim="kWh" />
      </div>

      {cYukleniyor ? <SatirIskelet satir={2} /> : cHata ? <HataKutusu hata={cHata} /> : (
        <>
          <Kart
            baslik="Aküler"
            ustBilgi={<span className="text-xs text-soluk">{akuler.length} adet</span>}
            cocuk={
              akuler.length === 0
                ? <Bos metin="Bu müşteride kayıtlı akü yok." />
                : <div className="divide-y divide-cizgi">
                    {akuler.map((a) => <CihazKarti key={a.id} c={a} yol={`/aku/${a.id}`} />)}
                  </div>
            }
          />
          <Kart
            baslik="İnverterler"
            ustBilgi={<span className="text-xs text-soluk">{invler.length} adet</span>}
            cocuk={
              invler.length === 0
                ? <Bos metin="Bu müşteride kayıtlı inverter yok." />
                : <div className="divide-y divide-cizgi">
                    {invler.map((v) => <CihazKarti key={v.id} c={v} yol={`/inverter/${v.id}`} />)}
                  </div>
            }
          />
        </>
      )}
    </div>
  );
}

/**
 * Liste görünümünde yalnızca temel bilgiler gösterilir (id, sağlık,
 * garanti). Hücre-hücre gerilim, sıcaklık, IGBT gibi ayrıntılı ölçüm
 * yalnızca cihaz detay sayfasında istenir — her kartın kendi ölçüm
 * geçmişini çekmesi (N cihaz için N çağrı) gereksiz yük getirirdi.
 */
export function CihazKarti({ c, yol }) {
  const d = saglikDurumu(c.saglik);
  const yazi = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik", notr: "text-sonuk" }[d];
  const g = garantiDurumu(c);
  const Ikon = c.tip === "aku" ? BatteryCharging : Cpu;

  return (
    <Link to={yol} className="block bg-panel p-4 transition-colors hover:bg-panel2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {c.tip === "aku" ? (
            <img src="/gorseller/aku-kucuk.webp" alt="" width={20} height={20}
                 className="mt-0.5 shrink-0 border border-cizgi bg-white object-contain" />
          ) : (
            <Ikon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sonuk" />
          )}
          <div>
            <div className="font-mono text-sm">{c.id}</div>
            <div className="text-xs text-sonuk">{c.model} · parti {c.parti}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-xl leading-none ${yazi}`}>{c.saglik ?? "—"}</div>
          <div className="mt-0.5 text-xs text-sonuk">sağlık</div>
        </div>
      </div>

      {c.saglik != null && <div className="mt-3"><SaglikCubugu deger={c.saglik} durum={d} /></div>}

      <div className="mt-3 flex items-center justify-between border-t border-cizgi pt-2.5 text-xs">
        <span className="text-sonuk">garanti</span>
        <span className={g.gecerli ? "text-soluk" : "text-kritik"}>
          {g.gecerli ? `${Math.round(g.kalanGun / 30)} ay kaldı` : "süresi doldu"}
        </span>
      </div>
    </Link>
  );
}

function Bos({ metin }) {
  return <div className="px-5 py-10 text-center"><p className="text-sm text-soluk">{metin}</p></div>;
}

function Bulunamadi() {
  return (
    <Kart cocuk={
      <div className="px-5 py-14 text-center">
        <p className="text-sm">Kayıt bulunamadı.</p>
        <Link to="/musteriler" className="mt-3 inline-block text-xs text-soluk hover:text-metin">
          ← müşteri listesine dön
        </Link>
      </div>
    }/>
  );
}
