import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, BatteryCharging, Cpu, MapPin, Phone, Mail, Calendar, ExternalLink, Pencil } from "lucide-react";
import { Kart, Olcum, OlcumSeridi, SayfaBasligi, Bos } from "../bilesenler/Kart";
import MusteriDuzenle from "../bilesenler/MusteriDuzenle";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriBul, cihazListesi } from "../api/servis";
import { saglikDurumu, garantiDurumu, tarihTR, DURUM_YAZI } from "../veri/yardimci";

const MUSTERI_APP = import.meta.env.VITE_MUSTERI_APP_URL;

export default function MusteriDetay() {
  const { id } = useParams();
  const [duzenle, setDuzenle] = useState(false);
  const { veri: m, yukleniyor: mYukleniyor, hata: mHata, yenile } = useVeri(() => musteriBul(id), [id]);
  const { veri: hepsi, yukleniyor: cYukleniyor, hata: cHata } =
    useVeri(() => cihazListesi({ musteri_id: id }), [id]);

  if (mYukleniyor) return <Iskelet satir={2} yukseklik="h-20" />;
  if (mHata) return <HataKutusu hata={mHata} />;
  if (!m) return <Bulunamadi />;

  const cihazlar = hepsi || [];
  const akuler = cihazlar.filter((c) => c.tip === "aku");
  const invler = cihazlar.filter((c) => c.tip === "inverter");
  const olculen = cihazlar.filter((c) => c.saglik != null);
  // Sistem durumu en kötü cihazdan gelir (DEVIR §8, hata 8).
  const ort = olculen.length ? Math.min(...olculen.map((c) => c.saglik)) : null;
  const d = saglikDurumu(ort);
  const uretim = invler.reduce((t, c) => t + (c.gunlukKwh || 0), 0);

  const sorunlu = cihazlar.filter((c) => ["arizali", "uyari"].includes(c.durum)).length;

  return (
    <div className="space-y-5">
      <SayfaBasligi
        ust={
          <Link to="/musteriler" className="mb-2 inline-flex items-center gap-1 text-xs text-sonuk hover:text-metin">
            <ChevronLeft size={13} /> Müşteriler
          </Link>
        }
        baslik={<span className="flex items-center gap-3">{m.ad}
          <Rozet durum={!sorunlu ? "saglikli" : d === "saglikli" ? "uyari" : d} cocuk={sorunlu ? `${sorunlu} sorun` : "Normal"} /></span>}
        eylem={<>
          {MUSTERI_APP && (
            <a href={`${MUSTERI_APP}/${m.id}`} target="_blank" rel="noreferrer" className="dugme-ikincil">
              <ExternalLink size={14} /> Müşteri görünümü
            </a>
          )}
          <button onClick={() => setDuzenle(true)} className="dugme-ana"><Pencil size={14} /> Düzenle</button>
        </>}
      />

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-soluk">
        <span className="flex items-center gap-1.5"><MapPin size={12} /> {m.adres}, {m.ilce}/{m.il}</span>
        {m.telefon && <span className="flex items-center gap-1.5"><Phone size={12} /> {m.telefon}</span>}
        {m.email && <span className="flex items-center gap-1.5"><Mail size={12} /> {m.email}</span>}
        <span className="flex items-center gap-1.5"><Calendar size={12} /> Kurulum {tarihTR(m.kurulum)}</span>
      </div>

      <OlcumSeridi>
        <Olcum etiket="En düşük sağlık" deger={ort ?? "—"} vurgu={DURUM_YAZI[d]} />
        <Olcum etiket="Akü" deger={akuler.length} />
        <Olcum etiket="İnverter" deger={invler.length} />
        <Olcum etiket="Günlük üretim" deger={uretim.toFixed(1)} birim="kWh" />
      </OlcumSeridi>

      <MusteriDuzenle acik={duzenle} kapat={() => setDuzenle(false)} musteri={m} kaydedildi={yenile} />

      {cYukleniyor ? <SatirIskelet satir={2} /> : cHata ? <HataKutusu hata={cHata} /> : (
        <>
          <Kart
            baslik="Aküler"
            ustBilgi={<span className="text-xs text-soluk">{akuler.length} adet</span>}
            cocuk={
              akuler.length === 0
                ? <Bos metin="Bu müşteride kayıtlı akü yok." />
                : <div className="grid gap-px bg-cizgi md:grid-cols-2">
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
                : <div className="grid gap-px bg-cizgi md:grid-cols-2">
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
  const yazi = DURUM_YAZI[d];
  const g = garantiDurumu(c);
  const Ikon = c.tip === "aku" ? BatteryCharging : Cpu;

  return (
    <Link to={yol} className="block bg-panel p-4 transition-colors hover:bg-panel2/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-panel2 ring-1 ring-cizgi">
            <Ikon size={15} strokeWidth={1.75} className="text-soluk" />
          </span>
          <div>
            <div className="font-mono text-sm">{c.id}</div>
            <div className="text-xs text-sonuk">{c.model} · parti {c.parti}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-semibold leading-none tabular-nums ${yazi}`}>{c.saglik ?? "—"}</div>
          <div className="mt-0.5 text-xs text-sonuk">sağlık</div>
        </div>
      </div>

      {c.saglik != null && <div className="mt-3"><SaglikCubugu deger={c.saglik} durum={d} ince /></div>}

      <div className="mt-3 flex items-center justify-between border-t border-cizgi pt-2.5 text-xs">
        <span className="text-sonuk">garanti</span>
        <span className={g.gecerli ? "text-soluk" : "text-kritik"}>
          {g.gecerli ? `${Math.round(g.kalanGun / 30)} ay kaldı` : "süresi doldu"}
        </span>
      </div>
    </Link>
  );
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
