import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Kart, SayfaBasligi, Bos } from "../bilesenler/Kart";
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
  const git = useNavigate();
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
    .filter((c) => [c.id, c.model, c.parti, musteriMap[c.musteriId]?.ad].join(" ")
      .toLocaleLowerCase("tr").includes(ara.toLocaleLowerCase("tr")))
    .sort((a, b) => (a.saglik ?? 999) - (b.saglik ?? 999));

  const baslik = tip === "aku" ? "Aküler" : "İnverterler";

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik={baslik}
        aciklama={`Üretilen tüm ${tip === "aku" ? "aküler" : "inverterler"} — sahada, depoda ve sevkte olanlar.`} />

      <div className="flex flex-wrap items-center gap-2">
        {suzgecler.map((s) => (
          <button key={s.id} onClick={() => setSuzgec(s.id)}
            className={suzgec === s.id ? "cip-aktif" : "cip-pasif"}>
            {s.ad} <span className="tabular-nums text-sonuk">{hepsi.filter(s.test).length}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sonuk" />
          <input value={ara} onChange={(e) => setAra(e.target.value)}
            placeholder="Seri no, model, parti, müşteri…" className="girdi pl-8" />
        </div>
      </div>

      {yukleniyor ? (
        <SatirIskelet satir={6} />
      ) : hata ? (
        <HataKutusu hata={hata} yenile={yenile} />
      ) : (
        <Kart cocuk={
          liste.length === 0 ? (
            <Bos metin="Kayıt bulunamadı." alt="Filtreyi veya aramayı değiştirin." />
          ) : (
            <div className="overflow-x-auto">
              <table className="tablo w-full min-w-[760px] text-sm">
                <thead>
                  <tr>
                    <th>Seri no</th>
                    <th>Model</th>
                    <th>Müşteri</th>
                    <th>Durum</th>
                    <th className="!text-right">
                      {tip === "aku" ? "Kapasite" : "Güç"}
                    </th>
                    <th>Garanti</th>
                    <th>Sağlık</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((c) => {
                    const m = musteriMap[c.musteriId];
                    const d = saglikDurumu(c.saglik);
                    const g = garantiDurumu(c);
                    const yol = tip === "aku" ? `/aku/${c.id}` : `/inverter/${c.id}`;
                    return (
                      <tr key={c.id} onClick={() => git(yol)} className="cursor-pointer">
                        <td className="px-4 py-3">
                          <div>
                            <div>
                              <Link to={yol} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:underline">{c.id}</Link>
                              <div className="text-xs text-sonuk">parti {c.parti}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-soluk">{c.model}</td>
                        <td className="px-4 py-3 text-xs">
                          {m ? <Link to={`/musteri/${m.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{m.ad}</Link>
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
                              <span className="w-7 text-xs tabular-nums">{c.saglik}</span>
                              <SaglikCubugu deger={c.saglik} durum={d} ince />
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
