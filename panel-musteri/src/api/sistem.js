import { musteriListesi, cihazListesi, cihazBul } from "./servis";
import { utcTarih } from "../veri/yardimci";

/**
 * Müşterinin tüm sistemi tek çağrıda.
 *
 * Müşteri rolüyle çağrıldığında backend listeleri kendiliğinden bu
 * müşteriye süzer (DEVIR §3); frontend ayrıca filtre göndermez.
 * Bir evde birkaç cihaz olduğu için her birinin detayı (son ölçüm,
 * öngörü) paralel çekilir; biri başarısız olursa diğerleri gösterilir.
 */
export async function sistemimiGetir() {
  const [musteriler, cihazlar] = await Promise.all([
    musteriListesi().catch(() => []),
    cihazListesi(),
  ]);
  const detaylar = await Promise.all(
    cihazlar.map((c) => cihazBul(c.id).catch(() => ({ ...c, detayAlinamadi: true })))
  );
  return { profil: musteriler[0] || null, cihazlar: detaylar };
}

/** Cihazın son ölçümü bu süreden eskiyse "veri gelmiyor" uyarısı gösterilir. */
export const SESSIZ_DAKIKA = 30;

/** Son ölçümün yaşı (dakika); ölçüm yoksa null. */
export function olcumYasiDk(cihaz) {
  const t = utcTarih(cihaz?.sonOlcum?.zaman);
  return t ? Math.floor((Date.now() - t.getTime()) / 60000) : null;
}
