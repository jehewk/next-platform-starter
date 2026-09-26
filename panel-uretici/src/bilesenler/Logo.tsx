/**
 * Dennis Energy logosu — parçalı SVG.
 *
 * Logo beş parçadan oluşur ve her parça ayrı ayrı animasyona girebilir:
 *   · üst-sol ve alt-sol : "D" harfinin kavisini oluşturur, SOLDAN gelir
 *   · üst-sağ ve alt-sağ : paralelkenar diliimler, SAĞDAN gelir
 *   · orta               : tam genişlik bant, SAĞDAN gelir
 *
 * parcaliMi=false verilirse tek parça halinde çizilir (menü, favicon vb.).
 */

type Props = {
  boyut?: number;
  /** Parçalar ayrı <g> içinde mi çizilsin (animasyon için) */
  parcaliMi?: boolean;
  /** Arka plan karesi çizilsin mi */
  zeminli?: boolean;
  renk?: string;
  zeminRenk?: string;
  className?: string;
};

export const LOGO_PARCALARI = [
  /*  Logo bir "D" ve "E"nin birlesimi:
   *    sol parcalarin sag kenarlari bir daire yayi cizer  → D
   *    sag parcalar egik dilimler halinde uzanir           → E'nin kollari
   *    orta bant iki tarafi birlestirir
   */
  { ad: "ust-sol", yon: "sol" as const,
    d: "M16 55.2 L16 85.4 L84.2 83.9 L81.5 77.8 L69.2 64.3 L55.6 56.7 Z" },
  { ad: "ust-sag", yon: "sag" as const,
    d: "M73.3 55.2 L88.3 73.3 L93.8 85.4 L134.7 83.9 L138.8 55.2 Z" },
  { ad: "orta", yon: "sag" as const,
    d: "M16 129.1 L118.3 129.1 L123.8 99.0 L16 99.0 Z" },
  { ad: "alt-sol", yon: "sol" as const,
    d: "M16 172.9 L55.6 171.4 L70.6 162.3 L84.2 144.2 L16 142.7 Z" },
  { ad: "alt-sag", yon: "sag" as const,
    d: "M73.3 169.9 L73.3 172.9 L138.8 172.9 L138.8 163.8 L134.7 144.2 L95.1 142.7 L88.3 154.8 Z" },
];

export default function Logo({
  boyut = 48,
  parcaliMi = false,
  zeminli = true,
  renk = "#FFFFFF",
  zeminRenk = "#14202E",
  className = "",
}: Props) {
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 206 210"
      className={className}
      role="img"
      aria-label="Dennis Energy"
    >
      {zeminli && (
        <rect x="0" y="0" width="206" height="210" rx="50" style={{ fill: zeminRenk }} />
      )}
      <g transform={zeminli ? "translate(26 0)" : undefined}>
      {LOGO_PARCALARI.map((p) =>
        parcaliMi ? (
          <g key={p.ad} data-parca={p.ad} data-yon={p.yon}>
            <path d={p.d} style={{ fill: renk }} />
          </g>
        ) : (
          <path key={p.ad} d={p.d} style={{ fill: renk }} />
        )
      )}
      </g>
    </svg>
  );
}
