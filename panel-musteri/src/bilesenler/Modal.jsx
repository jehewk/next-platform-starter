import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Diyalog. Masaüstünde ortada, telefonda alttan açılan sayfa (bottom sheet)
 * olarak görünür. Esc ve dış tıklama kapatır.
 */
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-[10vh]"
         onMouseDown={(e) => e.target === e.currentTarget && kapat()}>
      <div role="dialog" aria-modal="true" aria-label={typeof baslik === "string" ? baslik : undefined}
           className={`flex max-h-[92dvh] w-full ${genislik} animate-belir flex-col rounded-t-2xl border border-cizgi bg-panel
                       shadow-yuzen sm:max-h-none sm:rounded-xl`}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-cizgi sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cizgi px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{baslik}</h2>
            {aciklama && <p className="mt-0.5 text-sm text-soluk">{aciklama}</p>}
          </div>
          <button onClick={kapat} aria-label="Kapat" className="dugme-hayalet -mr-2 -mt-1 p-1.5">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {alt && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-cizgi px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
            {alt}
          </div>
        )}
      </div>
    </div>
  );
}
