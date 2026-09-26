import { oturumOku, tokenYenile, oturumSil } from "./oturum";
import { demoIstek } from "./demo";

/**
 * Backend ile tek temas noktası.
 *
 * Her çağrı: token ekler, 401 alırsa BİR kez token yenilemeyi dener,
 * o da başarısızsa oturumu kapatıp giriş ekranına döner. Ağ hatası
 * ile "yetkisiz" hatası kullanıcıya farklı mesajlarla gösterilir —
 * biri "bağlantınızı kontrol edin" der, diğeri "tekrar giriş yapın".
 */

const TABAN = import.meta.env.VITE_API_URL;

export class ApiHatasi extends Error {
  constructor(mesaj, durum) {
    super(mesaj);
    this.durum = durum;
  }
}

async function istek(yol, secenekler = {}, tekrarDenendi = false) {
  const oturum = oturumOku();
  if (!oturum) throw new ApiHatasi("Oturum bulunamadı", 401);

  if (oturum.demo) {
    try { return await demoIstek(yol, secenekler); }
    catch (e) { throw new ApiHatasi(e.message, e.durum ?? 500); }
  }

  let govde;
  try {
    govde = await fetch(TABAN + yol, {
      ...secenekler,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${oturum.erisim}`,
        ...secenekler.headers,
      },
    });
  } catch {
    // fetch kendisi reddettiyse ağ kopmuş demektir — sunucudan
    // gelen bir hata değil, bunu ayırt etmek onarma mesajını doğru seçer.
    throw new ApiHatasi("İnternet bağlantınızı kontrol edin.", 0);
  }

  if (govde.status === 401 && !tekrarDenendi) {
    try {
      await tokenYenile();
      return istek(yol, secenekler, true);
    } catch {
      oturumSil();
      throw new ApiHatasi("Oturumunuzun süresi doldu, tekrar giriş yapın.", 401);
    }
  }

  let veri = null;
  try { veri = await govde.json(); } catch { /* boş gövde olabilir */ }

  if (!govde.ok) {
    throw new ApiHatasi(veri?.hata || `Sunucu hatası (${govde.status})`, govde.status);
  }
  return veri;
}

export const api = {
  get: (yol) => istek(yol, { method: "GET" }),
  post: (yol, gövde) => istek(yol, { method: "POST", body: JSON.stringify(gövde) }),
};

/**
 * Oturum gerektirmeyen çağrı — kayıt başvurusu için.
 *
 * Başvuru yapan kişinin henüz hesabı yoktur; normal istemci token
 * bulamayınca çağrıyı hiç göndermez. Bu yüzden ayrı bir yol gerekir.
 */
export async function acikPost(yol, gövde) {
  let govde;
  try {
    govde = await fetch(TABAN + yol, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gövde),
    });
  } catch {
    throw new ApiHatasi("İnternet bağlantınızı kontrol edin.", 0);
  }
  let veri = null;
  try { veri = await govde.json(); } catch { /* boş gövde */ }
  if (!govde.ok) throw new ApiHatasi(veri?.hata || `Sunucu hatası (${govde.status})`, govde.status);
  return veri;
}
