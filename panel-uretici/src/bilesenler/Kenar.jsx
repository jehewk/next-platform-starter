import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Map, Users, BatteryCharging, Cpu, AlertTriangle, ShieldCheck,
  Factory, MessageSquare, UserPlus, Settings, LogOut, ChevronsUpDown,
} from "lucide-react";
import Logo from "./Logo";
import { oturumOku, oturumSil } from "../api/oturum";
import { useAyarlar } from "../api/ayarlar";

export const GRUPLAR = [
  { ad: "İzleme", baglar: [
    { yol: "/",            ad: "Genel Bakış",  ikon: LayoutGrid },
    { yol: "/harita",      ad: "Harita",       ikon: Map },
    { yol: "/arizalar",    ad: "Arızalar",     ikon: AlertTriangle },
  ] },
  { ad: "Envanter", baglar: [
    { yol: "/akuler",      ad: "Aküler",       ikon: BatteryCharging },
    { yol: "/inverterler", ad: "İnverterler",  ikon: Cpu },
    { yol: "/uretim",      ad: "Üretim",       ikon: Factory },
  ] },
  { ad: "Müşteri", baglar: [
    { yol: "/musteriler",  ad: "Müşteriler",   ikon: Users },
    { yol: "/basvurular",  ad: "Başvurular",   ikon: UserPlus },
    { yol: "/garanti",     ad: "Garanti",      ikon: ShieldCheck },
  ] },
  { ad: "Araçlar", baglar: [
    { yol: "/asistan",     ad: "Sohbet",       ikon: MessageSquare },
    { yol: "/ayarlar",     ad: "Ayarlar",      ikon: Settings },
  ] },
];

export default function Kenar({ acikMi, kapat }) {
  return (
    <>
      {acikMi && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={kapat} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-cizgi bg-zemin
                    transition-transform lg:translate-x-0 ${acikMi ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo boyut={26} zeminRenk="rgb(var(--metin))" renk="rgb(var(--zemin))" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Dennis Enerji</div>
            <div className="text-2xs text-sonuk">Üretici Paneli</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {GRUPLAR.map((g) => (
            <div key={g.ad}>
              <div className="mb-1 px-2 text-2xs font-medium uppercase tracking-wider text-sonuk">{g.ad}</div>
              {g.baglar.map(({ yol, ad, ikon: Ikon }) => (
                <NavLink
                  key={yol} to={yol} end={yol === "/"} onClick={kapat}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive ? "bg-panel2 font-medium text-metin" : "text-soluk hover:bg-panel2/60 hover:text-metin"}`}
                >
                  <Ikon size={16} strokeWidth={1.75} />
                  {ad}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <KullaniciMenusu />
      </aside>
    </>
  );
}

function KullaniciMenusu() {
  const git = useNavigate();
  const { ayarlar } = useAyarlar();
  const oturum = oturumOku();
  const [acik, setAcik] = useState(false);
  const ref = useRef(null);
  const eposta = oturum?.eposta || "";
  const ad = ayarlar.gorunenAd || eposta.split("@")[0] || "Kullanıcı";

  useEffect(() => {
    if (!acik) return;
    const f = (e) => !ref.current?.contains(e.target) && setAcik(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [acik]);

  function cikis() {
    oturumSil();
    git("/giris", { replace: true });
  }

  return (
    <div ref={ref} className="relative border-t border-cizgi p-3">
      {acik && (
        <div className="absolute bottom-full left-3 right-3 mb-1 animate-belir overflow-hidden rounded-lg border border-cizgi bg-panel p-1 shadow-yuzen">
          <button onClick={() => { setAcik(false); git("/ayarlar"); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-soluk hover:bg-panel2 hover:text-metin">
            <Settings size={15} /> Ayarlar
          </button>
          <button onClick={cikis}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-soluk hover:bg-panel2 hover:text-kritik">
            <LogOut size={15} /> Çıkış yap
          </button>
        </div>
      )}
      <button onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-panel2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs font-semibold uppercase ring-1 ring-cizgi">
          {ad.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{ad}</span>
          <span className="block truncate text-2xs text-sonuk">
            {oturum?.demo ? "Demo oturumu" : eposta}
          </span>
        </span>
        <ChevronsUpDown size={14} className="text-sonuk" />
      </button>
    </div>
  );
}
