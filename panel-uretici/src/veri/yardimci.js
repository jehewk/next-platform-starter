/**
 * Saf yardımcı fonksiyonlar — hiçbiri veri kaynağına bağımlı değildir.
 *
 * Eskiden ornekVeri.js içindeydi; demo veri (sabit MUSTERILER/CIHAZLAR
 * dizileri) kaldırılınca bu fonksiyonlar tek başlarına kaldı. Hem API
 * hem (varsa) test verisiyle çalışırlar çünkü girdiyi dışarıdan alırlar.
 */

export const DURUM_ADI = {
  aktif: "Aktif", uyari: "İzlemede", arizali: "Arızalı",
  depoda: "Depoda", sevkte: "Sevkte", uretildi: "Üretildi",
};

export const durumRengi = (durum) => ({
  aktif: "saglikli", uyari: "uyari", arizali: "kritik",
  depoda: "notr", sevkte: "bilgi", uretildi: "notr",
}[durum] || "notr");

export const saglikDurumu = (s) =>
  s == null ? "notr" : s >= 85 ? "saglikli" : s >= 65 ? "uyari" : "kritik";

export const KAYNAK_ADI = {
  uretim: "Üretim kaynaklı", kullanim: "Kullanım kaynaklı",
  dis: "Dış etken", belirsiz: "Belirsiz",
};

export const GARANTI_SURESI_AY = { aku: 60, inverter: 60 };

export function garantiDurumu(cihaz) {
  if (!cihaz?.uretim) return { bitis: null, kalanGun: 0, gecerli: false };
  const ay = GARANTI_SURESI_AY[cihaz.tip] || 60;
  const bitis = new Date(new Date(cihaz.uretim).getTime() + ay * 30.4 * 86400000);
  const kalanGun = Math.round((bitis - Date.now()) / 86400000);
  return { bitis, kalanGun, gecerli: kalanGun > 0 };
}

export function sureMetni(saat) {
  if (saat == null) return "";
  if (saat < 24) return `${saat} saat`;
  const g = Math.floor(saat / 24), k = saat % 24;
  return k ? `${g} gün ${k} saat` : `${g} gün`;
}

export const sayi = (n) => new Intl.NumberFormat("tr-TR").format(Math.round(n || 0));

export const tarihTR = (iso) => {
  if (!iso) return "—";
  const t = new Date(iso);
  return isNaN(t) ? "—" : t.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * Fizik motorunun mekanizma anahtarları → okunur ad.
 *
 * Backend "hucre_dengesizligi" gibi anahtar döner; eskiden arayüz bunu
 * ham haliyle basıyordu. Bilinmeyen bir anahtar gelirse (motor yeni
 * mekanizma kazanırsa) alt çizgiler boşluğa çevrilip gösterilir —
 * hiçbir zaman boş kalmaz.
 */
export const MEKANIZMA_ADI = {
  hucre_dengesizligi:  "Hücre dengesizliği",
  ic_direnc:           "İç direnç artışı",
  cevrim_yorulmasi:    "Çevrim yorulması",
  termal_yaslanma:     "Termal yaşlanma",
  termal_derating:     "Sıcaklık kaynaklı güç düşürme",
  guc_kisitlama:       "Güç kısıtlama",
  kondansator_esr:     "DC bara kondansatörü",
  kondansator_yas:     "Kondansatör yaşlanması",
  sogutma_verimi:      "Soğutma verimi",
  fan_verimi:          "Soğutma fanı",
  igbt_termal_yorulma: "IGBT termal yorulma",
  kopru_dengesizligi:  "Faz kolu dengesizliği",
};

export function mekanizmaAdi(anahtar) {
  if (!anahtar) return "";
  if (MEKANIZMA_ADI[anahtar]) return MEKANIZMA_ADI[anahtar];
  const s = String(anahtar).replace(/_/g, " ");
  return s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
}
