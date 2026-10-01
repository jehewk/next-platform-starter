import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { soruSor } from "./asistan";

/**
 * Sohbet geçmişi. Konuşmalar tarayıcıda saklanır; hem Sohbet sayfası
 * hem de sağdan açılan sohbet çekmecesi aynı durumu paylaşır.
 */

const ANAHTAR = "de_sohbetler";
const EN_FAZLA = 30;

const yeniId = () => Math.random().toString(36).slice(2, 10);
const bosSohbet = () => ({ id: yeniId(), baslik: "Yeni sohbet", mesajlar: [], guncel: Date.now() });

function oku() {
  try {
    const d = JSON.parse(localStorage.getItem(ANAHTAR) || "null");
    if (d?.liste?.length) return d;
  } catch { /* bozuk kayıt */ }
  const s = bosSohbet();
  return { liste: [s], aktifId: s.id };
}

const Baglam = createContext(null);

export function SohbetSaglayici({ children }) {
  const [durum, setDurum] = useState(oku);
  const [bekleyen, setBekleyen] = useState(null); // yanıt beklenen sohbetin id'si

  useEffect(() => {
    try { localStorage.setItem(ANAHTAR, JSON.stringify(durum)); } catch { /* gizli sekme */ }
  }, [durum]);

  const aktif = durum.liste.find((s) => s.id === durum.aktifId) || durum.liste[0];

  const sohbetGuncelle = (id, f) =>
    setDurum((d) => ({ ...d, liste: d.liste.map((s) => (s.id === id ? { ...f(s), guncel: Date.now() } : s)) }));

  // gorsel: {tur, veri, onizleme} (api/gorsel.js). Geçmişte yalnızca küçük önizleme saklanır.
  const gonder = useCallback(async (metin, gorsel = null) => {
    const soru = metin.trim();
    if ((!soru && !gorsel) || bekleyen) return;
    const id = aktif.id;
    const gecmis = aktif.mesajlar;
    sohbetGuncelle(id, (s) => ({
      ...s,
      baslik: s.mesajlar.length ? s.baslik : (soru || "Fotoğraf").slice(0, 48),
      mesajlar: [...s.mesajlar, { rol: "kullanici", metin: soru, zaman: Date.now(), ...(gorsel ? { gorsel: gorsel.onizleme } : {}) }],
    }));
    setBekleyen(id);
    // soruSor {metin, kaynak} döndürür; kaynak ("yerel" | "model") dil modeline giden
    // geçmişten veri yanıtlarını ayıklamak için saklanır.
    let yanit;
    try {
      yanit = await soruSor(soru, gecmis, { gorsel });
    } catch (e) {
      yanit = { metin: `Yanıt oluşturulamadı: ${e.message}`, kaynak: "yerel" };
    }
    if (typeof yanit === "string") yanit = { metin: yanit, kaynak: "yerel" };
    sohbetGuncelle(id, (s) => ({ ...s, mesajlar: [...s.mesajlar, { rol: "asistan", metin: yanit.metin, kaynak: yanit.kaynak, zaman: Date.now(), ...(yanit.arama ? { arama: yanit.arama } : {}), ...(yanit.grafik ? { grafik: yanit.grafik } : {}) }] }));
    setBekleyen(null);
  }, [aktif, bekleyen]);

  const yeni = () => setDurum((d) => {
    // Boş bir sohbet zaten açıksa yenisini açmak yerine ona geç.
    const bos = d.liste.find((s) => s.mesajlar.length === 0);
    if (bos) return { ...d, aktifId: bos.id };
    const s = bosSohbet();
    return { liste: [s, ...d.liste].slice(0, EN_FAZLA), aktifId: s.id };
  });

  const sec = (id) => setDurum((d) => ({ ...d, aktifId: id }));

  const sil = (id) => setDurum((d) => {
    const liste = d.liste.filter((s) => s.id !== id);
    if (!liste.length) { const s = bosSohbet(); return { liste: [s], aktifId: s.id }; }
    return { liste, aktifId: d.aktifId === id ? liste[0].id : d.aktifId };
  });

  const yenidenAdlandir = (id, baslik) => sohbetGuncelle(id, (s) => ({ ...s, baslik: baslik.trim() || s.baslik }));

  const temizle = (id) => sohbetGuncelle(id, (s) => ({ ...s, mesajlar: [], baslik: "Yeni sohbet" }));

  const siraliListe = [...durum.liste].sort((a, b) => b.guncel - a.guncel);

  return (
    <Baglam.Provider value={{
      liste: siraliListe, aktif, bekliyor: bekleyen === aktif.id,
      gonder, yeni, sec, sil, yenidenAdlandir, temizle,
    }}>
      {children}
    </Baglam.Provider>
  );
}

export const useSohbet = () => useContext(Baglam);
