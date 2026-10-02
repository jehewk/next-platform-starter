import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import { CloudRain, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useVeri } from "../api/useVeri";
import { musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu } from "../veri/yardimci";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { SayfaBasligi } from "../bilesenler/Kart";
import { useGrafikRenkleri } from "../bilesenler/Grafik";

/**
 * Saha haritası. Her müşteri adresi tek işaretle gösterilir; rengi o
 * adresteki en kötü cihazın durumunu taşır, büyüklüğü cihaz sayısını.
 */

// Altlık: Esri uydu görüntüsü + yer adı/yol/sınır katmanı (anahtar gerektirmez).
const UYDU = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ETIKET = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const YOLLAR = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";

// Canlı yağış radarı: RainViewer (anahtarsız; ücretsiz sürümde en fazla 7. yakınlık,
// daha yakında aynı görüntü büyütülür). Son kare 10 dakikada bir yenilenir.
const RADAR_LISTESI = "https://api.rainviewer.com/public/weather-maps.json";
const RADAR_YENILEME = 5 * 60 * 1000;

function useRadar(acik) {
  const [kare, setKare] = useState(null); // {url, zaman}
  useEffect(() => {
    if (!acik) return undefined;
    let iptal = false;
    async function getir() {
      try {
        const y = await (await fetch(RADAR_LISTESI)).json();
        const son = y?.radar?.past?.at(-1);
        if (!iptal && son && y.host) {
          setKare({ url: `${y.host}${son.path}/256/{z}/{x}/{y}/2/1_1.png`, zaman: new Date(son.time * 1000) });
        }
      } catch { /* radar alınamazsa harita radarsız çalışır */ }
    }
    getir();
    const t = setInterval(getir, RADAR_YENILEME);
    return () => { iptal = true; clearInterval(t); };
  }, [acik]);
  return kare;
}

const ONCELIK = { kritik: 3, uyari: 2, saglikli: 1, notr: 0 };

