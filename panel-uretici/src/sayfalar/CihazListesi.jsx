import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronRight, ShieldAlert, Loader2 } from "lucide-react";
import { Kart, SayfaBasligi, Bos } from "../bilesenler/Kart";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useSiralama, SiraBaslik, csvIndir, CsvDugmesi, EylemMenusu } from "../bilesenler/Tablo";
import Modal from "../bilesenler/Modal";
import { useToast } from "../bilesenler/Toast";
import { useVeri } from "../api/useVeri";
import { cihazListesi, musteriListesi, garantiTalepOlustur } from "../api/servis";
import { saglikDurumu, durumRengi, DURUM_ADI, garantiDurumu, tarihTR, DURUM_YAZI } from "../veri/yardimci";

/*  Aküler ve inverterler için ortak liste — tip proplarıyla ayrışır.
 *  Liste yalnızca cihaz kaydının kendi alanlarını gösterir; anlık ölçüm
 *  (hücre gerilimi, IGBT) her cihaz için ayrı çağrı gerektirir ve yalnızca
 *  detay sayfasında istenir (DEVIR §13.2: N+1 sorgu tuzağı).            */

const SUZGECLER = [
  { id: "hepsi",  ad: "Tümü",      test: () => true },
  { id: "aktif",  ad: "Sahada",    test: (c) => ["aktif", "uyari", "arizali"].includes(c.durum) },
  { id: "sorun",  ad: "Sorunlu",   test: (c) => ["uyari", "arizali"].includes(c.durum) },
  { id: "depoda", ad: "Depo/Sevk", test: (c) => ["depoda", "sevkte", "uretildi"].includes(c.durum) },
];

const SIRA = {
  id: (c) => c.id, model: (c) => c.model, musteri: (c) => c.musteriAd, durum: (c) => c.durum,
  deger: (c) => c.kapasiteAh ?? c.gucKw, garanti: (c) => c.garantiGun, saglik: (c) => c.saglik,
};

