import { useState } from "react";
import { Link } from "react-router-dom";
import { Kart } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { cihazListesi, musteriListesi } from "../api/servis";
import { saglikDurumu, durumRengi, DURUM_ADI, garantiDurumu } from "../veri/yardimci";

/*  Aküler ve inverterler için ortak liste — tip proplarıyla ayrışır.
 *
 *  Not: liste görünümü yalnızca cihaz kaydının kendi alanlarını
 *  (kapasite, güç) gösterir — anlık ölçüm (şarj yüzdesi, IGBT
 *  sıcaklığı) her cihaz için ayrı bir çağrı gerektirir ve yalnızca
 *  detay sayfasında istenir.                                        */
export default function CihazListesi({ tip }) {
  const [suzgec, setSuzgec] = useState("hepsi");
  const [ara, setAra] = useState("");
  const { veri: cihazlar, yukleniyor, hata, yenile } = useVeri(() => cihazListesi({ tip }), [tip]);
  const { veri: musteriler } = useVeri(musteriListesi);
  const musteriMap = Object.fromEntries((musteriler || []).map((m) => [m.id, m]));

  const hepsi = cihazlar || [];

  const suzgecler = [
    { id: "hepsi",   ad: "Tümü",     test: () => true },
    { id: "aktif",   ad: "Sahada",   test: (c) => ["aktif", "uyari", "arizali"].includes(c.durum) },
    { id: "sorun",   ad: "Sorunlu",  test: (c) => ["uyari", "arizali"].includes(c.durum) },
    { id: "depoda",  ad: "Depo/Sevk",test: (c) => ["depoda", "sevkte"].includes(c.durum) },
  ];

  const liste = hepsi
    .filter(suzgecler.find((s) => s.id === suzgec).test)
    .filter((c) => (c.id + c.model + c.parti).toLowerCase().includes(ara.toLowerCase()))
    .sort((a, b) => (a.saglik ?? 999) - (b.saglik ?? 999));

  const baslik = tip === "aku" ? "Aküler" : "İnverterler";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{baslik}</h1>
        <p className="mt-1 text-sm text-soluk">
          Üretilen tüm {tip === "aku" ? "aküler" : "inverterler"} — sahada, depoda ve sevkte olanlar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {suzgecler.map((s) => (
          <button key={s.id} onClick={() => setSuzgec(s.id)}
            className={`border px-3 py-1.5 text-xs font-medium transition-colors ${
              suzgec === s.id ? "border-metin bg-panel2 text-metin"
                              : "border-cizgi text-soluk hover:border-soluk hover:text-metin"}`}>
            {s.ad} · {hepsi.filter(s.test).length}
          </button>
        ))}
        <input value={ara} onChange={(e) => setAra(e.target.value)}
          placeholder="Seri no, model, parti…"
          className="ml-auto w-full max-w-[240px] border border-cizgi bg-panel px-3 py-1.5 text-xs
                     outline-none transition-colors placeholder:text-sonuk focus:border-soluk" />
      </div>

      {yukleniyor ? (
        <SatirIskelet satir={6} />
      ) : hata ? (
        <HataKutusu hata={hata} yenile={yenile} />
      ) : (
        <Kart cocuk={
          liste.length === 0 ? (
            <div className="px-5 py-12 text-center"><p className="text-sm text-soluk">Kayıt bulunamadı.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-cizgi text-xs font-medium text-sonuk">
                    <th className="px-4 py-2.5 text-left font-normal">Seri no</th>
                    <th className="px-4 py-2.5 text-left font-normal">Model</th>
                    <th className="px-4 py-2.5 text-left font-normal">Müşteri</th>
                    <th className="px-4 py-2.5 text-left font-normal">Durum</th>
                    <th className="px-4 py-2.5 text-right font-normal">
                      {tip === "aku" ? "Kapasite" : "Güç"}
                    </th>
                    <th className="px-4 py-2.5 text-left font-normal">Garanti</th>
                    <th className="px-4 py-2.5 text-left font-normal">Sağlık</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((c) => {
                    const m = musteriMap[c.musteriId];
                    const d = saglikDurumu(c.saglik);
                    const g = garantiDurumu(c);
                    const yol = tip === "aku" ? `/aku/${c.id}` : `/inverter/${c.id}`;
                    return (
                      <tr key={c.id} className="border-b border-cizgi transition-colors last:border-b-0 hover:bg-panel2">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {tip === "aku" && (
                              <img src="/gorseller/aku-kucuk.webp" alt="" width={28} height={28}
                                   className="shrink-0 border border-cizgi bg-white object-contain" />
                            )}
                            <div>
                              <Link to={yol} className="font-mono text-xs">{c.id}</Link>
                              <div className="text-xs text-sonuk">parti {c.parti}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-soluk">{c.model}</td>
                        <td className="px-4 py-3 text-xs">
                          {m ? <Link to={`/musteri/${m.id}`} className="hover:underline">{m.ad}</Link>
                             : <span className="text-sonuk">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum]} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-soluk">
                          {tip === "aku" ? `${c.kapasiteAh ?? "—"} Ah` : `${c.gucKw ?? "—"} kW`}
                        </td>
                        <td className={`px-4 py-3 text-xs ${g.gecerli ? "text-soluk" : "text-kritik"}`}>
                          {g.gecerli ? `${Math.round(g.kalanGun / 30)} ay` : "doldu"}
                        </td>
                        <td className="w-28 px-4 py-3">
                          {c.saglik == null ? <span className="text-xs text-sonuk">—</span> : (
                            <div className="flex items-center gap-2">
                              <span className="w-7 font-mono text-xs">{c.saglik}</span>
                              <SaglikCubugu deger={c.saglik} durum={d} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }/>
      )}
    </div>
  );
}
