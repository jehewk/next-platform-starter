/**
 * Teknik → sade dil çevirisi.
 *
 * Üretici panelinde "Hücre 7 gerilimi 12 gündür ayrışıyor" gibi bir
 * gerekçe teknisyen için doğrudur. Müşteri için değildir — ne
 * yapması gerektiğini söylemez, sadece endişelendirir.
 *
 * Bu dosya aynı verinin (bilesen, seviye) iki farklı okuyucu için
 * iki farklı cümleye dönüştüğü tek yerdir. Teknik gerekçe backend'den
 * gelir; burada sadece müşteriye dönük karşılığı seçilir.
 */

const BILESEN_MESAJLARI = {
  hucre_dengesizligi: {
    baslik: "Akünüzde küçük bir dengesizlik",
    aciklama: "Akü paketinizdeki hücrelerden biri diğerlerinden az farklı çalışıyor. " +
      "Bu erken aşamada fark edildi ve ekibimiz tarafından izleniyor.",
  },
  ic_direnc: {
    baslik: "Akünüzde doğal yaşlanma belirtisi",
    aciklama: "Akünüzün iç direnci yavaşça artıyor; bu kullanımla birlikte beklenen bir " +
      "süreç. Ekibimiz hızını takip ediyor.",
  },
  cevrim_yorulmasi: {
    baslik: "Akü kullanım yoğunluğu",
    aciklama: "Akünüz yoğun şarj-deşarj döngüsünden geçiyor. Performansı izleniyor; " +
      "gerekirse size bir kullanım önerisiyle ulaşacağız.",
  },
  termal_yaslanma: {
    baslik: "Akü sıcaklığı takipte",
    aciklama: "Akünüz normalden biraz daha sıcak çalışıyor. Bu durum sürekli izleniyor; " +
      "gerekirse sizinle iletişime geçilecek.",
  },
  termal_derating: {
    baslik: "Sıcaklık nedeniyle güç sınırlandı",
    aciklama: "Sisteminiz kendini korumak için sıcak saatlerde gücünü geçici olarak " +
      "düşürüyor. Cihazın çevresinin havalandığından emin olmanız yardımcı olur.",
  },
  fan_verimi: {
    baslik: "İnverterde soğutma performansı",
    aciklama: "İnverterinizin soğutma sistemi normalden biraz daha yavaş ısı atıyor. " +
      "Şu an üretiminizi etkilemiyor, ekibimiz takip ediyor.",
  },
  sogutma_verimi: {
    baslik: "İnverterde soğutma performansı",
    aciklama: "İnverterinizin soğutma sistemi normalden biraz daha yavaş ısı atıyor. " +
      "Şu an üretiminizi etkilemiyor, ekibimiz takip ediyor.",
  },
  kondansator_esr: {
    baslik: "İnverter bakım önerisi",
    aciklama: "İnverterinizde bir bileşenin yakın zamanda bakım gerektirebileceğini " +
      "öngördük. Servis ekibimiz sizinle iletişime geçecek.",
  },
  igbt_termal_yorulma: {
    baslik: "İnverter bakım önerisi",
    aciklama: "İnverterinizin güç bileşenlerinde ısınmaya bağlı yıpranma belirtisi görüldü. " +
      "Servis ekibimiz uygun bir zamanda sizinle iletişime geçecek.",
  },
  kopru_dengesizligi: {
    baslik: "İnverter bakım önerisi",
    aciklama: "İnverterinizin çıkışında küçük bir dengesizlik görüldü. Servis ekibimiz " +
      "cihazı uzaktan inceliyor, gerekirse sizinle iletişime geçecek.",
  },
  guc_kisitlama: {
    baslik: "İnverter gücü sınırlandı",
    aciklama: "İnverteriniz kendini korumak için gücünü geçici olarak düşürüyor. " +
      "Ekibimiz nedenini inceliyor; üretiminiz bir süre normalden düşük olabilir.",
  },
  kondansator_yas: {
    baslik: "İnverter bakım önerisi",
    aciklama: "İnverterinizde bir bileşen yaşlanma belirtisi gösteriyor. Servis ekibimiz " +
      "uygun bir zamanda sizinle iletişime geçecek.",
  },
};

