import { useState } from "react";
import { Loader2, ClipboardCheck } from "lucide-react";
import { Kart, Olcum, OlcumSeridi, SayfaBasligi, Bos } from "../bilesenler/Kart";
import Modal from "../bilesenler/Modal";
import { useToast } from "../bilesenler/Toast";
import { Rozet } from "../bilesenler/Rozet";
import { Link } from "react-router-dom";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { garantiListesi, cihazListesi, musteriListesi, garantiGuncelle } from "../api/servis";
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
    <div className="space-y-5">
      <SayfaBasligi baslik="Garanti"
        aciklama={<>Garanti süreleri ve talepler. Süre kurulum değil üretim tarihinden başlar ({GARANTI_SURESI_AY.aku} ay).</>} />

      <OlcumSeridi sutun={4}>
        <Olcum etiket="Kapsamdaki cihaz" deger={gecerli.length} />
        <Olcum etiket="Süresi dolan" deger={dolmus} />
        <Olcum etiket="6 aydan az kalan" deger={yakin.length} vurgu={yakin.length ? "text-uyari" : "text-metin"} />
        <Olcum etiket="Açık talep" deger={(talepler || []).filter((t) => t.durum === "inceleniyor").length} />
      </OlcumSeridi>

      {tYukleniyor ? <SatirIskelet satir={4} /> : tHata ? <HataKutusu hata={tHata} yenile={tYenile} /> : (
        <TalepListesi talepler={talepler} cihazMap={cihazMap} musteriMap={musteriMap} yenile={tYenile} />
      )}

      {cYukleniyor ? <SatirIskelet satir={4} /> : cHata ? <HataKutusu hata={cHata} /> : (
        <Kart
          baslik="Garanti Süreleri"
          ustBilgi={<span className="text-xs text-soluk">sahadaki {sahada.length} cihaz</span>}
          cocuk={
            <div className="overflow-x-auto">
              <table className="tablo w-full min-w-[680px] text-sm">
                <thead>
                  <tr>
                    <th>Cihaz</th>
                    <th>Müşteri</th>
                    <th>Üretim</th>
                    <th>Bitiş</th>
                    <th className="!text-right">Kalan</th>
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
                        <tr key={c.id} >
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

/* ── Talepler: filtre + liste + değerlendirme ── */

function TalepListesi({ talepler, cihazMap, musteriMap, yenile }) {
  const [filtre, setFiltre] = useState("acik");
  const [secili, setSecili] = useState(null);
  const liste = talepler.filter((t) => filtre === "hepsi" || t.durum === "inceleniyor");
  const acikSayi = talepler.filter((t) => t.durum === "inceleniyor").length;

  return (
    <Kart baslik="Garanti talepleri"
      ustBilgi={
        <div className="flex gap-1.5">
          <button onClick={() => setFiltre("acik")} className={filtre === "acik" ? "cip-aktif" : "cip-pasif"}>Açık {acikSayi}</button>
          <button onClick={() => setFiltre("hepsi")} className={filtre === "hepsi" ? "cip-aktif" : "cip-pasif"}>Tümü {talepler.length}</button>
        </div>
      }>
      {liste.length === 0 ? <Bos metin={filtre === "acik" ? "İnceleme bekleyen talep yok." : "Kayıtlı talep yok."} /> : (
        <ul className="divide-y divide-cizgi">
          {liste.map((t) => {
            const c = cihazMap[t.cihazId];
            const m = musteriMap[t.musteriId];
            const d = DURUM[t.durum] || DURUM.inceleniyor;
            return (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="font-mono text-xs">{t.id}</span>
                    <Rozet durum={d.renk} cocuk={d.ad} />
                    <span className="text-xs text-sonuk">{tarihTR(t.tarih)}</span>
                  </div>
                  <p className="mt-1.5 text-sm">{t.aciklama || "Açıklama yok"}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-sonuk">
                    <Link to={c?.tip === "inverter" ? `/inverter/${t.cihazId}` : `/aku/${t.cihazId}`}
                      className="font-mono hover:text-metin hover:underline">{t.cihazId}</Link>
                    <span>{m?.ad ?? "—"}</span>
                    {t.sinif && <span className={t.sinif === "uretim" ? "text-uyari" : ""}>{KAYNAK_ADI[t.sinif] || t.sinif}</span>}
                  </div>
                </div>
                <button onClick={() => setSecili(t)} className={t.durum === "inceleniyor" ? "dugme-ana shrink-0" : "dugme-ikincil shrink-0"}>
                  <ClipboardCheck size={14} /> {t.durum === "inceleniyor" ? "Değerlendir" : "Kararı değiştir"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <TalepDegerlendir talep={secili} kapat={() => setSecili(null)} tamam={yenile} />
    </Kart>
  );
}

/**
 * Garanti kararı: POST /de/garanti/guncelle {talep_id, durum, sinif}.
 * Backend'in kaynak analizi önerisi (sinif, güven, gerekçeler) karar
 * verene gösterilir; son karar üreticinindir.
 */
function TalepDegerlendir({ talep, kapat, tamam }) {
  const bildir = useToast();
  const [sinif, setSinif] = useState("");
  const [durum, setDurum] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [acilan, setAcilan] = useState(null);

  if (talep && acilan !== talep.id) {
    setAcilan(talep.id);
    setSinif(talep.sinif && talep.sinif !== "belirsiz" ? talep.sinif : "");
    setDurum(talep.durum === "inceleniyor" ? "onaylandi" : talep.durum);
    setHata(null);
  }
  if (!talep) return null;

  async function kaydet(e) {
    e.preventDefault();
    if (!sinif) { setHata("Arıza kaynağını seçin."); return; }
    setGonderiliyor(true);
    setHata(null);
    try {
      await garantiGuncelle(talep.id, durum, sinif);
      bildir(`${talep.id}: ${DURUM[durum].ad.toLocaleLowerCase("tr")}`);
      tamam();
      setAcilan(null);
      kapat();
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <Modal acik kapat={() => { setAcilan(null); kapat(); }} baslik="Garanti talebini değerlendir" aciklama={`${talep.id} · ${talep.cihazId}`}
      alt={<>
        <button type="button" onClick={() => { setAcilan(null); kapat(); }} className="dugme-ikincil">Vazgeç</button>
        <button type="submit" form="talep-form" disabled={gonderiliyor} className="dugme-ana">
          {gonderiliyor && <Loader2 size={14} className="animate-spin" />} Kararı kaydet
        </button>
      </>}>
      <form id="talep-form" onSubmit={kaydet} className="space-y-4">
        <div className="rounded-md border border-cizgi bg-zemin px-3 py-2.5 text-sm">{talep.aciklama || "Açıklama yok"}</div>

        {(talep.oneri || talep.gerekceler?.length > 0) && (
          <div className="rounded-md border border-cizgi px-3 py-2.5">
            <div className="text-xs font-medium text-soluk">
              Sistem önerisi{talep.guven != null && ` · %${Math.round(talep.guven * 100)} güven`}
            </div>
            {talep.oneri && <p className="mt-1 text-sm">{talep.oneri}{talep.oneriNot ? ` — ${talep.oneriNot}` : ""}</p>}
            {talep.gerekceler?.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-soluk">
                {talep.gerekceler.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            )}
          </div>
        )}

        <div>
          <span className="etiket">Arıza kaynağı</span>
          <div className="grid grid-cols-3 gap-2">
            {["uretim", "kullanim", "dis"].map((k) => (
              <button key={k} type="button" onClick={() => setSinif(k)} aria-pressed={sinif === k}
                className={`rounded-md border px-2 py-2 text-xs font-medium ${sinif === k ? "border-metin/40 bg-panel2 text-metin" : "border-cizgi text-soluk hover:text-metin"}`}>
                {KAYNAK_ADI[k]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="etiket">Karar</span>
          <div className="grid grid-cols-3 gap-2">
            {["onaylandi", "reddedildi", "inceleniyor"].map((k) => (
              <button key={k} type="button" onClick={() => setDurum(k)} aria-pressed={durum === k}
                className={`rounded-md border px-2 py-2 text-xs font-medium ${durum === k ? "border-metin/40 bg-panel2 text-metin" : "border-cizgi text-soluk hover:text-metin"}`}>
                {k === "inceleniyor" ? "İncelemede kalsın" : DURUM[k].ad}
              </button>
            ))}
          </div>
        </div>
        {hata && <p className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">{hata}</p>}
      </form>
    </Modal>
  );
}
