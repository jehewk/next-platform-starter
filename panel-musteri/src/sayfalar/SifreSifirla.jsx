import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { acikPost } from "../api/istemci";
import Logo from "../bilesenler/Logo";
import Kaptcha from "../bilesenler/Kaptcha";

/**
 * Şifremi unuttum (iki uygulamada aynı dosya).
 *  1) E-posta + doğrulama kodu → POST /de/sifre/unuttum: Cognito e-postaya 6 haneli kod yollar.
 *     Hesabın var olup olmadığı açığa vurulmaz (her durumda aynı yanıt).
 *  2) Kod + yeni şifre → POST /de/sifre/sifirla.
 */
function sifreSorunu(s) {
  if (s.length < 8) return "En az 8 karakter olmalı";
  if (!/[a-zçğıöşü]/.test(s)) return "Küçük harf içermeli";
  if (!/[A-ZÇĞİÖŞÜ]/.test(s)) return "Büyük harf içermeli";
  if (!/\d/.test(s)) return "Rakam içermeli";
  return null;
}

export default function SifreSifirla() {
  const git = useNavigate();
  const konum = useLocation();
  const [adim, setAdim] = useState(1);
  const [eposta, setEposta] = useState(konum.state?.eposta || "");
  const [kaptcha, setKaptcha] = useState("");
  const [kaptchaToken, setKaptchaToken] = useState("");
  const [kod, setKod] = useState("");
  const [sifre, setSifre] = useState("");
  const [sifre2, setSifre2] = useState("");
  const [goster, setGoster] = useState(false);
  const [hata, setHata] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [kaptchaAnahtar, setKaptchaAnahtar] = useState(0);

  async function kodIste(e) {
    e.preventDefault();
    setHata(null); setMesgul(true);
    try {
      await acikPost("/de/sifre/unuttum", { eposta: eposta.trim().toLowerCase(), kaptcha_token: kaptchaToken, kaptcha_cevap: kaptcha });
      setAdim(2);
    } catch (h) {
      setHata(h.message);
      setKaptchaAnahtar((k) => k + 1);   // kod tek kullanımlık: yenisi alınır
    } finally {
      setMesgul(false);
    }
  }

  async function sifirla(e) {
    e.preventDefault();
    const sorun = sifreSorunu(sifre);
    if (sorun) { setHata("Yeni şifre: " + sorun.toLocaleLowerCase("tr") + "."); return; }
    if (sifre !== sifre2) { setHata("Şifreler aynı değil."); return; }
    setHata(null); setMesgul(true);
    try {
      await acikPost("/de/sifre/sifirla", { eposta: eposta.trim().toLowerCase(), kod: kod.trim(), yeni_sifre: sifre });
      git("/giris", { replace: true, state: { eposta: eposta.trim().toLowerCase(), mesaj: "Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz." } });
    } catch (h) {
      setHata(h.message);
      setMesgul(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zemin">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo boyut={48} zeminli={false} renk="rgb(var(--metin))" />
            <h1 className="mt-5 text-xl font-semibold tracking-tight">{adim === 1 ? "Şifrenizi mi unuttunuz?" : "Yeni şifre belirleyin"}</h1>
            <p className="mt-1.5 text-sm text-soluk">
              {adim === 1 ? "E-posta adresinize bir doğrulama kodu gönderelim." : null}
            </p>
          </div>

          {adim === 1 ? (
            <form onSubmit={kodIste} className="space-y-4 rounded-xl border border-cizgi bg-panel p-6">
              <div>
                <label htmlFor="ss-eposta" className="etiket">E-posta</label>
                <input id="ss-eposta" type="email" required autoComplete="username" autoFocus value={eposta}
                  onChange={(e) => setEposta(e.target.value)} className="girdi" placeholder="ornek@eposta.com" />
              </div>
              <Kaptcha key={kaptchaAnahtar} deger={kaptcha} onChange={setKaptcha} onToken={setKaptchaToken} />
              {hata && <Hata metin={hata} />}
              <button type="submit" disabled={mesgul} className="dugme-ana min-h-[44px] w-full">
                {mesgul && <Loader2 size={15} className="animate-spin" />} Kod gönder
              </button>
            </form>
          ) : (
            <form onSubmit={sifirla} className="space-y-4 rounded-xl border border-cizgi bg-panel p-6">
              <p className="flex gap-2.5 rounded-md bg-panel2 px-3 py-2.5 text-xs leading-relaxed text-soluk">
                <MailCheck size={16} className="mt-0.5 shrink-0 text-saglikli" />
                <span><b className="text-metin">{eposta.trim().toLowerCase()}</b> ile bir hesap varsa doğrulama kodu gönderildi.
                  Birkaç dakika içinde gelmezse istenmeyen (spam) klasörüne bakın.</span>
              </p>
              <div>
                <label htmlFor="ss-kod" className="etiket">E-postadaki kod</label>
                <input id="ss-kod" required inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={kod}
                  onChange={(e) => setKod(e.target.value.replace(/\D/g, ""))} className="girdi tracking-[0.3em]" placeholder="••••••" />
              </div>
              <div>
                <label htmlFor="ss-sifre" className="etiket">Yeni şifre</label>
                <div className="relative">
                  <input id="ss-sifre" type={goster ? "text" : "password"} required autoComplete="new-password" value={sifre}
                    onChange={(e) => setSifre(e.target.value)} className="girdi pr-10" />
                  <button type="button" onClick={() => setGoster((g) => !g)} aria-label={goster ? "Şifreyi gizle" : "Şifreyi göster"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-sonuk hover:text-metin">
                    {goster ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className={`mt-1.5 text-xs ${sifre && sifreSorunu(sifre) ? "text-uyari" : "text-sonuk"}`}>
                  {(sifre && sifreSorunu(sifre)) || "En az 8 karakter; büyük harf, küçük harf ve rakam."}
                </p>
              </div>
              <div>
                <label htmlFor="ss-sifre2" className="etiket">Yeni şifre (tekrar)</label>
                <input id="ss-sifre2" type={goster ? "text" : "password"} required autoComplete="new-password" value={sifre2}
                  onChange={(e) => setSifre2(e.target.value)} className="girdi" />
              </div>
              {hata && <Hata metin={hata} />}
              <button type="submit" disabled={mesgul} className="dugme-ana min-h-[44px] w-full">
                {mesgul && <Loader2 size={15} className="animate-spin" />} Şifreyi değiştir
              </button>
              <button type="button" onClick={() => { setAdim(1); setHata(null); setKod(""); }}
                className="w-full text-center text-xs text-sonuk underline underline-offset-4 hover:text-metin">
                Kod gelmedi, yeniden gönder
              </button>
            </form>
          )}

          <Link to="/giris" className="mt-6 flex items-center justify-center gap-1 text-xs text-sonuk hover:text-metin">
            <ChevronLeft size={14} /> Giriş ekranına dön
          </Link>
        </div>
      </main>
    </div>
  );
}

function Hata({ metin }) {
  return <p role="alert" className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">{metin}</p>;
}
