import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Kart, SayfaBasligi, Bos } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu, tarihTR } from "../veri/yardimci";

export default function Musteriler() {
  const git = useNavigate();
  const [ara, setAra] = useState("");
  const [tip, setTip] = useState("hepsi");
  const { veri: musteriler, yukleniyor, hata, yenile } = useVeri(musteriListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);

  const tipler = ["hepsi", ...new Set((musteriler || []).map((m) => m.tip).filter(Boolean))];
  const q = ara.toLocaleLowerCase("tr");
  const liste = (musteriler || [])
    .filter((m) => tip === "hepsi" || m.tip === tip)
    .filter((m) => [m.ad, m.il, m.ilce, m.id].join(" ").toLocaleLowerCase("tr").includes(q));

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik="Müşteriler"
        aciklama={musteriler ? `${musteriler.length} kurulu sistem. Her müşterinin akü ve inverterleri ayrı izlenir.` : "Kurulu sistemler."} />

      <div className="flex flex-wrap items-center gap-2">
        {tipler.map((t) => (
          <button key={t} onClick={() => setTip(t)} className={tip === t ? "cip-aktif" : "cip-pasif"}>
            {t === "hepsi" ? "Tümü" : t}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sonuk" />
          <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ad, il veya kayıt no…" className="girdi pl-8" />
        </div>
      </div>

      {yukleniyor ? <SatirIskelet satir={6} /> : hata ? <HataKutusu hata={hata} yenile={yenile} /> : (
        <Kart>
          {liste.length === 0 ? <Bos metin="Aramanızla eşleşen müşteri yok." /> : (
            <div className="overflow-x-auto">
              <table className="tablo w-full min-w-[760px] text-sm">
                <thead>
                  <tr>
                    <th>Müşteri</th><th>Konum</th><th>Kurulum</th>
                    <th className="!text-right">Akü</th><th className="!text-right">İnverter</th>
                    <th>Durum</th><th>Sağlık</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((m) => {
                    const c = (cihazlar || []).filter((x) => x.musteriId === m.id);
                    const sorunlu = c.filter((x) => ["arizali", "uyari"].includes(x.durum)).length;
                    const olculen = c.filter((x) => x.saglik != null);
                    const ort = olculen.length ? Math.round(olculen.reduce((t, x) => t + x.saglik, 0) / olculen.length) : null;
                    const d = saglikDurumu(ort);
                    return (
                      <tr key={m.id} onClick={() => git(`/musteri/${m.id}`)} className="cursor-pointer">
                        <td>
                          <Link to={`/musteri/${m.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{m.ad}</Link>
                          <div className="text-xs text-sonuk">{m.id} · {m.tip}</div>
                        </td>
                        <td className="text-soluk">{m.ilce}, {m.il}</td>
                        <td className="tabular-nums text-soluk">{tarihTR(m.kurulum)}</td>
                        <td className="text-right tabular-nums">{c.filter((x) => x.tip === "aku").length}</td>
                        <td className="text-right tabular-nums">{c.filter((x) => x.tip === "inverter").length}</td>
                        <td><Rozet durum={!sorunlu ? "saglikli" : d === "saglikli" ? "uyari" : d} cocuk={sorunlu ? `${sorunlu} sorun` : "Normal"} /></td>
                        <td className="w-36">
                          {ort != null ? (
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 tabular-nums">{ort}</span>
                              <SaglikCubugu deger={ort} durum={d} ince />
                            </div>
                          ) : <span className="text-sonuk">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Kart>
      )}
    </div>
  );
}
