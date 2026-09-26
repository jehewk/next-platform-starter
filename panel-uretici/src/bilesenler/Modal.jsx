import { useEffect } from "react";
import { X } from "lucide-react";

/** Ortada açılan diyalog. Esc ve dış tıklama kapatır. */
export default function Modal({ acik, kapat, baslik, aciklama, children, alt, genislik = "max-w-lg" }) {
  useEffect(() => {
    if (!acik) return;
    const f = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", f);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = eski; };
  }, [acik, kapat]);

  if (!acik) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh]"
         onMouseDown={(e) => e.target === e.currentTarget && kapat()}>
      <div role="dialog" aria-modal="true" aria-label={baslik}
           className={`w-full ${genislik} animate-belir rounded-xl border border-cizgi bg-panel shadow-yuzen`}>
        <div className="flex items-start justify-between gap-4 border-b border-cizgi px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{baslik}</h2>
            {aciklama && <p className="mt-0.5 text-sm text-soluk">{aciklama}</p>}
          </div>
          <button onClick={kapat} aria-label="Kapat" className="dugme-hayalet -mr-2 -mt-1 p-1.5">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {alt && <div className="flex justify-end gap-2 border-t border-cizgi px-5 py-3">{alt}</div>}
      </div>
    </div>
  );
}
