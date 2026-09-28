import { useState } from "react";
import { Plus, Phone, Mail } from "lucide-react";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { Rozet } from "../bilesenler/Rozet";
import DestekTalebi from "../bilesenler/DestekTalebi";
import { useVeri } from "../api/useVeri";
import { garantiListesi, cihazListesi } from "../api/servis";
import { TALEP_DURUMU } from "../veri/sadeDil";
import { tarihTR } from "../veri/yardimci";

const DESTEK_TEL = import.meta.env.VITE_DESTEK_TELEFON;
const DESTEK_EPOSTA = import.meta.env.VITE_DESTEK_EPOSTA;

export default function Destek() {
  const [acik, setAcik] = useState(false);
  const { veri: talepler, yukleniyor, hata, yenile } = useVeri(garantiListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);
  const sahada = (cihazlar || []).filter((c) => ["aktif", "uyari", "arizali"].includes(c.durum));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Destek</h1>
        <button onClick={() => setAcik(true)} disabled={!sahada.length} className="dugme-ana min-h-[44px]">
          <Plus size={16} /> Yeni talep
        </button>
      </div>

      {(DESTEK_TEL || DESTEK_EPOSTA) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {DESTEK_TEL && (
            <a href={`tel:${DESTEK_TEL.replace(/\s/g, "")}`} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-cizgi bg-panel px-4">
              <Phone size={18} className="text-soluk" /><span><span className="block text-xs text-sonuk">Telefon</span>{DESTEK_TEL}</span>
            </a>
          )}
          {DESTEK_EPOSTA && (
            <a href={`mailto:${DESTEK_EPOSTA}`} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-cizgi bg-panel px-4">
              <Mail size={18} className="text-soluk" /><span><span className="block text-xs text-sonuk">E-posta</span>{DESTEK_EPOSTA}</span>
            </a>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-sonuk">Taleplerim</h2>
        {yukleniyor ? <SatirIskelet satir={2} /> : hata ? <HataKutusu hata={hata} yenile={yenile} /> : talepler.length === 0 ? (
          <p className="rounded-xl border border-cizgi bg-panel px-5 py-10 text-center text-sm text-soluk">
            Henüz destek talebiniz yok. Bir sorun yaşarsanız “Yeni talep” ile bize bildirin.
          </p>
        ) : (
          <ul className="divide-y divide-cizgi overflow-hidden rounded-xl border border-cizgi bg-panel">
            {talepler.map((t) => {
              const d = TALEP_DURUMU[t.durum] || TALEP_DURUMU.inceleniyor;
              return (
                <li key={t.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-sonuk">{tarihTR(t.tarih)} · {t.cihazId}</span>
                    <Rozet durum={d.renk} cocuk={d.ad} />
                  </div>
                  <p className="mt-1.5 text-sm">{t.aciklama || "—"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DestekTalebi acik={acik} kapat={() => setAcik(false)} cihazlar={sahada} tamam={yenile} />
    </div>
  );
}
