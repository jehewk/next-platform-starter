import { useState } from "react";
import { Link } from "react-router-dom";
import { Kart } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu, tarihTR } from "../veri/yardimci";

export default function Musteriler() {
  const [ara, setAra] = useState("");
  const { veri: musteriler, yukleniyor, hata, yenile } = useVeri(musteriListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);

  const liste = (musteriler || []).filter((m) =>
    (m.ad + m.il + m.ilce + m.id).toLowerCase().includes(ara.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Müşteriler</h1>
        <p className="mt-1 text-sm text-soluk">
          {musteriler ? `${musteriler.length} kurulu sistem. ` : ""}
          Her müşterinin akü ve inverterleri ayrı izlenir.
        </p>
      </div>

      <input
        value={ara} onChange={(e) => setAra(e.target.value)}
        placeholder="Müşteri, il veya kayıt no ara…"
        className="w-full max-w-sm border border-cizgi bg-panel px-3 py-2 text-sm outline-none
                   transition-colors placeholder:text-sonuk focus:border-soluk"
      />

      {yukleniyor ? (
        <SatirIskelet satir={6} />
      ) : hata ? (
        <HataKutusu hata={hata} yenile={yenile} />
      ) : (
        <Kart cocuk={
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-cizgi text-xs font-medium text-sonuk">
                  <th className="px-4 py-2.5 text-left font-normal">Müşteri</th>
                  <th className="px-4 py-2.5 text-left font-normal">Konum</th>
                  <th className="px-4 py-2.5 text-left font-normal">Kurulum</th>
                  <th className="px-4 py-2.5 text-center font-normal">Akü</th>
                  <th className="px-4 py-2.5 text-center font-normal">İnverter</th>
                  <th className="px-4 py-2.5 text-left font-normal">Durum</th>
                  <th className="px-4 py-2.5 text-left font-normal">Sağlık</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((m) => {
                  const c = (cihazlar || []).filter((x) => x.musteriId === m.id);
                  const sorunlu = c.filter((x) => ["arizali", "uyari"].includes(x.durum)).length;
                  const ort = c.length
                    ? Math.round(c.reduce((t, x) => t + (x.saglik || 0), 0) / c.length) : null;
                  const d = saglikDurumu(ort);
                  return (
                    <tr key={m.id} className="border-b border-cizgi transition-colors last:border-b-0 hover:bg-panel2">
                      <td className="px-4 py-3">
                        <Link to={`/musteri/${m.id}`} className="block">
                          <div className="font-medium">{m.ad}</div>
                          <div className="text-xs text-sonuk">{m.id} · {m.tip}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-soluk">{m.ilce}, {m.il}</td>
                      <td className="px-4 py-3 font-mono text-xs text-soluk">{tarihTR(m.kurulum)}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {c.filter((x) => x.tip === "aku").length}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {c.filter((x) => x.tip === "inverter").length}
                      </td>
                      <td className="px-4 py-3">
                        <Rozet durum={d} cocuk={sorunlu ? `${sorunlu} SORUN` : "NORMAL"} />
                      </td>
                      <td className="w-32 px-4 py-3">
                        {ort != null ? (
                          <div className="flex items-center gap-2">
                            <span className="w-7 font-mono text-xs">{ort}</span>
                            <SaglikCubugu deger={ort} durum={d} />
                          </div>
                        ) : <span className="text-xs text-sonuk">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }/>
      )}
    </div>
  );
}
