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
export default function Kaptcha({ deger, onChange, onToken, karanlik = true }) {
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

  const c = karanlik
    ? { etiket: "text-white/60", giris: "border-white/15 bg-white/5 text-white focus:border-white/40",
        cerceve: "border-white/15", dugme: "text-white/50 hover:text-white", cubuk: "bg-white/40", zemin: "bg-white/10" }
    : { etiket: "text-soluk", giris: "border-cizgi bg-panel text-metin focus:border-soluk",
        cerceve: "border-cizgi", dugme: "text-sonuk hover:text-metin", cubuk: "bg-metin/50", zemin: "bg-cizgi" };

  return (
    <div>
      <label className={`text-xs font-medium ${c.etiket}`}>Doğrulama kodu</label>
      <div className="mt-1 flex items-stretch gap-2">
        <input
          value={deger}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="Kodu yazın"
          className={`min-w-0 flex-1 border px-3 py-2 text-sm outline-none transition-colors
                      placeholder:text-white/25 ${c.giris}`}
        />

        <div className={`relative shrink-0 overflow-hidden border ${c.cerceve}`} style={{ width: 150, height: 46 }}>
          {svg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                 dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="flex h-full items-center justify-center text-2xs text-white/40">
              {yukleniyor ? "kod alınıyor…" : "kod alınamadı"}
            </div>
          )}
          {/* kalan süre çubuğu */}
          <div className={`absolute bottom-0 left-0 h-[2px] ${c.zemin} w-full`}>
            <div className={`h-full ${c.cubuk} transition-[width] duration-1000 ease-linear`}
                 style={{ width: `${(kalan / 30) * 100}%` }} />
          </div>
        </div>

        <button type="button" onClick={yenile} title="Yeni kod"
          className={`shrink-0 px-2 transition-colors ${c.dugme}`}>
          <RefreshCw size={15} strokeWidth={1.75} className={yukleniyor ? "animate-spin" : ""} />
        </button>
      </div>
      <p className={`mt-1 text-2xs ${karanlik ? "text-white/35" : "text-sonuk"}`}>
        Kod {kalan > 0 ? `${kalan} saniye sonra` : "birazdan"} yenilenir · büyük/küçük harf önemli değil
      </p>
    </div>
  );
}
