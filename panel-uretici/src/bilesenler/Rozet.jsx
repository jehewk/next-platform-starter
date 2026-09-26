const renk = {
  saglikli: "text-saglikli border-saglikli/35 bg-saglikli/10",
  uyari:    "text-uyari border-uyari/35 bg-uyari/10",
  kritik:   "text-kritik border-kritik/35 bg-kritik/10",
  bilgi:    "text-bilgi border-bilgi/35 bg-bilgi/10",
  notr:     "text-sonuk border-cizgi bg-panel2",
};

export function Rozet({ durum, cocuk }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium ${renk[durum] || renk.notr}`}>
      <i className="block h-1.5 w-1.5 rounded-full bg-current" />
      {cocuk}
    </span>
  );
}

export function SaglikCubugu({ deger, durum, ince = false }) {
  const dolgu = { saglikli: "bg-saglikli", uyari: "bg-uyari", kritik: "bg-kritik",
                  bilgi: "bg-bilgi", notr: "bg-sonuk" }[durum] || "bg-sonuk";
  return (
    <div className={`w-full bg-cizgi ${ince ? "h-0.5" : "h-1"}`}>
      <div className={`h-full ${dolgu}`} style={{ width: `${Math.max(2, deger)}%` }} />
    </div>
  );
}
