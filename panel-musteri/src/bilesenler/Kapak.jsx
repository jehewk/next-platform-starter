import Logo from "./Logo";

/**
 * Marka kapak şeridi — tarayıcı sekmesindeki DE markasıyla aynı
 * (siyah zemin, beyaz DE). Telefon ve PC'de responsive.
 */
export default function Kapak() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black px-5 py-4 sm:py-5">
      <Logo boyut={40} zeminli={false} renk="#FFFFFF" className="shrink-0" />
      <div className="leading-tight">
        <div className="text-base font-semibold tracking-tight text-white sm:text-lg">Dennis Energy</div>
        <div className="text-xs text-white/60">Akü &amp; inverter izleme</div>
      </div>
    </div>
  );
}
