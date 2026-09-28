import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, ChevronLeft } from "lucide-react";
import Logo from "../bilesenler/Logo";
import { kayitBasvurusu } from "../api/servis";

/**
 * Kayıt başvurusu — POST /de/musteri/kayit (DEVIR §6).
 * Hesap "onay_bekliyor" durumunda açılır; üretici onaylayınca giriş açılır.
 * Şifre kuralı Cognito ile aynı: en az 8 karakter, büyük/küçük harf ve rakam.
 */
const URUNLER = [
  { id: "aku", ad: "Akü" },
  { id: "inverter", ad: "İnverter" },
  { id: "ikisi", ad: "Akü + İnverter" },
];

function sifreSorunu(s) {
  if (s.length < 8) return "En az 8 karakter olmalı";
  if (!/[a-zçğıöşü]/.test(s)) return "Küçük harf içermeli";
  if (!/[A-ZÇĞİÖŞÜ]/.test(s)) return "Büyük harf içermeli";
  if (!/\d/.test(s)) return "Rakam içermeli";
  return null;
}

export default function Kayit() {
  const [f, setF] = useState({
    ad: "", soyad: "", eposta: "", sifre: "", telefon: "",
    il: "", ilce: "", adres: "", posta_kodu: "", urun: "ikisi",
  });
  const [hata, setHata] = useState(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [tamam, setTamam] = useState(null);
  const alan = (k) => ({ value: f[k], onChange: (e) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const sifreHata = f.sifre ? sifreSorunu(f.sifre) : null;

  async function gonder(e) {
    e.preventDefault();
    if (sifreSorunu(f.sifre)) { setHata("Şifre: " + sifreSorunu(f.sifre).toLocaleLowerCase("tr")); return; }
    setHata(null);
    setGonderiliyor(true);
    try {
      const temiz = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "sifre" ? v : v.trim()]));
      temiz.eposta = temiz.eposta.toLowerCase();
      const c = await kayitBasvurusu(temiz);
      setTamam(c?.mesaj || "Başvurunuz alındı. Onaylandığında giriş yapabilirsiniz.");
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }

  if (tamam) {
    return (
      <Cerceve>
        <div className="rounded-xl border border-cizgi bg-panel p-6 text-center">
          <CheckCircle2 size={36} className="mx-auto text-saglikli" />
          <h1 className="mt-4 text-lg font-semibold">Başvurunuz alındı</h1>
          <p className="mt-2 text-sm leading-relaxed text-soluk">{tamam}</p>
          <p className="mt-2 text-sm text-soluk">Onaylandığında <b className="text-metin">{f.eposta}</b> ve belirlediğiniz şifreyle giriş yapabilirsiniz.</p>
          <Link to="/giris" className="dugme-ana mt-6 w-full">Giriş ekranına dön</Link>
        </div>
      </Cerceve>
    );
  }

  return (
    <Cerceve>
      <Link to="/giris" className="mb-4 inline-flex items-center gap-1 text-sm text-soluk hover:text-metin">
        <ChevronLeft size={16} /> Giriş
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Kayıt başvurusu</h1>
      <p className="mt-1.5 text-sm text-soluk">Sisteminizi kuran ekibimiz başvurunuzu onayladığında hesabınız açılır.</p>

      <form onSubmit={gonder} className="mt-6 grid gap-4 rounded-xl border border-cizgi bg-panel p-5 sm:grid-cols-2">
        <Alan etiket="Ad"><input required autoComplete="given-name" {...alan("ad")} className="girdi" /></Alan>
        <Alan etiket="Soyad"><input required autoComplete="family-name" {...alan("soyad")} className="girdi" /></Alan>
        <Alan etiket="E-posta" tam><input required type="email" autoComplete="email" {...alan("eposta")} className="girdi" /></Alan>
        <div className="sm:col-span-2">
          <label htmlFor="kayit-sifre" className="etiket">Şifre</label>
          <input id="kayit-sifre" required type="password" autoComplete="new-password" {...alan("sifre")} className="girdi" aria-describedby="sifre-kural" />
          <p id="sifre-kural" className={`mt-1.5 text-xs ${sifreHata ? "text-uyari" : "text-sonuk"}`}>
            {sifreHata || "En az 8 karakter; büyük harf, küçük harf ve rakam."}
          </p>
        </div>
        <Alan etiket="Telefon" tam><input required type="tel" autoComplete="tel" inputMode="tel" {...alan("telefon")} placeholder="05xx xxx xx xx" className="girdi" /></Alan>
        <Alan etiket="İl"><input required autoComplete="address-level1" {...alan("il")} className="girdi" /></Alan>
        <Alan etiket="İlçe"><input required autoComplete="address-level2" {...alan("ilce")} className="girdi" /></Alan>
        <Alan etiket="Adres" tam><input required autoComplete="street-address" {...alan("adres")} className="girdi" /></Alan>
        <Alan etiket="Posta kodu"><input inputMode="numeric" autoComplete="postal-code" {...alan("posta_kodu")} className="girdi" /></Alan>
        <Alan etiket="Ürün" tam grup>
          <div className="grid grid-cols-3 gap-2">
            {URUNLER.map((u) => (
              <button key={u.id} type="button" aria-pressed={f.urun === u.id} onClick={() => setF((x) => ({ ...x, urun: u.id }))}
                className={`min-h-[44px] rounded-md border px-2 text-sm font-medium ${
                  f.urun === u.id ? "border-metin/40 bg-panel2 text-metin" : "border-cizgi text-soluk"}`}>
                {u.ad}
              </button>
            ))}
          </div>
        </Alan>
        {hata && <p role="alert" className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik sm:col-span-2">{hata}</p>}
        <button type="submit" disabled={gonderiliyor} className="dugme-ana min-h-[44px] sm:col-span-2">
          {gonderiliyor && <Loader2 size={15} className="animate-spin" />} Başvuruyu gönder
        </button>
      </form>
    </Cerceve>
  );
}

function Cerceve({ children }) {
  return (
    <div className="min-h-screen bg-zemin px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex justify-center"><Logo boyut={40} zeminli={false} renk="rgb(var(--metin))" /></div>
        {children}
      </div>
    </div>
  );
}

// grup: içinde düğmeler varsa <label> yerine <div> (etikete dokunmak ilk düğmeyi seçmesin)
function Alan({ etiket, tam, grup, children }) {
  const Kap = grup ? "div" : "label";
  return (
    <Kap className={`block ${tam ? "sm:col-span-2" : ""}`} {...(grup ? { role: "group", "aria-label": etiket } : {})}>
      <span className="etiket">{etiket}</span>
      {children}
    </Kap>
  );
}
