import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Kart, Olcum } from "../bilesenler/Kart";
import { Rozet } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { mudahaleKuyrugu, musteriListesi, kaynakAnalizi } from "../api/servis";
import { saglikDurumu, sureMetni, KAYNAK_ADI, tarihTR } from "../veri/yardimci";

/**
 * Kaynak analizi her cihaz için ayrı bir hesaplamadır (backend'de
 * cihaz başına sorgu). Onlarca cihaz için toplu çekmek pahalıdır;
 * bu yüzden yalnızca kuyruktaki (zaten sorunlu) ilk birkaç cihaz
 * için paralel istenir — "tüm filo" değil "şu an ilgilenilenler".
 */
const KAYNAK_LIMIT = 8;

export default function Arizalar() {
  const { veri: isler, yukleniyor, hata, yenile } = useVeri(mudahaleKuyrugu);
  const { veri: musteriler } = useVeri(musteriListesi);
  const [analizler, setAnalizler] = useState({});
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false);

  useEffect(() => {
    if (!isler?.length) return;
    setAnalizYukleniyor(true);
    const hedef = isler.slice(0, KAYNAK_LIMIT);
    Promise.all(hedef.map((is) => kaynakAnalizi(is.id).then((a) => [is.id, a]).catch(() => null)))
      .then((sonuclar) => {
        setAnalizler(Object.fromEntries(sonuclar.filter(Boolean)));
        setAnalizYukleniyor(false);
      });
  }, [isler]);

  const musteriMap = Object.fromEntries((musteriler || []).map((m) => [m.id, m]));
  const kaynakli = Object.entries(analizler);
  const sayim = {
    uretim: kaynakli.filter(([, a]) => a.sinif === "uretim").length,
    kullanim: kaynakli.filter(([, a]) => a.sinif === "kullanim").length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Arızalar</h1>
        <p className="mt-1 text-sm text-soluk">
          Öngörülen ve gerçekleşen arızalar, kaynak analiziyle birlikte.
        </p>
      </div>

      <div className="grid grid-cols-2 border border-cizgi bg-panel md:grid-cols-4">
        <Olcum etiket="Öngörülen" deger={isler?.length ?? "—"}
          vurgu={isler?.length ? "text-uyari" : "text-metin"} />
        <Olcum etiket="İncelenen" deger={kaynakli.length} />
        <Olcum etiket="Üretim kaynaklı" deger={sayim.uretim} />
        <Olcum etiket="Kullanım kaynaklı" deger={sayim.kullanim} />
      </div>

      {yukleniyor ? <SatirIskelet satir={4} /> : hata ? <HataKutusu hata={hata} yenile={yenile} /> : (
        <Kart
          baslik="Öngörülen Arızalar"
          ustBilgi={<span className="text-xs text-soluk">aciliyet sırasına göre</span>}
          cocuk={
            isler.length === 0
              ? <div className="px-5 py-12 text-center"><p className="text-sm">Öngörülen arıza yok.</p></div>
              : <div>
                  {isler.map((is, i) => {
                    const d = saglikDurumu(is.saglik);
                    const yazi = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik" }[d];
                    const yol = is.tip === "aku" ? `/aku/${is.id}` : `/inverter/${is.id}`;
                    const oran = is.kalanSaat != null
                      ? Math.min(100, Math.max(3, (1 - is.kalanSaat / 168) * 100)) : 50;
                    const cubuk = { saglikli: "bg-saglikli", uyari: "bg-uyari", kritik: "bg-kritik" }[d];
                    const musteri = musteriMap[is.musteriId];
                    return (
                      <Link key={is.id} to={yol}
                        className="block border-b border-cizgi px-4 py-3.5 transition-colors last:border-b-0 hover:bg-panel2">
                        <div className="flex items-start gap-4">
                          <span className="mt-0.5 w-6 shrink-0 text-xs text-sonuk">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <span className="font-mono text-sm">{is.id}</span>
                              <span className="text-xs text-soluk">
                                {musteri?.ad ?? is.musteriAd} {musteri?.il ? `· ${musteri.il}` : ""}
                              </span>
                            </div>
                            <p className="mt-1 text-sm"><span className={yazi}>{is.bilesen}</span></p>
                            {is.gerekce && <p className="mt-1 text-xs leading-relaxed text-soluk">{is.gerekce}</p>}
                            {is.kalanSaat != null && (
                              <div className="mt-2.5">
                                <div className="relative h-[3px] w-full bg-cizgi">
                                  <div className={`absolute inset-y-0 left-0 ${cubuk} opacity-70`} style={{ width: `${oran}%` }} />
                                  <div className={`absolute top-1/2 h-2 w-[2px] -translate-y-1/2 ${cubuk}`} style={{ left: `${oran}%` }} />
                                </div>
                                <div className="mt-1.5 flex justify-between text-xs text-sonuk">
                                  <span>müdahale penceresi</span>
                                  <span className={yazi}>{sureMetni(is.kalanSaat)} kaldı</span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`font-mono text-2xl leading-none ${yazi}`}>{is.saglik}</div>
                            <div className="mt-1 text-xs text-sonuk">sağlık</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
          }
        />
      )}

      <Kart
        baslik="Arıza Kaynağı Analizi"
        ustBilgi={<span className="text-xs text-soluk">
          {analizYukleniyor ? "hesaplanıyor…" : `${kaynakli.length} inceleme`}
        </span>}
        cocuk={
          analizYukleniyor ? (
            <div className="p-4"><SatirIskelet satir={2} /></div>
          ) : kaynakli.length === 0 ? (
            <div className="px-5 py-12 text-center"><p className="text-sm">Henüz analiz yok.</p></div>
          ) : (
            <div className="divide-y divide-cizgi">
              {kaynakli.map(([cihazId, a]) => {
                const is = isler.find((x) => x.id === cihazId);
                const musteri = musteriMap[is?.musteriId];
                const uretimMi = a.sinif === "uretim";
                return (
                  <div key={cihazId} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono text-sm">{cihazId}</span>
                          <span className="text-xs text-soluk">{musteri?.ad}</span>
                        </div>
                      </div>
                      <Rozet durum={uretimMi ? "uyari" : "bilgi"}
                        cocuk={`${KAYNAK_ADI[a.sinif] || "Belirsiz"} · %${Math.round((a.guven || 0) * 100)}`} />
                    </div>
                    {a.bulgu && <p className="mt-2.5 text-sm leading-relaxed text-metin">{a.bulgu}</p>}
                    <div className="mt-3">
                      <span className={`text-xs ${uretimMi ? "text-uyari" : "text-soluk"}`}>
                        {a.garantiYorum || (uretimMi ? "garanti değerlendirmesine uygun" : "garanti dışı değerlendirilebilir")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      />
    </div>
  );
}
