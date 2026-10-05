import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, Trash2, Pencil, MessageSquare, Eraser } from "lucide-react";
import SohbetPaneli from "../bilesenler/SohbetPaneli";
import { useSohbet } from "../api/sohbetler";

/** Sohbet sayfası: solda konuşma listesi, sağda aktif konuşma. */
export default function Asistan() {
  const { liste, aktif, yeni, sec, sil, yenidenAdlandir, temizle } = useSohbet();
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [ad, setAd] = useState("");
  // Detay sayfasındaki "Bu arızayı açıkla" butonu buraya soru ile yönlendirir.
  const baslangicSoru = useLocation().state?.soru || "";

  function kaydet() {
    yenidenAdlandir(duzenlenen, ad);
    setDuzenlenen(null);
  }

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] lg:-m-6 lg:h-[calc(100dvh-3.5rem)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-cizgi md:flex">
        <div className="p-3">
          <button onClick={yeni} className="dugme-ikincil w-full justify-start">
            <Plus size={15} /> Yeni sohbet
          </button>
        </div>
        <div className="px-3 pb-1 text-2xs font-medium uppercase tracking-wider text-sonuk">Geçmiş</div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {liste.map((s) => (
            <div key={s.id}
              className={`group flex items-center gap-1 rounded-md pr-1 ${
                s.id === aktif.id ? "bg-panel2 text-metin" : "text-soluk hover:bg-panel2/60 hover:text-metin"}`}>
              {duzenlenen === s.id ? (
                <input autoFocus value={ad} onChange={(e) => setAd(e.target.value)}
                  onBlur={kaydet}
                  onKeyDown={(e) => { if (e.key === "Enter") kaydet(); if (e.key === "Escape") setDuzenlenen(null); }}
                  className="girdi m-0.5 h-7 py-0 text-sm" />
              ) : (
                <>
                  <button onClick={() => sec(s.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                    <MessageSquare size={14} className="shrink-0 opacity-60" />
                    <span className="truncate">{s.baslik}</span>
                  </button>
                  <button onClick={() => { setDuzenlenen(s.id); setAd(s.baslik); }} title="Yeniden adlandır"
                    className="rounded p-1 text-sonuk opacity-0 hover:text-metin group-hover:opacity-100">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => sil(s.id)} title="Sil"
                    className="rounded p-1 text-sonuk opacity-0 hover:text-kritik group-hover:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-cizgi px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{aktif.baslik}</h1>
          <button onClick={yeni} className="dugme-hayalet p-1.5 md:hidden" title="Yeni sohbet"><Plus size={16} /></button>
          {aktif.mesajlar.length > 0 && (
            <button onClick={() => temizle(aktif.id)} className="dugme-hayalet px-2 py-1 text-xs">
              <Eraser size={13} /> Temizle
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1"><SohbetPaneli baslangicSoru={baslangicSoru} /></div>
      </section>
    </div>
  );
}