export default function Harita({ gomulu = false, yukseklik }) {
  const git = useNavigate();
  const RENK = useGrafikRenkleri();
  const [suzgec, setSuzgec] = useState("hepsi");
  const [radarAcik, setRadarAcik] = useState(() => {
    try { return localStorage.getItem("de_harita_radar") !== "0"; } catch { return true; }
  });
  const [kunye, setKunye] = useState(false);
  const radar = useRadar(radarAcik);
  const radarDegistir = () => setRadarAcik((a) => {
    try { localStorage.setItem("de_harita_radar", a ? "0" : "1"); } catch { /* gizli sekme */ }
    return !a;
  });
  const { veri: musteriler, yukleniyor: mY, hata: mH, yenile } = useVeri(musteriListesi);
  const { veri: cihazlar, yukleniyor: cY, hata: cH } = useVeri(cihazListesi);

  if (mY || cY) return gomulu ? <div className="h-full animate-pulse bg-panel2/50" /> : <Iskelet yukseklik="h-[60vh]" />;
  if (mH || cH) return <HataKutusu hata={mH || cH} yenile={yenile} />;

  // Müşteri başına tek nokta; durum en kötü cihazdan gelir.
  const noktalar = (musteriler || []).map((m) => {
    const cihazlar_ = (cihazlar || []).filter((c) => c.musteriId === m.id);
    const akuler = cihazlar_.filter((c) => c.tip === "aku");
    const invler = cihazlar_.filter((c) => c.tip === "inverter");

    let enKotu = "notr";
    cihazlar_.forEach((c) => {
      const d = saglikDurumu(c.saglik);
      if (ONCELIK[d] > ONCELIK[enKotu]) enKotu = d;
    });

    const sorunlu = cihazlar_.filter((c) =>
      ["arizali", "uyari"].includes(c.durum) ||
      ["kritik", "uyari"].includes(saglikDurumu(c.saglik))
    );

    return { musteri: m, cihazlar: cihazlar_, akuler, invler, durum: enKotu, sorunlu };
  }).filter((n) => n.cihazlar.length > 0);

  // Konum isteğe bağlı saklanıyor. Koordinatsız bir müşteriyi haritaya
  // koymaya çalışmak Leaflet'i çökertir ("Invalid LatLng") — bu yüzden
  // ayrılır ve sayısı kullanıcıya açıkça söylenir.
  const konumsuz = noktalar.filter((n) => !Number.isFinite(Number(n.musteri.lat)) ||
                                          !Number.isFinite(Number(n.musteri.lng)) ||
                                          n.musteri.lat == null || n.musteri.lng == null);
  const konumlu = noktalar.filter((n) => !konumsuz.includes(n));

  const gorunur = konumlu.filter((n) =>
    suzgec === "hepsi" ? true :
    suzgec === "aku" ? n.akuler.length > 0 :
    suzgec === "inverter" ? n.invler.length > 0 :
    n.sorunlu.length > 0
  );

  const sayim = {
    aku: noktalar.reduce((t, n) => t + n.akuler.length, 0),
    inv: noktalar.reduce((t, n) => t + n.invler.length, 0),
    sorun: noktalar.filter((n) => n.sorunlu.length > 0).length,
  };

  return (
    <div className={gomulu ? "h-full" : "space-y-4"}>
      {!gomulu && (
        <SayfaBasligi baslik="Saha haritası"
          aciklama="Her nokta bir müşteri adresidir; renk o adresteki en kötü cihaz durumunu gösterir." />
      )}

      {!gomulu && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: "hepsi",    ad: "Tümü",        n: noktalar.length },
            { id: "aku",      ad: "Akü olan",    n: sayim.aku },
            { id: "inverter", ad: "İnverter olan", n: sayim.inv },
            { id: "sorun",    ad: "Sorunlu",     n: sayim.sorun },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSuzgec(s.id)}
              className={suzgec === s.id ? "cip-aktif" : "cip-pasif"}
            >
              {s.ad} <span className="tabular-nums text-sonuk">{s.n}</span>
            </button>
          ))}
        </div>
      )}

      <div
        // Telefonda alt menü (~5.5rem) haritanın altını örtmesin
        className={`relative ${gomulu ? "h-full" : `overflow-hidden rounded-lg border border-cizgi bg-panel
          ${yukseklik ? "" : "h-[calc(100dvh-330px-env(safe-area-inset-bottom))] min-h-[360px] lg:h-[calc(100vh-250px)] lg:min-h-[380px]"}`}`}
        style={gomulu || !yukseklik ? undefined : { height: yukseklik, minHeight: 380 }}
      >
        <MapContainer
          center={[36.98, 35.55]}
          zoom={8}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          attributionControl={false}
          maxZoom={18}
        >
          <TileLayer url={UYDU} maxZoom={18} maxNativeZoom={18} />
          <TileLayer url={YOLLAR} maxZoom={18} opacity={0.75} />
          <TileLayer url={ETIKET} maxZoom={18} />
          {radarAcik && radar && (
            <TileLayer key={radar.url} url={radar.url} opacity={0.6} maxNativeZoom={7} maxZoom={18} zIndex={5} />
          )}

          {gorunur.map((n) => {
            const renk = RENK[n.durum];
            // Cihaz sayisi arttikca isaret buyur — yogunluk gorunur olur
            const yaricap = 7 + Math.min(4, n.cihazlar.length - 1);
            return (
              <CircleMarker
                key={n.musteri.id}
                center={[Number(n.musteri.lat), Number(n.musteri.lng)]}
                radius={yaricap}
                pathOptions={{
                  color: renk,
                  fillColor: renk,
                  fillOpacity: n.sorunlu.length ? 0.85 : 0.6,
                  weight: 2.5,
                }}
                eventHandlers={{ click: () => git(`/musteri/${n.musteri.id}`) }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <span className="text-xs font-medium">{n.musteri.ad}</span>
                </Tooltip>
                <Popup>
                  <div className="min-w-[210px]">
                    <div className="mb-1 text-sm font-semibold text-metin">
                      {n.musteri.ad}
                    </div>
                    <div className="mb-2.5 text-xs text-sonuk">
                      {n.musteri.ilce}, {n.musteri.il} · {n.musteri.tip}
                    </div>

                    <div className="divide-y divide-cizgi border-y border-cizgi">
                      {n.cihazlar.map((c) => {
                        const d = saglikDurumu(c.saglik);
                        return (
                          <button
                            key={c.id}
                            onClick={() =>
                              git(c.tip === "aku" ? `/aku/${c.id}` : `/inverter/${c.id}`)
                            }
                            className="flex w-full items-center justify-between gap-3 px-1 py-1.5
                                       text-left transition-colors hover:bg-panel2"
                          >
                            <span className="font-mono text-xs text-metin">{c.id}</span>
                            <span className="text-xs" style={{ color: RENK[d] }}>
                              {c.saglik != null ? c.saglik : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {n.sorunlu.length > 0 && (
                      <div className="mt-2 text-xs" style={{ color: RENK[n.durum] }}>
                        {n.sorunlu.length} cihaz müdahale bekliyor
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Harita üstü denetimler: radar aç/kapat + kaynak künyesi (lisans gereği; küçük ve kapalı) */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[400] flex items-end justify-between gap-2">
          <button onClick={radarDegistir} aria-pressed={radarAcik}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs ring-1 backdrop-blur
              ${radarAcik ? "bg-black/60 text-white ring-white/25" : "bg-black/40 text-white/70 ring-white/15"}`}>
            <CloudRain size={13} />
            {radarAcik ? `Yağış radarı${radar ? ` · ${radar.zaman.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "Radar kapalı"}
          </button>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {kunye && (
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                Görüntü © Esri, Maxar, Earthstar Geographics · Radar © RainViewer
              </span>
            )}
            <button onClick={() => setKunye((k) => !k)} aria-label="Harita kaynakları"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white">
              <Info size={13} />
            </button>
          </div>
        </div>
      </div>

      {!gomulu && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-sonuk">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: RENK.saglikli, background: `${RENK.saglikli}45` }} />
          sorun yok
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: RENK.uyari, background: `${RENK.uyari}8c` }} />
          izlemede
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: RENK.kritik, background: `${RENK.kritik}8c` }} />
          müdahale gerekli
        </span>
        <span className="text-sonuk">· işaret büyüklüğü cihaz sayısını gösterir</span>
        {konumsuz.length > 0 && (
          <span className="text-uyari">· {konumsuz.length} müşterinin konumu kayıtlı değil, haritada gösterilmiyor</span>
        )}
      </div>}
    </div>
  );
}
