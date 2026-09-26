import { NavLink } from "react-router-dom";
import {
  LayoutGrid, Map, Users, BatteryCharging, Cpu, AlertTriangle,
  ShieldCheck, Factory, MessageSquare, UserPlus,
} from "lucide-react";

/**
 * Kenar çubuğu.
 *
 * Üstte marka bloğu (logo + "Dennis Enerji / Üretici Paneli") yok.
 * Referans alınan B2B ürünlerde (Linear, Vercel, Stripe) navigasyon
 * doğrudan başlar; marka tekrarı sayfa başına bir kez, en üst
 * seviyede yeterlidir — her ekranda tekrar etmez.
 */

const baglar = [
  { yol: "/",            ad: "Genel İzleme", ikon: LayoutGrid },
  { yol: "/harita",      ad: "Harita",       ikon: Map },
  { yol: "/basvurular", ad: "Başvurular", ikon: UserPlus },
  { yol: "/musteriler",  ad: "Müşteriler",   ikon: Users },
  { yol: "/akuler",      ad: "Aküler",       ikon: BatteryCharging },
  { yol: "/inverterler", ad: "İnverterler",  ikon: Cpu },
  { yol: "/arizalar",    ad: "Arızalar",     ikon: AlertTriangle },
  { yol: "/garanti",     ad: "Garanti",      ikon: ShieldCheck },
  { yol: "/uretim",      ad: "Üretim",       ikon: Factory },
  { yol: "/asistan",     ad: "Asistan",      ikon: MessageSquare },
];

export default function Kenar({ acikMi, kapat }) {
  return (
    <>
      {acikMi && (
        <div className="fixed inset-0 z-30 bg-metin/40 lg:hidden" onClick={kapat} />
      )}
      <aside
        className={`fixed left-0 top-[22px] bottom-0 z-40 flex w-60 flex-col border-r border-cizgi
                    bg-panel pt-4 transition-transform lg:translate-x-0
                    ${acikMi ? "translate-x-0" : "-translate-x-full"}`}
      >
        <nav className="flex-1 overflow-y-auto px-2">
          {baglar.map(({ yol, ad, ikon: Ikon }) => (
            <NavLink
              key={yol}
              to={yol}
              end={yol === "/"}
              onClick={kapat}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "border-metin bg-panel2 text-metin"
                    : "border-transparent text-soluk hover:bg-panel2 hover:text-metin"
                }`
              }
            >
              <Ikon size={16} strokeWidth={1.75} />
              {ad}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
