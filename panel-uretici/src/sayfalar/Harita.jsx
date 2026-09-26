import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { useVeri } from "../api/useVeri";
import { musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu } from "../veri/yardimci";
import { Iskelet, HataKutusu } from "../bilesenler/VeriDurumu";

/**
 * Saha haritası.
 *
 * Her müşteri TEK işaretle gösterilir. Önceki sürümde akü ve inverter
 * ayrı noktalara kaydırılıyordu; oysa ikisi aynı adreste duruyor.
 * Yapay kaydırma haritayı kalabalıklaştırıyor ve yanlış konum
 * izlenimi veriyordu.
 *
 * İşaretin rengi o adresteki EN KÖTÜ cihazın durumunu taşır — saha
 * ekibi haritaya bakıp nereye gitmesi gerektiğini görür. Hangi
 * cihazın sorunlu olduğu açılır pencerede listelenir.
 */

const RENK = {
  saglikli: "#15803D",
  uyari:    "#B45309",
  kritik:   "#B91C1C",
  notr:     "#94A3B8",
};

const ONCELIK = { kritik: 3, uyari: 2, saglikli: 1, notr: 0 };

export default function Harita({ gomulu = false, yukseklik }) {
  const git = useNavigate();
  const [suzgec, setSuzgec] = useState("hepsi");
  const { veri: musteriler, yukleniyor: mY, hata: mH, yenile } = useVeri(musteriListesi);
  const { veri: cihazlar, yukleniyor: cY, hata: cH } = useVeri(cihazListesi);

  if (mY || cY) return <Iskelet yukseklik={yukseklik} />;
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
    <div className={gomulu ? "" : "space-y-4"}>
      {!gomulu && (
        <div>
          <h1 className="text-lg font-semibold">Saha Haritası</h1>
          <p className="mt-1 text-sm text-soluk">
            Kurulu sistemler. Her nokta bir müşteri adresini gösterir; renk o
            adresteki en kötü cihaz durumunu taşır.
          </p>
        </div>
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
              className={`border px-3 py-1.5 text-xs transition-colors ${
                suzgec === s.id
                  ? "border-metin bg-panel2 text-metin"
                  : "border-cizgi text-soluk hover:border-soluk hover:text-metin"
              }`}
            >
              {s.ad} <span className="ml-1 font-mono text-sonuk">{s.n}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="overflow-hidden border border-cizgi bg-panel"
        style={{ height: yukseklik || "calc(100vh - 230px)", minHeight: 380 }}
      >
        <MapContainer
          center={[36.98, 35.55]}
          zoom={8}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          {/*  Altlık: Esri "World Light Gray" — CARTO'ya göre yol/ilçe
              ayrımı daha okunaklı ve Türkiye'de detayı daha iyi. Anahtar
              gerektirmez. Etiketler ayrı bir katman olarak üste bindirilir;
              böylece işaretler yazıların altında kaybolmaz.  */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; Esri, HERE, Garmin, &copy; OpenStreetMap katkıcıları"
            maxZoom={16}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
          />

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
                  fillOpacity: n.sorunlu.length ? 0.55 : 0.28,
                  weight: 2,
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
                            className="flex w-full items-center justify-between gap-3 py-1.5
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
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-sonuk">
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
      </div>
    </div>
  );
}
