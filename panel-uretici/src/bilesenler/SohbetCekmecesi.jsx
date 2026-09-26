import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Plus, Maximize2 } from "lucide-react";
import SohbetPaneli from "./SohbetPaneli";
import { useSohbet } from "../api/sohbetler";

/** Her sayfadan açılabilen sağ sohbet çekmecesi (⌘J). */
export default function SohbetCekmecesi({ acik, kapat }) {
  const { aktif, yeni } = useSohbet();

  useEffect(() => {
    if (!acik) return;
    const f = (e) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [acik, kapat]);

  if (!acik) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={kapat} />
      <aside aria-label="Sohbet"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] animate-kay-sag flex-col border-l border-cizgi bg-panel shadow-yuzen">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-cizgi px-4">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{aktif.baslik}</span>
          <button onClick={yeni} title="Yeni sohbet" className="dugme-hayalet p-1.5"><Plus size={16} /></button>
          <Link to="/asistan" onClick={kapat} title="Tam ekran" className="dugme-hayalet p-1.5"><Maximize2 size={15} /></Link>
          <button onClick={kapat} title="Kapat" className="dugme-hayalet p-1.5"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1"><SohbetPaneli kompakt /></div>
      </aside>
    </>
  );
}
