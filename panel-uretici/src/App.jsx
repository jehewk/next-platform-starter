import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Kenar from "./bilesenler/Kenar";
import UstCubuk from "./bilesenler/UstCubuk";
import KomutPaleti from "./bilesenler/KomutPaleti";
import SohbetCekmecesi from "./bilesenler/SohbetCekmecesi";
import HataSiniri from "./bilesenler/HataSiniri";
import Intro from "./bilesenler/Intro";
import AltMenu from "./bilesenler/AltMenu";
import { ToastSaglayici } from "./bilesenler/Toast";
import { Iskelet } from "./bilesenler/VeriDurumu";
import Giris from "./sayfalar/Giris";
import SifreSifirla from "./sayfalar/SifreSifirla";
import { oturumOku } from "./api/oturum";
import { AyarlarSaglayici } from "./api/ayarlar";
import { SohbetSaglayici } from "./api/sohbetler";

// Sayfalar ayrı parçalar halinde yüklenir; harita ve grafik kütüphaneleri
// yalnızca gerektiğinde indirilir.
const GenelBakis    = lazy(() => import("./sayfalar/GenelBakis"));
const Harita        = lazy(() => import("./sayfalar/Harita"));
const Musteriler    = lazy(() => import("./sayfalar/Musteriler"));
const MusteriDetay  = lazy(() => import("./sayfalar/MusteriDetay"));
const Basvurular    = lazy(() => import("./sayfalar/Basvurular"));
const CihazListesi  = lazy(() => import("./sayfalar/CihazListesi"));
const AkuDetay      = lazy(() => import("./sayfalar/AkuDetay"));
const InverterDetay = lazy(() => import("./sayfalar/InverterDetay"));
const Arizalar      = lazy(() => import("./sayfalar/Arizalar"));
const Garanti       = lazy(() => import("./sayfalar/Garanti"));
const Uretim        = lazy(() => import("./sayfalar/Uretim"));
const Asistan       = lazy(() => import("./sayfalar/Asistan"));
const Ayarlar       = lazy(() => import("./sayfalar/Ayarlar"));

const INTRO_ANAHTAR = "de_intro_goruldu";

function introGosterilsinMi() {
  try { return !sessionStorage.getItem(INTRO_ANAHTAR); } catch { return false; }
}

export default function App() {
  const [intro, setIntro] = useState(introGosterilsinMi);

  function introBitti() {
    try { sessionStorage.setItem(INTRO_ANAHTAR, "1"); } catch { /* gizli sekme */ }
    setIntro(false);
  }

  if (intro) return <Intro bitince={introBitti} />;

  return (
    <HataSiniri>
      <AyarlarSaglayici>
       <ToastSaglayici>
        <BrowserRouter>
          <Routes>
            <Route path="/giris" element={<Giris />} />
            <Route path="/sifre-sifirla" element={<SifreSifirla />} />
            <Route path="/*" element={<Korumali><SohbetSaglayici><Uygulama /></SohbetSaglayici></Korumali>} />
          </Routes>
        </BrowserRouter>
       </ToastSaglayici>
      </AyarlarSaglayici>
    </HataSiniri>
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
  const [paletAcik, setPaletAcik] = useState(false);
  const [sohbetAcik, setSohbetAcik] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setMenuAcik(false); }, [pathname]);

  useEffect(() => {
    const f = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); setPaletAcik((a) => !a); }
      if (k === "j") { e.preventDefault(); setSohbetAcik((a) => !a); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const sohbetSayfasi = pathname.startsWith("/asistan");

  return (
    <div className="min-h-full">
      <Kenar acikMi={menuAcik} kapat={() => setMenuAcik(false)} />

      <div className="lg:pl-60">
        <UstCubuk
          menuAc={() => setMenuAcik(true)}
          paletAc={() => setPaletAcik(true)}
          sohbetAc={() => setSohbetAcik(true)}
        />
        {/* Telefonda alt menünün altında içerik kalmasın diye alt boşluk bırakılır. */}
        <main className={sohbetSayfasi
          ? "p-4 lg:p-6"
          : "mx-auto max-w-[1400px] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:p-6"}>
          <Suspense fallback={<Iskelet satir={3} />}>
            <Routes>
              <Route path="/"             element={<GenelBakis />} />
              <Route path="/harita"       element={<Harita />} />
              <Route path="/basvurular"   element={<Basvurular />} />
              <Route path="/musteriler"   element={<Musteriler />} />
              <Route path="/musteri/:id"  element={<MusteriDetay />} />
              <Route path="/akuler"       element={<CihazListesi tip="aku" />} />
              <Route path="/inverterler"  element={<CihazListesi tip="inverter" />} />
              <Route path="/aku/:id"      element={<AkuDetay />} />
              <Route path="/inverter/:id" element={<InverterDetay />} />
              <Route path="/arizalar"     element={<Arizalar />} />
              <Route path="/garanti"      element={<Garanti />} />
              <Route path="/uretim"       element={<Uretim />} />
              <Route path="/asistan"      element={<Asistan />} />
              <Route path="/ayarlar"      element={<Ayarlar />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <AltMenu menuAc={() => setMenuAcik(true)} />
      <KomutPaleti acik={paletAcik} kapat={() => setPaletAcik(false)} />
      <SohbetCekmecesi acik={sohbetAcik && !sohbetSayfasi} kapat={() => setSohbetAcik(false)} />
    </div>
  );
}
