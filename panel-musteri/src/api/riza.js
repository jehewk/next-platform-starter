import { useEffect, useState } from "react";
import { KVKK_SURUM } from "../veri/kvkk";

/**
 * Sohbet asistanı için yurt dışına aktarım açık rızası (Google Gemini).
 * Kayıt formunda ya da sohbette verilir, Hesabım'dan geri alınır. Rıza yoksa
 * genel sorular ve fotoğraflar dil modeline GÖNDERİLMEZ (asistan.js denetler).
 * Kayıtta verilen rıza ayrıca müşteri kaydına yazılır (backend, KVKK yaması).
 */
const ANAHTAR = "de_yurtdisi_riza";
const OLAY = "de-riza";

export function rizaVar() {
  try { return JSON.parse(localStorage.getItem(ANAHTAR) || "null")?.deger === true; } catch { return false; }
}

export function rizaAyarla(deger) {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify({ deger: !!deger, surum: KVKK_SURUM, zaman: new Date().toISOString() }));
  } catch { /* gizli sekme: yalnızca bu oturum */ }
  window.dispatchEvent(new Event(OLAY));
}

export function useRiza() {
  const [var_, setVar] = useState(rizaVar);
  useEffect(() => {
    const g = () => setVar(rizaVar());
    window.addEventListener(OLAY, g);
    window.addEventListener("storage", g);
    return () => { window.removeEventListener(OLAY, g); window.removeEventListener("storage", g); };
  }, []);
  return [var_, rizaAyarla];
}
