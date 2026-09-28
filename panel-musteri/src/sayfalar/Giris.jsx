import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { girisYap } from "../api/oturum";
import Logo from "../bilesenler/Logo";
import Kaptcha from "../bilesenler/Kaptcha";

/** Müşteri girişi: düz siyah zemin, DE logosu, ortada form. */
export default function Giris() {
  const git = useNavigate();
  const konum = useLocation();
  const donus = konum.state?.donus && konum.state.donus !== "/giris" ? konum.state.donus : "/";

  const [eposta, setEposta] = useState(konum.state?.eposta || "");
  const [sifre, setSifre] = useState("");
  const [sifreGoster, setSifreGoster] = useState(false);
  const [kod, setKod] = useState("");
  const [kaptchaToken, setKaptchaToken] = useState("");
  const [hata, setHata] = useState(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(e) {
    e.preventDefault();
    setHata(null);
    setGonderiliyor(true);
    try {
      await girisYap(eposta.trim(), sifre, kaptchaToken, kod);
      git(donus, { replace: true });
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }


  return (
    <div className="flex min-h-screen flex-col bg-zemin">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo boyut={56} zeminli={false} renk="rgb(var(--metin))" />
            <h1 className="mt-5 text-xl font-semibold tracking-tight">Hesabınıza giriş yapın</h1>
            <p className="mt-1.5 text-sm text-soluk">Akünüzü ve inverterinizi her yerden izleyin.</p>
          </div>

          <form onSubmit={gonder} className="space-y-4 rounded-xl border border-cizgi bg-panel p-6">
            <div>
              <label htmlFor="eposta" className="etiket">E-posta</label>
              <input id="eposta" type="email" required autoFocus autoComplete="username"
                value={eposta} onChange={(e) => setEposta(e.target.value)}
                className="girdi" placeholder="ornek@eposta.com" />
            </div>
            <div>
              <label htmlFor="sifre" className="etiket">Şifre</label>
              <div className="relative">
                <input id="sifre" type={sifreGoster ? "text" : "password"} required autoComplete="current-password"
                  value={sifre} onChange={(e) => setSifre(e.target.value)} className="girdi pr-10" />
                <button type="button" onClick={() => setSifreGoster((g) => !g)}
                  aria-label={sifreGoster ? "Şifreyi gizle" : "Şifreyi göster"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-sonuk hover:text-metin">
                  {sifreGoster ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <Kaptcha deger={kod} onChange={setKod} onToken={setKaptchaToken} />

            {hata && (
              <p role="alert" className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">
                {hata}
              </p>
            )}

            <button type="submit" disabled={gonderiliyor} className="dugme-ana w-full">
              {gonderiliyor && <Loader2 size={15} className="animate-spin" />}
              {gonderiliyor ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>

          </form>

          <p className="mt-6 text-center text-xs text-sonuk">
            Hesabınız yok mu?{" "}
            <Link to="/kayit" className="font-medium text-metin underline underline-offset-4">Kayıt başvurusu yapın</Link>
          </p>
        </div>
      </main>
      <footer className="pb-6 text-center text-2xs text-sonuk">© {new Date().getFullYear()} Dennis Enerji</footer>
    </div>
  );
}