const VARSAYILAN = {
  baslik: "Sistem izleniyor",
  aciklama: "Ekibimiz bu cihazı yakından takip ediyor; endişelenmenize gerek yok.",
};

// Tanınmayan mekanizmada, cihaz kritik durumdayken "endişelenmeyin" demek
// yanlış olur; ciddiyete göre iki ayrı varsayılan kullanılır.
const VARSAYILAN_DIKKAT = {
  baslik: "Ekibimiz ilgileniyor",
  aciklama: "Bu cihazda dikkat gerektiren bir durum tespit ettik. Servis ekibimiz " +
    "inceliyor ve gerekirse sizinle iletişime geçecek.",
};

/**
 * tahmin nesnesinden ({mekanizma, kalanSaat, guven, gerekce}) müşteri metni üretir.
 * saglik verilirse, tanınmayan mekanizmada varsayılan metin ciddiyete göre seçilir.
 */
export function musteriMesaji(tahmin, saglik = null) {
  if (!tahmin) return null;
  if (BILESEN_MESAJLARI[tahmin.mekanizma]) return BILESEN_MESAJLARI[tahmin.mekanizma];
  return saglik != null && saglik < 65 ? VARSAYILAN_DIKKAT : VARSAYILAN;
}

/** Son ölçümdeki en yüksek bağlı sensör sıcaklığı (backend max_sicaklik; yoksa sensörlerden). */
export function enYuksekSicaklik(o) {
  if (!o) return null;
  if (o.max_sicaklik != null) return Math.round(Number(o.max_sicaklik));
  const bagli = (o.sicakliklar || []).map(Number).filter((t) => t > -40);
  return bagli.length ? Math.round(Math.max(...bagli)) : null;
}

/** Sağlık skorundan müşterinin anlayacağı durum. */
export function musteriDurumu(saglik) {
  if (saglik == null) return { anahtar: "bilinmiyor", ad: "Bilgi bekleniyor", renk: "sonuk" };
  if (saglik >= 85) return { anahtar: "iyi", ad: "Her şey yolunda", renk: "saglikli" };
  if (saglik >= 65) return { anahtar: "izleniyor", ad: "Takip ediliyor", renk: "uyari" };
  return { anahtar: "dikkat", ad: "İlgilenilmesi gerekiyor", renk: "kritik" };
}

/** Kalan saati "birkaç gün içinde" gibi kaygı yaratmayan bir ifadeye çevirir. */
export function yaklasikZaman(saat) {
  if (saat == null) return null;
  const gun = Math.round(saat / 24);
  if (gun <= 1) return "yakın zamanda";
  if (gun <= 4) return "önümüzdeki birkaç gün içinde";
  if (gun <= 10) return "önümüzdeki günlerde";
  return "önümüzdeki haftalarda";
}


/* ── Uygulamaya özgü eklemeler ── */

/** Destek (garanti) talebinin durumu, müşterinin dilinde. */
export const TALEP_DURUMU = {
  inceleniyor: { ad: "Ekibimiz inceliyor", renk: "uyari" },
  onaylandi:   { ad: "Garanti kapsamında", renk: "saglikli" },
  reddedildi:  { ad: "Garanti kapsamı dışında", renk: "kritik" },
};

/** Paket gerilimi (V): backend `gerilim`; yoksa hücre gerilimlerinin (mV) toplamı. */
export function paketGerilimi(o) {
  if (!o) return NaN;
  if (o.gerilim != null) return Number(o.gerilim);
  const h = (o.hucreler || []).map(Number);
  return h.length ? h.reduce((a, b) => a + b, 0) / 1000 : NaN;
}

/** Akü akımından müşterinin anlayacağı enerji yönü. akim: + şarj, − deşarj. */
export function enerjiAkisi(gerilim, akim) {
  if (!Number.isFinite(gerilim) || !Number.isFinite(akim)) return null;
  const kw = Math.abs(gerilim * akim) / 1000;
  if (kw < 0.05) return { yon: "bekleme", metin: "Beklemede", kw: 0 };
  return akim > 0
    ? { yon: "sarj", metin: "Şarj oluyor", kw }
    : { yon: "desarj", metin: "Evinize enerji veriyor", kw };
}
