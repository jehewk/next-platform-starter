import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { acikPost } from "../api/istemci";

/**
 * Doğrulama kodu alanı.
 *
 * Kod sunucuda üretilir ve SVG olarak gelir; tarayıcıda üretilseydi
 * bir bot metni doğrudan okurdu. Her 30 saniyede kendini yeniler,
 * süre çubuğu kalan zamanı gösterir.
 *
 * Bunun koruduğu şey otomatik deneme yapan botlardır; şifresi ele
 * geçmiş bir hesabı korumaz (kodu saldırgan da görür).
 *
 * Üst bileşene token + yazılan cevabı verir; giriş isteği ikisini
 * birlikte gönderir, doğrulama sunucuda yapılır.
 */
export default function Kaptcha({ deger, onChange, onToken }) {
  const [svg, setSvg] = useState(null);
  const [kalan, setKalan] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(false);
  const sayacRef = useRef(null);

  const yenile = useCallback(async () => {
    setYukleniyor(true);
    try {
      const c = await acikPost("/de/kaptcha", {});
      setSvg(c.svg);
      onToken(c.token);
      onChange("");
      setKalan(c.saniye || 30);
    } catch {
      setSvg(null);
      onToken("");
    } finally {
      setYukleniyor(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { yenile(); }, [yenile]);

  // Süre dolunca kendiliğinden yeni kod alınır.
  useEffect(() => {
    clearInterval(sayacRef.current);
    if (kalan <= 0) return;
    sayacRef.current = setInterval(() => {
      setKalan((k) => {
        if (k <= 1) { yenile(); return 0; }
        return k - 1;
      });
    }, 1000);
    return () => clearInterval(sayacRef.current);
  }, [kalan, yenile]);

  return (
    <div>
      <label className="etiket">Doğrulama kodu</label>
      <div className="flex items-stretch gap-2">
        <input
          value={deger}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="Kodu yazın"
          className="girdi min-w-0 flex-1"
        />

        <div className="relative shrink-0 overflow-hidden rounded-md border border-cizgi bg-zemin" style={{ width: 132, height: 40 }}>
          {svg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                 dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="flex h-full items-center justify-center bg-panel2 text-2xs text-sonuk">
              {yukleniyor ? "kod alınıyor…" : "kod alınamadı"}
            </div>
          )}
          {/* kalan süre çubuğu */}
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-cizgi">
            <div className="h-full bg-soluk transition-[width] duration-1000 ease-linear"
                 style={{ width: `${(kalan / 30) * 100}%` }} />
          </div>
        </div>

        <button type="button" onClick={yenile} title="Yeni kod"
          className="dugme-hayalet shrink-0 px-2">
          <RefreshCw size={15} strokeWidth={1.75} className={yukleniyor ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="mt-1.5 text-2xs text-sonuk">
        Kod {kalan > 0 ? `${kalan} saniye sonra` : "birazdan"} yenilenir · büyük/küçük harf önemli değil
      </p>
    </div>
  );
}
