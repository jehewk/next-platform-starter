import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import { MapPin, LocateFixed, Loader2 } from "lucide-react";

/**
 * Harita üzerinden konum seçici. Kullanıcı koordinat GÖRMEZ/girmez; evinin
 * üstüne dokunur ya da "Konumumu bul" ile GPS'ten iğne düşer. Dışarı yalnız
 * { lat, lng } verir; backend bunu müşteri kaydına yazar (saha haritası kullanır).
 *
 * Altlık OpenStreetMap (ücretsiz, anahtarsız). İşaret CircleMarker — leaflet'in
 * varsayılan ikon dosyası paketleyicide bozulabildiği için asset gerektirmez.
 */
const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TR_MERKEZ = [39.0, 35.0];

function Tiklama({ onChange }) {
  useMapEvents({
    click(e) {
      onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    },
  });
  return null;
}

function Merkezle({ konum }) {
  const harita = useMap();
  useEffect(() => {
    if (konum) harita.setView([konum.lat, konum.lng], Math.max(harita.getZoom(), 15));
  }, [konum, harita]);
  return null;
}

export default function KonumSecici({ value, onChange, yukseklik = "h-56" }) {
  const [hata, setHata] = useState("");
  const [araniyor, setAraniyor] = useState(false);
  const konum =
    value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
      ? { lat: Number(value.lat), lng: Number(value.lng) }
      : null;

  function konumumuBul() {
    if (!navigator.geolocation) {
      setHata("Tarayıcı konum paylaşımını desteklemiyor; haritadan dokunarak seçin.");
      return;
    }
    setAraniyor(true);
    setHata("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAraniyor(false);
        onChange({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
      },
      () => {
        setAraniyor(false);
        setHata("Konum alınamadı. İzin verin ya da haritada evinizin üstüne dokunun.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-soluk">
          <MapPin size={15} /> {konum ? "Konum seçildi" : "Haritada evinize dokunun"}
        </span>
        <button type="button" onClick={konumumuBul} disabled={araniyor}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-cizgi px-3 text-xs font-medium text-metin disabled:opacity-60">
          {araniyor ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
          {araniyor ? "Aranıyor…" : "Konumumu bul"}
        </button>
      </div>
      <div className={`overflow-hidden rounded-lg border border-cizgi ${yukseklik}`}>
        <MapContainer
          center={konum ? [konum.lat, konum.lng] : TR_MERKEZ}
          zoom={konum ? 15 : 5}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer url={OSM} attribution="&copy; OpenStreetMap katkıda bulunanlar" />
          <Tiklama onChange={onChange} />
          <Merkezle konum={konum} />
          {konum && (
            <CircleMarker
              center={[konum.lat, konum.lng]}
              radius={9}
              pathOptions={{ color: "#16a34a", fillColor: "#16a34a", fillOpacity: 0.75, weight: 2 }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-sonuk">
        {konum
          ? "Bu konum kaydedilecek; koordinatları görmenize gerek yok."
          : "İğneyi istediğiniz yere dokunarak taşıyabilirsiniz."}
      </p>
      {hata && <p className="text-xs text-uyari">{hata}</p>}
    </div>
  );
}
