import { acikPost } from "./istemci";

/**
 * Oturum yönetimi.
 *
 * Giriş artık tarayıcıdan doğrudan Cognito'ya değil, kendi backend'imiz
 * üzerinden yapılır. Sebebi: doğrulama kodu (kaptcha) sunucuda kontrol
 * edilsin. Tarayıcı doğrudan Cognito'ya gitseydi bir bot kodu atlayıp
 * şifre denemeye devam edebilirdi.
 *
 * Token'lar sessionStorage'da tutulur — sekme kapanınca oturum biter.
 */

const ANAHTAR = "de_oturum";

export async function girisYap(eposta, sifre, kaptchaToken, kaptchaCevap) {
  const c = await acikPost("/de/giris", {
    eposta, sifre,
    kaptcha_token: kaptchaToken,
    kaptcha_cevap: kaptchaCevap,
  });
  const kayit = { erisim: c.erisim, yenile: c.yenile, eposta: c.eposta || eposta };
  sessionStorage.setItem(ANAHTAR, JSON.stringify(kayit));
  return kayit;
}

export function oturumOku() {
  try {
    const ham = sessionStorage.getItem(ANAHTAR);
    return ham ? JSON.parse(ham) : null;
  } catch {
    return null;
  }
}

export function oturumSil() {
  sessionStorage.removeItem(ANAHTAR);
}


/** Erişim tokenının süresi dolduysa yenileme tokenıyla tazeler. */
export async function tokenYenile() {
  const oturum = oturumOku();
  if (!oturum?.yenile) throw new Error("Oturum yok");
  const c = await acikPost("/de/token/yenile", { yenile: oturum.yenile });
  if (!c?.erisim) throw new Error("Tazelenemedi");
  const kayit = { ...oturum, erisim: c.erisim };
  sessionStorage.setItem(ANAHTAR, JSON.stringify(kayit));
  return kayit;
}
