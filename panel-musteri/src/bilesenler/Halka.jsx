/** Yüzde halkası (akü şarjı). yuzde null ise boş halka ve "—". */
const RENK = { saglikli: "rgb(var(--saglikli))", uyari: "rgb(var(--uyari))", kritik: "rgb(var(--kritik))", sonuk: "rgb(var(--sonuk))" };

export default function Halka({ yuzde, renk = "saglikli", etiket, boyut = 104 }) {
  const r = 42, cevre = 2 * Math.PI * r;
  const dolu = yuzde == null ? 0 : Math.max(0, Math.min(100, yuzde));
  return (
    <div className="relative shrink-0" style={{ width: boyut, height: boyut }}
         role="img" aria-label={yuzde == null ? "Şarj bilinmiyor" : `Şarj yüzde ${dolu}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" style={{ stroke: "rgb(var(--cizgi))" }} />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={cevre * (1 - dolu / 100)}
          style={{ stroke: RENK[renk], transition: "stroke-dashoffset 600ms ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums leading-none">{yuzde == null ? "—" : `%${dolu}`}</span>
        {etiket && <span className="mt-1 text-[11px] text-sonuk">{etiket}</span>}
      </div>
    </div>
  );
}
