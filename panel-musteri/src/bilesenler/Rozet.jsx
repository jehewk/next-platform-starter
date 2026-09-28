const renk = {
  saglikli: "text-saglikli bg-saglikli/10 ring-saglikli/25",
  uyari:    "text-uyari bg-uyari/10 ring-uyari/25",
  kritik:   "text-kritik bg-kritik/10 ring-kritik/25",
  bilgi:    "text-bilgi bg-bilgi/10 ring-bilgi/25",
  notr:     "text-soluk bg-panel2 ring-cizgi",
};

export function Rozet({ durum, cocuk }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5
                      text-xs font-medium ring-1 ring-inset ${renk[durum] || renk.notr}`}>
      <i className="block h-1.5 w-1.5 rounded-full bg-current" />
      {cocuk}
    </span>
  );
}

export function SaglikCubugu({ deger, durum, ince = false }) {
  const dolgu = { saglikli: "bg-saglikli", uyari: "bg-uyari", kritik: "bg-kritik",
                  bilgi: "bg-bilgi", notr: "bg-sonuk" }[durum] || "bg-sonuk";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-cizgi ${ince ? "h-1" : "h-1.5"}`}>
      <div className={`h-full rounded-full ${dolgu}`} style={{ width: `${Math.max(2, deger)}%` }} />
    </div>
  );
}
