import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

/**
 * Kısa işlem bildirimleri ("Müşteri kaydedildi", "Talep onaylandı").
 * Masaüstünde sağ altta, telefonda alt menünün üstünde görünür.
 */

const Baglam = createContext(() => {});

export function ToastSaglayici({ children }) {
  const [liste, setListe] = useState([]);

  const kapat = useCallback((id) => setListe((l) => l.filter((t) => t.id !== id)), []);

  const goster = useCallback((metin, tur = "iyi") => {
    const id = Math.random().toString(36).slice(2);
    setListe((l) => [...l.slice(-2), { id, metin, tur }]);
    setTimeout(() => kapat(id), 3500);
  }, [kapat]);

  return (
    <Baglam.Provider value={goster}>
      {children}
      <div aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[80]
                   flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:right-6 lg:items-end">
        {liste.map((t) => {
          const Ikon = t.tur === "iyi" ? CheckCircle2 : AlertCircle;
          return (
            <div key={t.id} role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-belir items-center gap-2.5 rounded-lg
                         border border-cizgi bg-panel2 px-3.5 py-2.5 text-sm shadow-yuzen">
              <Ikon size={16} className={`shrink-0 ${t.tur === "iyi" ? "text-saglikli" : "text-kritik"}`} />
              <span className="flex-1">{t.metin}</span>
              <button onClick={() => kapat(t.id)} aria-label="Kapat" className="text-sonuk hover:text-metin">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Baglam.Provider>
  );
}

export const useToast = () => useContext(Baglam);