export default function CihazListesi({ tip }) {
  const git = useNavigate();
  const [suzgec, setSuzgec] = useState("hepsi");
  const [ara, setAra] = useState("");
  const [talepCihaz, setTalepCihaz] = useState(null);
  const { veri: cihazlar, yukleniyor, hata, yenile } = useVeri(() => cihazListesi({ tip }), [tip]);
  const { veri: musteriler } = useVeri(musteriListesi);

  const hepsi = useMemo(() => cihazlar || [], [cihazlar]);
  const q = ara.toLocaleLowerCase("tr");
  const liste = useMemo(() => {
    const mMap = Object.fromEntries((musteriler || []).map((m) => [m.id, m.ad]));
    const secili = SUZGECLER.find((s) => s.id === suzgec);
    return hepsi
      .map((c) => ({ ...c, musteriAd: mMap[c.musteriId] || null, garantiGun: garantiDurumu(c).kalanGun }))
      .filter(secili.test)
      .filter((c) => [c.id, c.model, c.parti, c.musteriAd].join(" ").toLocaleLowerCase("tr").includes(q));
  }, [hepsi, musteriler, suzgec, q]);
  const { sirali, sira, sirala } = useSiralama(liste, SIRA, { anahtar: "saglik", yon: 1 });

  const aku = tip === "aku";
  const baslik = aku ? "Aküler" : "İnverterler";
  const yol = (c) => (aku ? `/aku/${c.id}` : `/inverter/${c.id}`);
  const deger = (c) => (aku ? `${c.kapasiteAh ?? "—"} Ah` : `${c.gucKw ?? "—"} kW`);

  function disaAktar() {
    csvIndir(aku ? "akuler" : "inverterler", sirali, [
      { ad: "Seri no", deger: (c) => c.id }, { ad: "Model", deger: (c) => c.model },
      { ad: "Parti", deger: (c) => c.parti }, { ad: "Durum", deger: (c) => DURUM_ADI[c.durum] || c.durum },
      { ad: "Müşteri", deger: (c) => c.musteriAd ?? "" },
      { ad: aku ? "Kapasite (Ah)" : "Güç (kW)", deger: (c) => (aku ? c.kapasiteAh : c.gucKw) ?? "" },
      { ad: "Üretim", deger: (c) => tarihTR(c.uretim) }, { ad: "Kurulum", deger: (c) => tarihTR(c.kurulum) },
      { ad: "Garanti (gün)", deger: (c) => Math.max(0, c.garantiGun) },
      { ad: "Sağlık", deger: (c) => c.saglik ?? "" },
    ]);
  }

  const eylemler = (c) => [
    { ad: "Detayı aç", yap: () => git(yol(c)) },
    { ad: "Müşteriye git", gizli: !c.musteriId, yap: () => git(`/musteri/${c.musteriId}`) },
    { ad: "Garanti talebi aç", ikon: ShieldAlert, gizli: !c.musteriId, yap: () => setTalepCihaz(c) },
  ];

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik={baslik}
        aciklama={`Üretilen tüm ${aku ? "aküler" : "inverterler"} — sahada, depoda ve sevkte olanlar.`}
        eylem={<CsvDugmesi onClick={disaAktar} />} />

      <div className="flex flex-wrap items-center gap-2">
        {SUZGECLER.map((s) => (
          <button key={s.id} onClick={() => setSuzgec(s.id)} className={suzgec === s.id ? "cip-aktif" : "cip-pasif"}>
            {s.ad} <span className="tabular-nums text-sonuk">{hepsi.filter(s.test).length}</span>
          </button>
        ))}
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sonuk" />
          <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Seri no, model, parti, müşteri…" className="girdi pl-8" />
        </div>
      </div>

      {yukleniyor ? <SatirIskelet satir={6} /> : hata ? <HataKutusu hata={hata} yenile={yenile} /> : (
        <Kart>
          {sirali.length === 0 ? <Bos metin="Kayıt bulunamadı." alt="Filtreyi veya aramayı değiştirin." /> : (
            <>
              <ul className="divide-y divide-cizgi md:hidden">
                {sirali.map((c) => {
                  const d = saglikDurumu(c.saglik);
                  return (
                    <li key={c.id}>
                      <Link to={yol(c)} className="flex items-center gap-3 px-4 py-3.5 active:bg-panel2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm">{c.id}</span>
                            <Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum] || c.durum} />
                          </div>
                          <div className="mt-1 truncate text-xs text-sonuk">{c.musteriAd ?? "Müşteri yok"} · {deger(c)} · {c.parti}</div>
                          {c.saglik != null && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className={`w-7 text-xs tabular-nums ${DURUM_YAZI[d]}`}>{c.saglik}</span>
                              <SaglikCubugu deger={c.saglik} durum={d} ince />
                            </div>
                          )}
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-sonuk" />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="tablo w-full text-sm">
                  <thead>
                    <tr>
                      <SiraBaslik anahtar="id" sira={sira} sirala={sirala}>Seri no</SiraBaslik>
                      <SiraBaslik anahtar="model" sira={sira} sirala={sirala}>Model</SiraBaslik>
                      <SiraBaslik anahtar="musteri" sira={sira} sirala={sirala}>Müşteri</SiraBaslik>
                      <SiraBaslik anahtar="durum" sira={sira} sirala={sirala}>Durum</SiraBaslik>
                      <SiraBaslik anahtar="deger" sira={sira} sirala={sirala} sag>{aku ? "Kapasite" : "Güç"}</SiraBaslik>
                      <SiraBaslik anahtar="garanti" sira={sira} sirala={sirala}>Garanti</SiraBaslik>
                      <SiraBaslik anahtar="saglik" sira={sira} sirala={sirala}>Sağlık</SiraBaslik>
                      <th className="w-10"><span className="sr-only">İşlemler</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sirali.map((c) => {
                      const d = saglikDurumu(c.saglik);
                      const g = garantiDurumu(c);
                      return (
                        <tr key={c.id} onClick={() => git(yol(c))} className="cursor-pointer">
                          <td>
                            <Link to={yol(c)} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:underline">{c.id}</Link>
                            <div className="text-xs text-sonuk">parti {c.parti}</div>
                          </td>
                          <td className="font-mono text-xs text-soluk">{c.model}</td>
                          <td className="text-xs">
                            {c.musteriId
                              ? <Link to={`/musteri/${c.musteriId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{c.musteriAd ?? c.musteriId}</Link>
                              : <span className="text-sonuk">—</span>}
                          </td>
                          <td><Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum] || c.durum} /></td>
                          <td className="text-right text-xs tabular-nums text-soluk">{deger(c)}</td>
                          <td className={`text-xs ${g.gecerli ? "text-soluk" : "text-kritik"}`}>
                            {g.gecerli ? `${Math.round(g.kalanGun / 30)} ay` : "doldu"}
                          </td>
                          <td className="w-32">
                            {c.saglik == null ? <span className="text-xs text-sonuk">—</span> : (
                              <div className="flex items-center gap-2">
                                <span className={`w-7 text-xs tabular-nums ${DURUM_YAZI[d]}`}>{c.saglik}</span>
                                <SaglikCubugu deger={c.saglik} durum={d} ince />
                              </div>
                            )}
                          </td>
                          <td className="!py-1 text-right"><EylemMenusu eylemler={eylemler(c)} /></td>
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

      <GarantiTalebiAc cihaz={talepCihaz} kapat={() => setTalepCihaz(null)} />
    </div>
  );
}

/** POST /de/garanti/talep {cihaz_id, aciklama} — üretici adına talep açar. */
export function GarantiTalebiAc({ cihaz, kapat }) {
  const bildir = useToast();
  const [aciklama, setAciklama] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState(null);

  if (!cihaz) return null;
  const kapatVeTemizle = () => { setAciklama(""); setHata(null); kapat(); };

  async function gonder(e) {
    e.preventDefault();
    setGonderiliyor(true);
    setHata(null);
    try {
      await garantiTalepOlustur(cihaz.id, aciklama.trim());
      bildir(`${cihaz.id} için garanti talebi açıldı`);
      kapatVeTemizle();
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <Modal acik kapat={kapatVeTemizle} baslik="Garanti talebi aç" aciklama={cihaz.id}
      alt={<>
        <button type="button" onClick={kapatVeTemizle} className="dugme-ikincil">Vazgeç</button>
        <button type="submit" form="talep-ac" disabled={gonderiliyor || aciklama.trim().length < 10} className="dugme-ana">
          {gonderiliyor && <Loader2 size={14} className="animate-spin" />} Talebi aç
        </button>
      </>}>
      <form id="talep-ac" onSubmit={gonder}>
        <label htmlFor="talep-aciklama" className="etiket">Sorun</label>
        <textarea id="talep-aciklama" rows={4} autoFocus value={aciklama} onChange={(e) => setAciklama(e.target.value)}
          placeholder="Müşterinin bildirdiği sorun, gözlem, saha notu… (en az 10 karakter)" className="girdi resize-none" />
        <p className="mt-1.5 text-xs text-sonuk">Talep Garanti sayfasına "İnceleniyor" olarak düşer; karar orada verilir.</p>
        {hata && <p className="mt-3 rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">{hata}</p>}
      </form>
    </Modal>
  );
}
