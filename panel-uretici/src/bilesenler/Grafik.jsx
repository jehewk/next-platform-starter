import { useEtkinTema } from "../api/ayarlar";

/**
 * Recharts CSS sınıfı alamadığından tema renkleri burada tutulur.
 * Değerler index.css'teki değişkenlerle aynıdır.
 */
export function useGrafikRenkleri() {
  const tema = useEtkinTema();
  return tema === "acik"
    ? { izgara: "#E4E4E7", eksen: "#71717A", seri: "#2563EB", seriDolgu: "#2563EB",
        ipucuZemin: "#FFFFFF", ipucuCizgi: "#E4E4E7", metin: "#09090B", soluk: "#52525B",
        saglikli: "#15803D", uyari: "#B45309", kritik: "#B91C1C", notr: "#A1A1AA", yuzey: "#FFFFFF" }
    : { izgara: "#27272A", eksen: "#71717A", seri: "#60A5FA", seriDolgu: "#3B82F6",
        ipucuZemin: "#18181B", ipucuCizgi: "#3F3F46", metin: "#F4F4F5", soluk: "#A1A1AA",
        saglikli: "#22C55E", uyari: "#F59E0B", kritik: "#EF4444", notr: "#52525B", yuzey: "#111113" };
}

/** Recharts için ortak ipucu kutusu. */
export function Ipucu({ active, payload, label, bicim = (v) => v, etiket }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-cizgi bg-panel2 px-3 py-2 text-xs shadow-yuzen">
      {label != null && <div className="mb-1 text-sonuk">{etiket ? etiket(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <i className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.renk }} />
          <span className="text-soluk">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-metin">{bicim(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
