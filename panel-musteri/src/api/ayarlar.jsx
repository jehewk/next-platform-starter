import { createContext, useContext, useEffect, useState } from "react";
import { esikAyarla } from "../veri/yardimci";

/**
 * Kullanıcı tercihleri — tarayıcıda (localStorage) saklanır.
 * Tema ve yoğunluk <html> üzerindeki data-* özniteliklerine yazılır;
 * sağlık eşikleri yardimci.js'deki saglikDurumu() tarafından okunur.
 */

const ANAHTAR = "de_ayarlar";

export const VARSAYILAN = {
  tema: "koyu",            // koyu | acik | sistem
  yogunluk: "rahat",       // rahat | siki
  esikUyari: 85,           // bu değerin altı "izlemede"
  esikKritik: 65,          // bu değerin altı "kritik"
  bildirimKritik: true,
  bildirimGaranti: true,
  bildirimBasvuru: true,
  gorunenAd: "",
};

function oku() {
  try {
    return { ...VARSAYILAN, ...JSON.parse(localStorage.getItem(ANAHTAR) || "{}") };
  } catch {
    return { ...VARSAYILAN };
  }
}

// Sayfa ilk yüklendiğinde eşikler, bileşenler çizilmeden önce uygulanır.
const ilk = oku();
esikAyarla(ilk.esikUyari, ilk.esikKritik);

function uygula(a) {
  const kok = document.documentElement;
  const sistemAcik = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  kok.dataset.tema = a.tema === "sistem" ? (sistemAcik ? "acik" : "koyu") : a.tema;
  kok.dataset.yogunluk = a.yogunluk;
  esikAyarla(a.esikUyari, a.esikKritik);
}

const Baglam = createContext(null);

export function AyarlarSaglayici({ children }) {
  const [ayarlar, setAyarlar] = useState(ilk);

  useEffect(() => {
    uygula(ayarlar);
    try { localStorage.setItem(ANAHTAR, JSON.stringify(ayarlar)); } catch { /* gizli sekme */ }
  }, [ayarlar]);

  useEffect(() => {
    if (ayarlar.tema !== "sistem") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const f = () => uygula(ayarlar);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [ayarlar]);

  const guncelle = (yama) => setAyarlar((a) => ({ ...a, ...yama }));
  const sifirla = () => setAyarlar({ ...VARSAYILAN });

  return <Baglam.Provider value={{ ayarlar, guncelle, sifirla }}>{children}</Baglam.Provider>;
}

export const useAyarlar = () => useContext(Baglam);

/** Grafik/harita gibi CSS sınıfı alamayan yerler için etkin tema. */
export function useEtkinTema() {
  const { ayarlar } = useAyarlar();
  if (ayarlar.tema !== "sistem") return ayarlar.tema;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "acik" : "koyu";
}
