import { useEffect, useState, useRef } from "react";
import { LOGO_PARCALARI } from "./Logo";

/**
 * Açılış ekranı.
 *
 * Siyah zemin, beyaz logo. Tek renk, gradyan yok. Yazı beyaz, daktilo
 * efektiyle; altta üretim hattı bandı akar. Tarayıcı oturumu başına
 * bir kez gösterilir (bkz. App.jsx).
 *
 * Akış:
 *   0.0s  parçalar kenarlarda, görünmez
 *   0.2s  soldakiler soldan, sağdakiler sağdan kayar
 *   1.0s  yerine oturur
 *   1.3s  daktilo yazar
 *   2.7s  panele geçiş
 *
 * "Geç" her an görünür. Esc / Enter / Boşluk da geçer.
 */

const YAZI = "Dennis Energy";
const HARF_MS = 78;
const GECIS_MS = 2700;

type Props = { bitince: () => void };

export default function Intro({ bitince }: Props) {
  const [asama, setAsama] = useState<"giris" | "yerlesti" | "yaziliyor">("giris");
  const [yazilan, setYazilan] = useState("");
  const [kapaniyor, setKapaniyor] = useState(false);
  const bittiRef = useRef(false);

  const azHareket =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const bitir = () => {
    if (bittiRef.current) return;
    bittiRef.current = true;
    setKapaniyor(true);
    setTimeout(bitince, 400);
  };

  useEffect(() => {
    if (azHareket) {
      setAsama("yaziliyor");
      setYazilan(YAZI);
      const t = setTimeout(bitir, 800);
      return () => clearTimeout(t);
    }
    const z = [
      setTimeout(() => setAsama("yerlesti"), 1000),
      setTimeout(() => setAsama("yaziliyor"), 1300),
      setTimeout(bitir, GECIS_MS),
    ];
    return () => z.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (asama !== "yaziliyor" || azHareket) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setYazilan(YAZI.slice(0, i));
      if (i >= YAZI.length) clearInterval(id);
    }, HARF_MS);
    return () => clearInterval(id);
  }, [asama, azHareket]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") bitir();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center
                  overflow-hidden bg-black transition-opacity duration-[400ms]
                  ${kapaniyor ? "opacity-0" : "opacity-100"}`}
      role="dialog"
      aria-label="Açılış"
    >
      {/* ── logo: siyah zemin üzerinde beyaz ── */}
      <svg width="164" height="167" className="h-auto w-32 sm:w-[164px]" viewBox="0 0 206 210" aria-hidden="true">
        {LOGO_PARCALARI.map((p, i) => {
          const gizli = asama === "giris";
          const kayma = p.yon === "sol" ? -92 : 92;
          return (
            <path
              key={p.ad}
              d={p.d}
              fill="#FFFFFF"
              style={{
                transform: gizli ? `translateX(${kayma}px)` : "translateX(0)",
                opacity: gizli ? 0 : 1,
                transition: `transform 700ms cubic-bezier(.16,.84,.24,1) ${i * 52}ms,
                             opacity 280ms ease ${i * 52}ms`,
              }}
            />
          );
        })}
      </svg>

      {/* ── daktilo yazısı ── */}
      <div className="mt-9 flex h-10 items-center">
        {asama === "yaziliyor" && (
          <span className="font-mono text-2xl font-medium tracking-tight text-white">
            {yazilan}
            <i className="imlec-beyaz" aria-hidden="true" />
          </span>
        )}
      </div>

      {/* ── üretim hattı bandı ── */}
      <div
        className={`mt-14 transition-opacity duration-500
                    ${asama === "giris" ? "opacity-0" : "opacity-100"}`}
      >
        <UretimHatti />
      </div>

      <button
        onClick={bitir}
        className="absolute bottom-[max(2.5rem,env(safe-area-inset-bottom))] rounded-full border border-white/20 px-5 py-2
                   text-sm text-white/60 transition-colors
                   hover:border-white/40 hover:text-white"
      >
        Geç
      </button>
    </div>
  );
}

/**
 * Üretim hattı: bir bant üzerinde ilerleyen birimler.
 *
 * Konveyör çizgisi sabit, üstündeki kutular soldan sağa akar ve
 * kaybolur. Fabrikadan çıkan ürünleri anlatır — gösterişsiz,
 * tek renk, sürekli.
 */
function UretimHatti() {
  const birimler = [0, 1, 2, 3, 4, 5];
  return (
    <div className="relative h-8 w-[280px] overflow-hidden" aria-hidden="true">
      {/* bant */}
      <div className="absolute bottom-2 left-0 right-0 h-px bg-white/25" />
      {/* bant üzerindeki işaretler */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="block h-1 w-px bg-white/15" />
        ))}
      </div>
      {/* akan birimler */}
      {birimler.map((i) => (
        <span
          key={i}
          className="hat-birim absolute bottom-[9px] block h-3 w-3 border border-white/70"
          style={{ animationDelay: `${i * 0.55}s` }}
        />
      ))}
    </div>
  );
}
