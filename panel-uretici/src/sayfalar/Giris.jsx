import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { girisYap } from "../api/oturum";
import Logo from "../bilesenler/Logo";
import GirisSahnesi from "../bilesenler/GirisSahnesi";
import Kaptcha from "../bilesenler/Kaptcha";

/**
 * Giriş ekranı.
 *
 * Arka planda inverter–akü–lamba sahnesi; form sahnenin sağındaki
 * siyah alana yukarıdan süzülerek gelir. Telefonda sahne üstte kalır,
 * form altındaki siyah alana yerleşir.
 */
export default function Giris() {
  const git = useNavigate();
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
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
      git("/", { replace: true });
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020303]">
      <GirisSahnesi />

      {/* Telefonda sahne üstte ~%56vw yükseklik kaplar; form hemen altına oturur. */}
      <div className="relative z-10 flex min-h-screen items-start justify-center px-5 pb-8 pt-[64vw]
                      sm:items-center sm:justify-end sm:pb-0 sm:pr-[7%] sm:pt-0 lg:pr-[9%]">
        <form
          onSubmit={gonder}
          className="form-gir w-full max-w-sm border border-white/12 bg-[#08090A] p-7
                     shadow-[0_30px_80px_rgba(0,0,0,.65)]"
        >
          <div className="flex items-center gap-2.5">
            <Logo boyut={28} />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">Dennis Enerji</div>
              <div className="text-xs text-white/50">Üretici Paneli</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-medium text-white/60">E-posta</label>
              <input
                type="email" required autoFocus value={eposta}
                onChange={(e) => setEposta(e.target.value)}
                className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white
                           outline-none transition-colors placeholder:text-white/30 focus:border-white/40"
                placeholder="ornek@dennisenerji.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Şifre</label>
              <input
                type="password" required value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white
                           outline-none transition-colors focus:border-white/40"
              />
            </div>
            <Kaptcha deger={kod} onChange={setKod} onToken={setKaptchaToken} />
          </div>

          {hata && <p className="mt-3 text-xs text-red-400">{hata}</p>}

          <button
            type="submit" disabled={gonderiliyor}
            className="mt-5 w-full bg-white py-2.5 text-sm font-medium text-black
                       transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {gonderiliyor ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>

        </form>
      </div>
    </div>
  );
}
