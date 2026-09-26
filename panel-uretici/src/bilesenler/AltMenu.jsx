import { NavLink } from "react-router-dom";
import { LayoutGrid, AlertTriangle, BatteryCharging, Users, Menu } from "lucide-react";

const OGELER = [
  { yol: "/",           ad: "Genel",      ikon: LayoutGrid },
  { yol: "/arizalar",   ad: "Arızalar",   ikon: AlertTriangle },
  { yol: "/akuler",     ad: "Cihazlar",   ikon: BatteryCharging },
  { yol: "/musteriler", ad: "Müşteriler", ikon: Users },
];

/** Telefonda ekranın altında sabit duran ana gezinme. */
export default function AltMenu({ menuAc }) {
  const sinif = (aktif) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
      aktif ? "text-metin" : "text-sonuk"}`;

  return (
    <nav aria-label="Alt menü"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-cizgi bg-zemin/95 pb-[env(safe-area-inset-bottom)]
                 backdrop-blur lg:hidden">
      {OGELER.map(({ yol, ad, ikon: Ikon }) => (
        <NavLink key={yol} to={yol} end={yol === "/"} className={({ isActive }) => sinif(isActive)}>
          {({ isActive }) => (
            <>
              <Ikon size={20} strokeWidth={isActive ? 2 : 1.75} />
              {ad}
            </>
          )}
        </NavLink>
      ))}
      <button onClick={menuAc} className={sinif(false)}>
        <Menu size={20} strokeWidth={1.75} />
        Menü
      </button>
    </nav>
  );
}
