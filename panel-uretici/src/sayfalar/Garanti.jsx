import { Kart, Olcum } from "../bilesenler/Kart";
import { Rozet } from "../bilesenler/Rozet";
import { Link } from "react-router-dom";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { garantiListesi, cihazListesi, musteriListesi } from "../api/servis";
import { garantiDurumu, tarihTR, KAYNAK_ADI, GARANTI_SURESI_AY } from "../veri/yardimci";

const DURUM = {
  inceleniyor: { ad: "İnceleniyor", renk: "uyari" },
  onaylandi:   { ad: "Onaylandı",   renk: "saglikli" },
  reddedildi:  { ad: "Reddedildi",  renk: "kritik" },
};

export default function Garanti() {
  const { veri: talepler, yukleniyor: tYukleniyor, hata: tHata, yenile: tYenile } = useVeri(garantiListesi);
  const { veri: cihazlar, yukleniyor: cYukleniyor, hata: cHata } = useVeri(cihazListesi);
  const { veri: musteriler } = useVeri(musteriListesi);

  const cihazMap = Object.fromEntries((cihazlar || []).map((c) => [c.id, c]));
  const musteriMap = Object.fromEntries((musteriler || []).map((m) => [m.id, m]));
  const sahada = (cihazlar || []).filter((c) => c.musteriId);
  const gecerli = sahada.filter((c) => garantiDurumu(c).gecerli);
  const yakin = gecerli.filter((c) => garantiDurumu(c).kalanGun < 180);
  const dolmus = sahada.length - gecerli.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Garanti</h1>
        <p className="mt-1 text-sm text-soluk">
          Garanti süreleri ve talepler. Süre kurulum değil üretim tarihinden başlar
          ({GARANTI_SURESI_AY.aku} ay).
        </p>
      </div>

      <div className="grid grid-cols-2 border border-cizgi bg-panel md:grid-cols-4">
        <Olcum etiket="Kapsamdaki cihaz" deger={gecerli.length} />
        <Olcum etiket="Süresi dolan" deger={dolmus} />
        <Olcum etiket="6 aydan az kalan" deger={yakin.length} vurgu={yakin.length ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Açık talep" deger={(talepler || []).filter((t) => t.durum === "inceleniyor").length} />
      </div>

      {tYukleniyor ? <SatirIskelet satir={4} /> : tHata ? <HataKutusu hata={tHata} yenile={tYenile} /> : (
        <Kart
          baslik="Garanti Talepleri"
          ustBilgi={<span className="text-xs text-soluk">{talepler.length} kayıt</span>}
          cocuk={
            talepler.length === 0 ? (
              <div className="px-5 py-12 text-center"><p className="text-sm text-soluk">Kayıtlı talep yok.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-cizgi text-xs font-medium text-sonuk">
                      <th className="px-4 py-2.5 text-left font-normal">Talep</th>
                      <th className="px-4 py-2.5 text-left font-normal">Cihaz</th>
                      <th className="px-4 py-2.5 text-left font-normal">Müşteri</th>
                      <th className="px-4 py-2.5 text-left font-normal">Kaynak</th>
                      <th className="px-4 py-2.5 text-left font-normal">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {talepler.map((t) => {
                      const c = cihazMap[t.cihazId];
                      const m = musteriMap[t.musteriId];
                      const d = DURUM[t.durum] || DURUM.inceleniyor;
                      return (
                        <tr key={t.id} className="border-b border-cizgi last:border-b-0 hover:bg-panel2">
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs">{t.id}</div>
                            <div className="text-xs text-sonuk">{tarihTR(t.tarih)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Link to={c?.tip === "aku" ? `/aku/${t.cihazId}` : `/inverter/${t.cihazId}`}
                              className="font-mono text-xs hover:underline">{t.cihazId}</Link>
                            <div className="mt-0.5 text-2xs text-soluk">{t.aciklama}</div>
                          </td>
                          <td className="px-4 py-3 text-xs">{m?.ad ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs ${t.sinif === "uretim" ? "text-uyari" : "text-soluk"}`}>
                              {KAYNAK_ADI[t.sinif] || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3"><Rozet durum={d.renk} cocuk={d.ad} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        />
      )}

      {cYukleniyor ? <SatirIskelet satir={4} /> : cHata ? <HataKutusu hata={cHata} /> : (
        <Kart
          baslik="Garanti Süreleri"
          ustBilgi={<span className="text-xs text-soluk">sahadaki {sahada.length} cihaz</span>}
          cocuk={
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-cizgi text-xs font-medium text-sonuk">
                    <th className="px-4 py-2.5 text-left font-normal">Cihaz</th>
                    <th className="px-4 py-2.5 text-left font-normal">Müşteri</th>
                    <th className="px-4 py-2.5 text-left font-normal">Üretim</th>
                    <th className="px-4 py-2.5 text-left font-normal">Bitiş</th>
                    <th className="px-4 py-2.5 text-right font-normal">Kalan</th>
                  </tr>
                </thead>
                <tbody>
                  {sahada
                    .map((c) => ({ c, g: garantiDurumu(c) }))
                    .sort((a, b) => a.g.kalanGun - b.g.kalanGun)
                    .map(({ c, g }) => {
                      const m = musteriMap[c.musteriId];
                      const az = g.kalanGun < 180;
                      return (
                        <tr key={c.id} className="border-b border-cizgi last:border-b-0 hover:bg-panel2">
                          <td className="px-4 py-2.5">
                            <Link to={c.tip === "aku" ? `/aku/${c.id}` : `/inverter/${c.id}`}
                              className="font-mono text-xs hover:underline">{c.id}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-soluk">{m?.ad ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-sonuk">{tarihTR(c.uretim)}</td>
                          <td className="px-4 py-2.5 text-xs text-sonuk">
                            {g.bitis ? g.bitis.toLocaleDateString("tr-TR") : "—"}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono text-xs ${
                            !g.gecerli ? "text-kritik" : az ? "text-uyari" : "text-soluk"}`}>
                            {g.gecerli ? `${Math.round(g.kalanGun / 30)} ay` : "doldu"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </div>
  );
}
