import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, ChevronRight } from "lucide-react";
import { Kart, SayfaBasligi, Bos } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useSiralama, SiraBaslik, csvIndir, CsvDugmesi } from "../bilesenler/Tablo";
import MusteriDuzenle from "../bilesenler/MusteriDuzenle";
import { useVeri } from "../api/useVeri";
import { musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu, tarihTR, DURUM_YAZI } from "../veri/yardimci";

// Müşterinin genel durumu EN KÖTÜ cihazından gelir (DEVIR §8, hata 8):
// kritik akü + sağlıklı inverter ortalamada "izleniyor" görünmemeli.
function ozetle(m, cihazlar) {
  const c = cihazlar.filter((x) => x.musteriId === m.id);
  const olculen = c.filter((x) => x.saglik != null);
  const enKotu = olculen.length ? Math.min(...olculen.map((x) => x.saglik)) : null;
  return {
    ...m,
    aku: c.filter((x) => x.tip === "aku").length,
    inverter: c.filter((x) => x.tip === "inverter").length,
    sorunlu: c.filter((x) => ["arizali", "uyari"].includes(x.durum)).length,
    saglik: enKotu,
  };
}

const SIRA = {
  ad: (m) => m.ad, konum: (m) => `${m.il} ${m.ilce}`, kurulum: (m) => m.kurulum,
  aku: (m) => m.aku, inverter: (m) => m.inverter, saglik: (m) => m.saglik,
};

export default function Musteriler() {
  const git = useNavigate();
  const [ara, setAra] = useState("");
  const [tip, setTip] = useState("hepsi");
  const [yeniAcik, setYeniAcik] = useState(false);
  const { veri: musteriler, yukleniyor, hata, yenile } = useVeri(musteriListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);

  const tipler = ["hepsi", ...new Set((musteriler || []).map((m) => m.tip).filter(Boolean))];
  const q = ara.toLocaleLowerCase("tr");
  const liste = useMemo(() => (musteriler || [])
    .filter((m) => tip === "hepsi" || m.tip === tip)
    .filter((m) => [m.ad, m.il, m.ilce, m.id].join(" ").toLocaleLowerCase("tr").includes(q))
    .map((m) => ozetle(m, cihazlar || [])), [musteriler, cihazlar, tip, q]);
  const { sirali, sira, sirala } = useSiralama(liste, SIRA, { anahtar: "saglik", yon: 1 });

  function disaAktar() {
    csvIndir("musteriler", sirali, [
      { ad: "Kayıt no", deger: (m) => m.id }, { ad: "Ad", deger: (m) => m.ad },
      { ad: "Tip", deger: (m) => m.tip }, { ad: "İl", deger: (m) => m.il }, { ad: "İlçe", deger: (m) => m.ilce },
      { ad: "Telefon", deger: (m) => m.telefon }, { ad: "E-posta", deger: (m) => m.email },
      { ad: "Kurulum", deger: (m) => tarihTR(m.kurulum) },
      { ad: "Akü", deger: (m) => m.aku }, { ad: "İnverter", deger: (m) => m.inverter },
      { ad: "En düşük sağlık", deger: (m) => m.saglik ?? "" },
    ]);
  }

  const durumRozeti = (m) => {
    const d = saglikDurumu(m.saglik);
    return <Rozet durum={!m.sorunlu ? "saglikli" : d === "saglikli" ? "uyari" : d}
                  cocuk={m.sorunlu ? `${m.sorunlu} sorun` : "Normal"} />;
  };

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik="Müşteriler"
        aciklama={musteriler ? `${musteriler.length} kurulu sistem. Durum, en kötü cihazın sağlığına göre gösterilir.` : "Kurulu sistemler."}
        eylem={<>
          <CsvDugmesi onClick={disaAktar} />
          <button onClick={() => setYeniAcik(true)} className="dugme-ana"><Plus size={15} /> Yeni müşteri</button>
        </>} />

      <div className="flex flex-wrap items-center gap-2">
        {tipler.map((t) => (
          <button key={t} onClick={() => setTip(t)} className={tip === t ? "cip-aktif" : "cip-pasif"}>
            {t === "hepsi" ? "Tümü" : t}
          </button>
        ))}
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sonuk" />
          <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ad, il veya kayıt no…" className="girdi pl-8" />
        </div>
      </div>

      {yukleniyor ? <SatirIskelet satir={6} /> : hata ? <HataKutusu hata={hata} yenile={yenile} /> : (
        <Kart>
          {sirali.length === 0 ? <Bos metin={musteriler.length ? "Aramanızla eşleşen müşteri yok." : "Henüz müşteri yok."} /> : (
            <>
              {/* Telefon: kart listesi */}
              <ul className="divide-y divide-cizgi md:hidden">
                {sirali.map((m) => (
                  <li key={m.id}>
                    <Link to={`/musteri/${m.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-panel2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{m.ad}</span>
                          {durumRozeti(m)}
                        </div>
                        <div className="mt-1 text-xs text-sonuk">{m.ilce}, {m.il} · {m.aku} akü · {m.inverter} inverter</div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-sonuk" />
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Masaüstü: tablo */}
              <div className="hidden overflow-x-auto md:block">
                <table className="tablo w-full text-sm">
                  <thead>
                    <tr>
                      <SiraBaslik anahtar="ad" sira={sira} sirala={sirala}>Müşteri</SiraBaslik>
                      <SiraBaslik anahtar="konum" sira={sira} sirala={sirala}>Konum</SiraBaslik>
                      <SiraBaslik anahtar="kurulum" sira={sira} sirala={sirala}>Kurulum</SiraBaslik>
                      <SiraBaslik anahtar="aku" sira={sira} sirala={sirala} sag>Akü</SiraBaslik>
                      <SiraBaslik anahtar="inverter" sira={sira} sirala={sirala} sag>İnverter</SiraBaslik>
                      <th>Durum</th>
                      <SiraBaslik anahtar="saglik" sira={sira} sirala={sirala}>En düşük sağlık</SiraBaslik>
                    </tr>
                  </thead>
                  <tbody>
                    {sirali.map((m) => {
                      const d = saglikDurumu(m.saglik);
                      return (
                        <tr key={m.id} onClick={() => git(`/musteri/${m.id}`)} className="cursor-pointer">
                          <td>
                            <Link to={`/musteri/${m.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{m.ad}</Link>
                            <div className="text-xs text-sonuk">{m.id} · {m.tip}</div>
                          </td>
                          <td className="text-soluk">{m.ilce}, {m.il}</td>
                          <td className="tabular-nums text-soluk">{tarihTR(m.kurulum)}</td>
                          <td className="text-right tabular-nums">{m.aku}</td>
                          <td className="text-right tabular-nums">{m.inverter}</td>
                          <td>{durumRozeti(m)}</td>
                          <td className="w-40">
                            {m.saglik != null ? (
                              <div className="flex items-center gap-2.5">
                                <span className={`w-7 tabular-nums ${DURUM_YAZI[d]}`}>{m.saglik}</span>
                                <SaglikCubugu deger={m.saglik} durum={d} ince />
                              </div>
                            ) : <span className="text-sonuk">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Kart>
      )}

      <MusteriDuzenle acik={yeniAcik} kapat={() => setYeniAcik(false)} musteri={null} kaydedildi={yenile} />
    </div>
  );
}
