import { Plus, Eraser } from "lucide-react";
import SohbetPaneli from "../bilesenler/SohbetPaneli";
import { useSohbet } from "../api/sohbetler";

/** Tam ekran sohbet; yükseklik üst çubuk ve alt sekmeler hesaba katılarak ayarlanır. */
export default function Sohbet() {
  const { aktif, yeni, temizle } = useSohbet();
  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-56px-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-3.5rem)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-cizgi px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{aktif.mesajlar.length ? aktif.baslik : "Sohbet"}</h1>
        {aktif.mesajlar.length > 0 && (
          <>
            <button onClick={() => temizle(aktif.id)} className="dugme-hayalet px-2 py-1 text-xs"><Eraser size={13} /> Temizle</button>
            <button onClick={yeni} className="dugme-hayalet px-2 py-1 text-xs"><Plus size={14} /> Yeni</button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1"><SohbetPaneli /></div>
    </div>
  );
}
