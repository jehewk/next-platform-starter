import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { cihazBul, musteriBul, kaynakAnalizi } from "../api/servis";
import { tarihTR, garantiDurumu, mekanizmaAdi, utcTarih, GARANTI_SURESI_AY } from "../veri/yardimci";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";

// Kusur paylaşımı çubuğunda sınıf renkleri (fiş beyaz zeminde basılır; tema
// belirteçleri değil, sabit koyu tonlar kullanılır ki her yazıcıda net çıksın).
const KUSUR_RENK = { uretim: "#b45309", kullanim: "#2563eb", dis_etken: "#6b7280", belirsiz: "#9ca3af" };

function tarihSaat(iso) {
  const t = utcTarih(iso);
  if (!t) return "—";
  return t.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Garanti Değerlendirme Fişi — üretici için indirilebilir belge.
 *
 * Tek bir cihazın garanti değerlendirmesini toplu gösterir: ürün + müşteri
 * (kim/nerede) + tarihler (üretim/satış/kurulum) + arıza nedeni + kusur
 * paylaşımı (%üretici/%kullanıcı) + garanti durumu. "PDF indir" tarayıcının
 * yazdır→PDF akışını kullanır (index.css @media print; yalnızca .fis-belge
 * basılır). Kusur paylaşımı bir öneridir; nihai karar üreticiye aittir.
 */
export default function GarantiFisi() {
  const { id } = useParams();
  const [durum, setDurum] = useState({ yukleniyor: true });

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const cihaz = await cihazBul(id);
        const [musteri, analiz] = await Promise.all([
          cihaz.musteriId ? musteriBul(cihaz.musteriId).catch(() => null) : null,
          kaynakAnalizi(id).catch(() => null),
        ]);
        if (!iptal) setDurum({ yukleniyor: false, cihaz, musteri, analiz });
      } catch (e) {
        if (!iptal) setDurum({ yukleniyor: false, hata: e });
      }
    })();
    return () => { iptal = true; };
  }, [id]);

  if (durum.yukleniyor) return <div className="p-4"><SatirIskelet satir={6} /></div>;
  if (durum.hata) return <div className="p-4"><HataKutusu hata={durum.hata} /></div>;

  const { cihaz, musteri, analiz } = durum;
  const g = garantiDurumu(cihaz);
  const paylasim = analiz?.kusurPaylasimi || [];
  const arizaZamani = cihaz.sonOlcum?.zaman || null;
  const fisNo = `DE-GF-${String(id).replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase()}`;
  const bugun = new Date().toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const sureAy = GARANTI_SURESI_AY[cihaz.tip] || 60;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Eylem çubuğu — yazdırmada gizli */}
      <div className="yazdirma-gizle mb-4 flex items-center justify-between gap-3">
        <Link to={cihaz.tip === "aku" ? `/aku/${id}` : `/inverter/${id}`} className="dugme-hayalet">
          ← Cihaza dön
        </Link>
        <button className="dugme-ana" onClick={() => window.print()}>PDF indir / Yazdır</button>
      </div>

      {/* Fiş belgesi — yalnızca bu basılır (index.css @media print) */}
      <div className="fis-belge rounded-lg border border-cizgi bg-white p-8 text-[13px] leading-relaxed text-gray-900 shadow-sm">
        <header className="flex items-start justify-between border-b border-gray-300 pb-4">
          <div>
            <div className="text-lg font-bold tracking-tight">Dennis Energy</div>
            <div className="text-xs text-gray-500">LiFePO4 Enerji Depolama · Garanti Değerlendirmesi</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Fiş No: <span className="font-mono text-gray-800">{fisNo}</span></div>
            <div>Düzenlenme: {bugun}</div>
          </div>
        </header>

        <h1 className="mt-5 text-base font-semibold">Garanti Değerlendirme Fişi</h1>

        <Bolum baslik="Ürün Bilgileri">
          <Satir e="Cihaz No" d={cihaz.id} mono />
          <Satir e="Tür / Model" d={`${cihaz.tip === "aku" ? "Akü" : "İnverter"} · ${cihaz.model || "—"}`} />
          <Satir e="Üretim Partisi" d={cihaz.parti || "—"} mono />
          <Satir e="Üretim Tarihi" d={tarihTR(cihaz.uretim)} />
          <Satir e="Satış Tarihi" d={tarihTR(cihaz.satis)} />
          <Satir e="Kurulum Tarihi" d={tarihTR(cihaz.kurulum)} />
        </Bolum>

        <Bolum baslik="Müşteri / Kullanım Yeri">
          <Satir e="Müşteri" d={musteri?.ad || "—"} />
          <Satir e="Tür" d={musteri?.tip || "—"} />
          <Satir e="Adres / Konum"
            d={musteri ? ([musteri.adres, musteri.ilce, musteri.il].filter(Boolean).join(", ") || "—") : "—"} />
          <Satir e="Telefon" d={musteri?.telefon || "—"} />
        </Bolum>

        <Bolum baslik="Arıza Değerlendirmesi">
          <Satir e="Tespit Edilen Mekanizma"
            d={mekanizmaAdi(cihaz.tahmin?.mekanizma || cihaz.oncelikli) || "Belirgin arıza yok"} />
          <Satir e="Arıza Tespit Zamanı" d={tarihSaat(arizaZamani)} />
          <Satir e="Sağlık Skoru" d={cihaz.saglik != null ? `%${cihaz.saglik}` : "—"} />
          {analiz?.gerekceler?.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-gray-500">Neden (fiziksel gerekçe)</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-800">
                {analiz.gerekceler.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </Bolum>

        <Bolum baslik="Kusur Paylaşımı (öneri)">
          {paylasim.length > 0 ? (
            <>
              <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full border border-gray-300">
                {paylasim.map((p) => (
                  <div key={p.sinif}
                    style={{ width: `${p.yuzde}%`, background: KUSUR_RENK[p.sinif] || "#6b7280" }} />
                ))}
              </div>
              <table className="w-full text-left">
                <tbody>
                  {paylasim.map((p) => (
                    <tr key={p.sinif} className="border-t border-gray-200">
                      <td className="py-1.5 font-medium">{p.etiket}</td>
                      <td className="py-1.5 text-right font-mono">%{p.yuzde}</td>
                      <td className="py-1.5 pl-3 text-xs text-gray-500">
                        {p.garantiKapsami === true ? "garanti kapsamında"
                          : p.garantiKapsami === false ? "kapsam dışı" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="text-gray-500">Kusur paylaşımı üretilmedi (belirsiz ya da yeterli kanıt yok).</div>
          )}
          {analiz?.garantiYorum && (
            <p className="mt-3 text-gray-800">
              <span className="font-medium">Garanti yorumu: </span>{analiz.garantiYorum}
            </p>
          )}
        </Bolum>

        <Bolum baslik="Garanti Durumu">
          <Satir e="Garanti Süresi" d={`${sureAy} ay`} />
          <Satir e="Garanti Bitişi" d={g.bitis ? tarihTR(g.bitis.toISOString()) : "—"} />
          <Satir e="Durum" d={g.gecerli ? `Geçerli · ${g.kalanGun} gün kaldı` : "Süresi dolmuş"} />
        </Bolum>

        <footer className="mt-6 border-t border-gray-300 pt-4 text-xs text-gray-500">
          <p>
            Bu fiş, ölçüm verisine dayalı bir teknik değerlendirmedir. Kusur paylaşımı
            bir öneridir; nihai garanti kararı üreticiye aittir.
          </p>
          <div className="mt-6 flex justify-between text-gray-700">
            <div>Düzenleyen: ____________________</div>
            <div>Onay (Üretici): ____________________</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Bolum({ baslik, children }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{baslik}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Satir({ e, d, mono }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-1">
      <div className="w-40 shrink-0 text-gray-500">{e}</div>
      <div className={`flex-1 text-gray-900 ${mono ? "font-mono" : ""}`}>{d}</div>
    </div>
  );
}
