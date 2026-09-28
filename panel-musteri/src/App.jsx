import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Intro from "./bilesenler/Intro";
import HataSiniri from "./bilesenler/HataSiniri";
import Kabuk from "./bilesenler/Kabuk";
import { Iskelet } from "./bilesenler/VeriDurumu";
import { ToastSaglayici } from "./bilesenler/Toast";
import Giris from "./sayfalar/Giris";
import Kayit from "./sayfalar/Kayit";
import { oturumOku } from "./api/oturum";
import { AyarlarSaglayici } from "./api/ayarlar";
import { SohbetSaglayici } from "./api/sohbetler";

const AnaSayfa   = lazy(() => import("./sayfalar/AnaSayfa"));
const Cihazlar   = lazy(() => import("./sayfalar/Cihazlar"));
const CihazDetay = lazy(() => import("./sayfalar/CihazDetay"));
const Sohbet     = lazy(() => import("./sayfalar/Sohbet"));
const Destek     = lazy(() => import("./sayfalar/Destek"));
const Hesap      = lazy(() => import("./sayfalar/Hesap"));

const INTRO_ANAHTAR = "de_intro_goruldu";
const introGosterilsinMi = () => {
  try { return !sessionStorage.getItem(INTRO_ANAHTAR); } catch { return false; }
};

export default function App() {
  const [intro, setIntro] = useState(introGosterilsinMi);

  if (intro) {
    return <Intro bitince={() => {
      try { sessionStorage.setItem(INTRO_ANAHTAR, "1"); } catch { /* gizli sekme */ }
      setIntro(false);
    }} />;
  }

  return (
    <HataSiniri>
      <AyarlarSaglayici>
        <ToastSaglayici>
          <BrowserRouter>
            <Routes>
              <Route path="/giris" element={<Giris />} />
              <Route path="/kayit" element={<Kayit />} />
              <Route path="/*" element={<Korumali><SohbetSaglayici><Uygulama /></SohbetSaglayici></Korumali>} />
            </Routes>
          </BrowserRouter>
        </ToastSaglayici>
      </AyarlarSaglayici>
    </HataSiniri>
  );
}

function Korumali({ children }) {
  const konum = useLocation();
  if (!oturumOku()) return <Navigate to="/giris" replace state={{ donus: konum.pathname }} />;
  return children;
}

function Uygulama() {
  return (
    <Kabuk>
      <Suspense fallback={<Iskelet satir={3} />}>
        <Routes>
          <Route path="/"           element={<AnaSayfa />} />
          <Route path="/cihazlar"   element={<Cihazlar />} />
          <Route path="/cihaz/:id"  element={<CihazDetay />} />
          <Route path="/sohbet"     element={<Sohbet />} />
          <Route path="/destek"     element={<Destek />} />
          <Route path="/hesap"      element={<Hesap />} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Kabuk>
  );
}
