import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Kenar from "./bilesenler/Kenar";
import GenelBakis from "./sayfalar/GenelBakis";
import Harita from "./sayfalar/Harita";
import Musteriler from "./sayfalar/Musteriler";
import Basvurular from "./sayfalar/Basvurular";
import MusteriDetay from "./sayfalar/MusteriDetay";
import CihazListesi from "./sayfalar/CihazListesi";
import AkuDetay from "./sayfalar/AkuDetay";
import InverterDetay from "./sayfalar/InverterDetay";
import Arizalar from "./sayfalar/Arizalar";
import Garanti from "./sayfalar/Garanti";
import Uretim from "./sayfalar/Uretim";
import Asistan from "./sayfalar/Asistan";
import Intro from "./bilesenler/Intro";
import Giris from "./sayfalar/Giris";
import HataSiniri from "./bilesenler/HataSiniri";
import { oturumOku } from "./api/oturum";

/**
 * Derleme izi.
 *
 * Aynı ekranda birden fazla proje kopyası, önbelleğe alınmış bir
 * sekme veya arka planda unutulmuş bir eski `npm run dev` süreci
 * karışabiliyor — kullanıcı "eminim doğru klasördeyim" dese bile.
 *
 * Bu şerit her ekranda (intro, giriş, panel — hiçbir istisna olmadan)
 * sabit durur ve build anının gerçek saatini gösterir. Görmüyorsa
 * veya eski bir saat görüyorsa, sorun kesinlikle bu derleme değil.
 */
function DerlemeIzi() {
  return (
    <div className="fixed inset-x-0 top-0 z-[999] h-[22px] overflow-hidden truncate whitespace-nowrap bg-red-600 px-2 py-1 text-center font-mono text-2xs leading-[14px] text-white">
      DERLEME: {typeof __BUILD_ZAMANI__ !== "undefined" ? __BUILD_ZAMANI__ : "?"} — bu şeridi görmüyorsan yanlış sekme/klasördesin
    </div>
  );
}

export default function App() {
  const [introBitti, setIntroBitti] = useState(false);

  if (!introBitti) return (
    <>
      <DerlemeIzi />
      <Intro bitince={() => setIntroBitti(true)} />
    </>
  );

  return (
    <>
      <DerlemeIzi />
      <HataSiniri>
        <BrowserRouter>
          <Routes>
            <Route path="/giris" element={<Giris />} />
            <Route path="/*" element={<Korumali><Uygulama /></Korumali>} />
          </Routes>
        </BrowserRouter>
      </HataSiniri>
    </>
  );
}

/** Oturum yoksa giriş ekranına yönlendirir. */
function Korumali({ children }) {
  const konum = useLocation();
  if (!oturumOku()) {
    return <Navigate to="/giris" replace state={{ donus: konum.pathname }} />;
  }
  return children;
}

function Uygulama() {
  const [menuAcik, setMenuAcik] = useState(false);
  const konum = useLocation();

  useEffect(() => { setMenuAcik(false); }, [konum.pathname]);

  return (
    <div className="min-h-full">
      <Kenar acikMi={menuAcik} kapat={() => setMenuAcik(false)} />

      <div className="lg:pl-60">
        <header className="flex items-center gap-3 border-b border-cizgi bg-panel px-4 py-3 lg:hidden">
          <button onClick={() => setMenuAcik(true)} aria-label="Menüyü aç"
            className="text-soluk transition-colors hover:text-metin">
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <span className="text-sm font-medium text-metin">Dennis Enerji</span>
        </header>

        <main className="p-4 lg:p-6">
          <Routes>
            <Route path="/"              element={<GenelBakis />} />
            <Route path="/harita"        element={<Harita />} />
            <Route path="/basvurular" element={<Basvurular />} />
          <Route path="/musteriler"    element={<Musteriler />} />
            <Route path="/musteri/:id"   element={<MusteriDetay />} />
            <Route path="/akuler"        element={<CihazListesi tip="aku" />} />
            <Route path="/inverterler"   element={<CihazListesi tip="inverter" />} />
            <Route path="/aku/:id"       element={<AkuDetay />} />
            <Route path="/inverter/:id"  element={<InverterDetay />} />
            <Route path="/arizalar"      element={<Arizalar />} />
            <Route path="/garanti"       element={<Garanti />} />
            <Route path="/uretim"        element={<Uretim />} />
            <Route path="/asistan"       element={<Asistan />} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
