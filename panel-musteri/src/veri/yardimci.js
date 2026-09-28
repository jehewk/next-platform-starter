/**
 * Saf yardımcı fonksiyonlar — hiçbiri veri kaynağına bağımlı değildir.
 *
 * Eskiden ornekVeri.js içindeydi; sabit örnek veri (MUSTERILER/CIHAZLAR
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

// Sağlık eşikleri Ayarlar sayfasından değiştirilebilir (bkz. api/ayarlar.jsx).
export const ESIK = { uyari: 85, kritik: 65 };
export function esikAyarla(uyari, kritik) {
  ESIK.uyari = Number(uyari) || 85;
  ESIK.kritik = Number(kritik) || 65;
}

export const saglikDurumu = (s) =>
  s == null ? "notr" : s >= ESIK.uyari ? "saglikli" : s >= ESIK.kritik ? "uyari" : "kritik";

/** Durum anahtarı → metin rengi sınıfı. */
export const DURUM_YAZI = {
  saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik",
  bilgi: "text-bilgi", notr: "text-sonuk",
};

/** "3 dk önce", "2 sa önce" gibi göreli zaman. */
export function onceMetni(iso) {
  if (!iso) return "—";
  const t = utcTarih(iso);
  if (!t) return "—";
  const fark = (Date.now() - t.getTime()) / 1000;
  if (isNaN(fark)) return "—";
  if (fark < 60) return "az önce";
  if (fark < 3600) return `${Math.floor(fark / 60)} dk önce`;
  if (fark < 86400) return `${Math.floor(fark / 3600)} sa önce`;
  return `${Math.floor(fark / 86400)} gün önce`;
}

export const KAYNAK_ADI = {
  uretim: "Üretim kaynaklı", kullanim: "Kullanım kaynaklı",
  dis: "Dış etken", belirsiz: "Belirsiz",
};

export const GARANTI_SURESI_AY = { aku: 60, inverter: 60 };

export function garantiDurumu(cihaz) {
  if (!cihaz?.uretim) return { bitis: null, kalanGun: 0, gecerli: false };
  const ay = GARANTI_SURESI_AY[cihaz.tip] || 60;
  const uretim = utcTarih(cihaz.uretim);
  if (!uretim) return { bitis: null, kalanGun: 0, gecerli: false };
  const bitis = new Date(uretim.getTime() + ay * 30.4 * 86400000);
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

/**
 * Backend zamanı UTC'dir ama saat dilimi eki olmadan yazılır
 * (`datetime.now(timezone.utc).replace(tzinfo=None).isoformat()`).
 * Tarayıcı böyle bir metni YEREL saat sanar → Türkiye'de 3 saat kayma.
 * Ek yoksa "Z" eklenir; Python'un 6 haneli mikrosaniyesi 3 haneye kısaltılır.
 */
export function utcTarih(iso) {
  if (!iso) return null;
  let s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00Z");
  s = s.replace(/(\.\d{3})\d+/, "$1");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  const t = new Date(s);
  return isNaN(t) ? null : t;
}

export const tarihTR = (iso) => {
  if (!iso) return "—";
  const t = utcTarih(iso);
  if (!t) return "—";
  return t.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
