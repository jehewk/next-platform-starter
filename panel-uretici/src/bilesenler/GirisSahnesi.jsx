import { useEffect, useState } from "react";

/**
 * Giriş ekranı sahnesi.
 *
 * Arka plan: duvarda inverter, yanında Dennis akü, kablolarla lambaya
 * bağlı (giris-arkaplan.webp). Fotoğrafın üzerine, AYNI koordinat
 * sisteminde bir SVG katmanı çizilir:
 *   · kabloların üstünden akan mavi enerji (kesikli çizgi + parçacık)
 *   · lamba kubbesinde nefes alan ışık, zeminde ona eşlik eden ışık halkası
 *
 * Koordinatlar fotoğraftan piksel analiziyle ölçüldü (kablo güzergâhı,
 * lamba merkezi); görsel <image> olarak SVG'nin içinde durduğu için
 * ekran boyutu ne olursa olsun katmanlar kaymadan üst üste oturur.
 *
 * Geniş ekranda sahne ekranı doldurur (sağdaki siyah alan forma kalır).
 * Dar/dikey ekranda (telefon) sahnenin tamamı üstte gösterilir, form
 * altta kalan siyah alana gelir — aksi halde lamba kadraj dışında kalırdı.
 */

const G = 1365, Y = 702;              // görselin (kırpılmış) boyutu
const ZEMIN = "#020303";              // fotoğrafın sağ/alt siyahı

// inverter → akü → lamba  (ölçülmüş güzergâhlar)
const KABLOLAR = [
  { id: "k-inv-aku-k", d: "M97 389 L97 404 L186 404",              renk: "#5FC9FF", gecikme: 0 },
  { id: "k-inv-aku-m", d: "M92 392 L186 395",                      renk: "#5FC9FF", gecikme: 0.5 },
  { id: "k-aku-lmb-k", d: "M252 396 L265 396 L265 519 L450 519",   renk: "#5FC9FF", gecikme: 0.9 },
  { id: "k-aku-lmb-m", d: "M252 405 L258.5 405 L258.5 524 L450 524", renk: "#5FC9FF", gecikme: 1.3 },
];

function useGenisMi() {
  const olc = () => (typeof window === "undefined" ? true : window.innerWidth / window.innerHeight > 0.95);
  const [genis, setGenis] = useState(olc);
  useEffect(() => {
    const f = () => setGenis(olc());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return genis;
}

export default function GirisSahnesi() {
  const genis = useGenisMi();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: ZEMIN }} aria-hidden="true">
      <svg
        // Telefonda yalnızca dolu bölge (inverter → lamba → zemin ışığı)
        // gösterilir; tüm fotoğraf sığdırılırsa sahne küçücük kalıyordu.
        viewBox={genis ? `0 0 ${G} ${Y}` : "30 240 590 360"}
        preserveAspectRatio={genis ? "xMinYMid slice" : "xMidYMin meet"}
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="lambaIsik" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.40" />
            <stop offset="35%" stopColor="#FFF6E0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#FFF6E0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="zeminIsik" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <filter id="parilti" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.1" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <image href="/gorseller/giris-arkaplan.webp" x="0" y="0" width={G} height={Y} />

        {/* ── zeminde lambaya eşlik eden ışık halkası ── */}
        <ellipse cx="720" cy="572" rx="470" ry="58" fill="url(#zeminIsik)" style={{ mixBlendMode: "screen" }}>
          <animate attributeName="opacity" values="0.25;0.55;0.25" dur="4.6s" repeatCount="indefinite" />
        </ellipse>

        {/* ── lamba: nefes alan ışık ── */}
        <circle cx="492" cy="336" r="132" fill="url(#lambaIsik)" style={{ mixBlendMode: "screen" }}>
          <animate attributeName="r" values="120;146;120" dur="4.6s" repeatCount="indefinite"
                   calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />
          <animate attributeName="opacity" values="0.30;0.62;0.30" dur="4.6s" repeatCount="indefinite"
                   calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />
        </circle>

        {/* ── kablolar: akan kesikli enerji çizgisi ── */}
        {KABLOLAR.map((k) => (
          <path key={k.id} id={k.id} d={k.d} fill="none" stroke={k.renk} strokeWidth="2"
                strokeLinecap="round" strokeDasharray="5 18" opacity="0.55" filter="url(#parilti)">
            <animate attributeName="stroke-dashoffset" from="46" to="0" dur="0.9s" repeatCount="indefinite" />
          </path>
        ))}

        {/* ── kablolar: üzerlerinde ilerleyen enerji parçacıkları ── */}
        {KABLOLAR.flatMap((k) =>
          [0, 1.1].map((ek, i) => (
            <circle key={`${k.id}-${i}`} r="3.4" fill="#BDEBFF" filter="url(#parilti)" opacity="0">
              <animateMotion dur="2.2s" repeatCount="indefinite" begin={`${k.gecikme + ek}s`}>
                <mpath href={`#${k.id}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1"
                       dur="2.2s" repeatCount="indefinite" begin={`${k.gecikme + ek}s`} />
            </circle>
          ))
        )}

        {!genis && (
          <>
            <linearGradient id="altErime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ZEMIN} stopOpacity="0" />
              <stop offset="100%" stopColor={ZEMIN} stopOpacity="1" />
            </linearGradient>
            <rect x="0" y="545" width={G} height="56" fill="url(#altErime)" />
            {/* viewBox'un altında kalan fotoğraf parçası sert bir bant yapmasın */}
            <rect x="0" y="600" width={G} height="400" fill={ZEMIN} />
          </>
        )}

        {/* ── inverter ekranı ve akü göstergesi: hafif canlılık ── */}
        <rect x="64" y="302" width="46" height="18" rx="2" fill="#E8FF6A" opacity="0" style={{ mixBlendMode: "screen" }}>
          <animate attributeName="opacity" values="0;0.28;0" dur="2.6s" repeatCount="indefinite" />
        </rect>
        <circle cx="216" cy="397" r="5" fill="#5FC9FF" filter="url(#parilti)" opacity="0.4">
          <animate attributeName="opacity" values="0.25;0.9;0.25" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>

    </div>
  );
}
