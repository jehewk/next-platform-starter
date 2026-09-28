import { NavLink, useLocation } from "react-router-dom";
import { Home, Cpu, MessageCircle, LifeBuoy, User } from "lucide-react";
import Logo from "./Logo";

const SEKMELER = [
  { yol: "/",         ad: "Sistemim",  ikon: Home },
  { yol: "/cihazlar", ad: "Cihazlar",  ikon: Cpu },
  { yol: "/sohbet",   ad: "Sohbet",    ikon: MessageCircle },
  { yol: "/destek",   ad: "Destek",    ikon: LifeBuoy },
  { yol: "/hesap",    ad: "Hesabım",   ikon: User },
];

/**
 * Müşteri uygulamasının iskeleti. Telefonda altta sekme çubuğu,
 * geniş ekranda üstte yatay menü. Güvenli alan (çentik, ana ekran
 * çubuğu) boşlukları mağaza sürümünde de doğru kalır.
 */
export default function Kabuk({ children }) {
  const { pathname } = useLocation();
  const sohbet = pathname.startsWith("/sohbet");

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-cizgi bg-zemin/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Logo boyut={26} zeminli={false} renk="rgb(var(--metin))" />
          <span className="text-sm font-semibold">Dennis Energy</span>
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Ana menü">
            {SEKMELER.map(({ yol, ad, ikon: Ikon }) => (
              <NavLink key={yol} to={yol} end={yol === "/"}
                className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive ? "bg-panel2 font-medium text-metin" : "text-soluk hover:text-metin"}`}>
                <Ikon size={16} /> {ad}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className={sohbet
        ? "mx-auto max-w-3xl"
        : "mx-auto max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:pb-10"}>
        {children}
      </main>

      <nav aria-label="Sekmeler"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-cizgi bg-zemin/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {SEKMELER.map(({ yol, ad, ikon: Ikon }) => (
          <NavLink key={yol} to={yol} end={yol === "/"}
            className={({ isActive }) => `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive ? "text-metin" : "text-sonuk"}`}>
            {({ isActive }) => <><Ikon size={21} strokeWidth={isActive ? 2.1 : 1.7} />{ad}</>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
