/**
 * Akü sağlık geçmişi — sohbet asistanı için.
 *
 * Backend sağlık skorunun geçmişini saklamaz; her ölçümde hücre gerilim farkı
 * (hucre_farki_mv) saklanır. Hücreler arası farkın zamanla büyümesi LiFePO4 paketin
 * yaşlanmasının en erken işaretidir: gidişat bu seriden çıkarılır.
 * İki uygulamada aynı dosya durur (panel-uretici, panel-musteri).
 */
import { cihazGecmisi } from "./servis";

export const FARK_ESIK_MV = 80; // BMS dengeleme sınırı (AkuDetay.jsx ile aynı)

/** cihazGecmisi serisi → gidişat; en az 2 gün yoksa null. */
export function egilimOzeti(seri) {
  if (!seri || seri.length < 2) return null;
  const y = seri.map((s) => s.farkMv);
  const n = y.length;
  // en küçük kareler eğimi (mV/gün) — tek günlük sıçramalar yönü bozmasın
  const xOrt = (n - 1) / 2;
  const yOrt = y.reduce((a, b) => a + b, 0) / n;
  let pay = 0, payda = 0;
  y.forEach((v, i) => { pay += (i - xOrt) * (v - yOrt); payda += (i - xOrt) ** 2; });
  const egim = payda ? pay / payda : 0;
  const toplam = egim * (n - 1);                  // dönem boyunca eğilim çizgisindeki değişim
  const yon = toplam >= 6 ? "kotulesiyor" : toplam <= -6 ? "iyilesiyor" : "sabit";
  const son = y[n - 1];
  const esigeGun = yon === "kotulesiyor" && son < FARK_ESIK_MV && egim > 0
    ? Math.round((FARK_ESIK_MV - son) / egim) : null;
  return {
    gun: n, ilk: y[0], son, enYuksek: Math.max(...y), enDusuk: Math.min(...y),
    egim: Number(egim.toFixed(2)), toplam: Math.round(toplam), yon, esigeGun,
    esikUstu: son >= FARK_ESIK_MV,
  };
}

/** Sohbet grafiği (SohbetPaneli → SohbetGrafigi). */
export function grafikVerisi(seri, baslik, { sayisiz = false } = {}) {
  return {
    baslik, birim: sayisiz ? "" : "mV", esik: FARK_ESIK_MV, sayisiz,
    noktalar: seri.map((s) => ({ x: s.gun, y: s.farkMv })),
  };
}

/** Birden çok cihazın geçmişi, aynı anda en fazla `es` istek. Hata → seri yok. */
export async function gecmisleriGetir(cihazlar, gun, es = 5) {
  const sonuc = new Array(cihazlar.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(es, cihazlar.length) }, async () => {
    while (i < cihazlar.length) {
      const k = i++;
      const seri = await cihazGecmisi(cihazlar[k].id, gun).catch(() => []);
      sonuc[k] = { cihaz: cihazlar[k], seri, ozet: egilimOzeti(seri) };
    }
  }));
  return sonuc;
}
