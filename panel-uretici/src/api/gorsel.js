/**
 * Sohbete eklenen fotoğrafı tarayıcıda küçültür: dil modeline giden kopya en fazla
 * 1280 px JPEG (birkaç yüz KB), sohbet geçmişinde saklanan önizleme 256 px.
 * Telefon fotoğrafları (5–10 MB) böylece Lambda sınırına (6 MB) takılmaz.
 */

const MAKS = 1280;
const ONIZLEME = 256;

function ciz(img, enFazla, kalite) {
  const oran = Math.min(1, enFazla / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * oran));
  c.height = Math.max(1, Math.round(img.naturalHeight * oran));
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; // saydam PNG siyah görünmesin
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", kalite);
}

/** Dosya → {tur, veri (base64), onizleme (data URL)}; resim değilse ya da okunamazsa hata. */
export async function fotografHazirla(dosya) {
  if (!dosya?.type?.startsWith("image/")) throw new Error("Yalnızca fotoğraf eklenebilir.");
  const adres = URL.createObjectURL(dosya);
  try {
    const img = await new Promise((tamam, hata) => {
      const i = new Image();
      i.onload = () => tamam(i);
      i.onerror = () => hata(new Error("Fotoğraf açılamadı (desteklenmeyen biçim)."));
      i.src = adres;
    });
    const buyuk = ciz(img, MAKS, 0.82);
    return { tur: "image/jpeg", veri: buyuk.split(",")[1], onizleme: ciz(img, ONIZLEME, 0.6) };
  } finally {
    URL.revokeObjectURL(adres);
  }
}
