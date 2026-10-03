import { useCallback, useEffect, useState } from "react";
import { api } from "./istemci";

/**
 * Anlık bildirimler (Web Push). İki uygulamada aynı dosya durur.
 *
 * Tarayıcı aboneliği sunucuya kaydedilir (POST /de/bildirim/abone); bildirimleri
 * zamanlanmış dennis-bildirim Lambda'sı gönderir (aws/hazirlik-kur.ps1).
 * VITE_VAPID_GENEL kurulum betiğinin ürettiği genel anahtardır; boşsa özellik gizlenir.
 *
 * iPhone/iPad: yalnızca ana ekrana eklenmiş uygulamada (iOS 16.4+) çalışır.
 */
const VAPID = import.meta.env.VITE_VAPID_GENEL;

const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const anaEkranda = () => window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;

/** "yok" (kurulmamış/desteklenmiyor) | "ana-ekran" (iOS: önce ana ekrana ekle) | "engelli" | "kapali" | "acik" */
export async function bildirimDurumu() {
  if (!VAPID || !("serviceWorker" in navigator) || window.Capacitor?.isNativePlatform?.()) return "yok";
  if (!("PushManager" in window) || !("Notification" in window)) return ios() && !anaEkranda() ? "ana-ekran" : "yok";
  if (Notification.permission === "denied") return "engelli";
  const kayit = await navigator.serviceWorker.getRegistration();
  const abone = await kayit?.pushManager.getSubscription();
  return abone && Notification.permission === "granted" ? "acik" : "kapali";
}

function anahtarBaytlari(b64) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function bildirimAc() {
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error(izin === "denied"
    ? "Bildirim izni reddedildi. Tarayıcı ayarlarından bu site için bildirimlere izin verin."
    : "Bildirim izni verilmedi.");
  const kayit = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let abone = await kayit.pushManager.getSubscription();
  if (!abone) abone = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarBaytlari(VAPID) });
  try {
    await api.post("/de/bildirim/abone", { abonelik: abone.toJSON() });
  } catch (e) {
    await abone.unsubscribe().catch(() => {});
    throw e;
  }
}

export async function bildirimKapat() {
  const kayit = await navigator.serviceWorker.getRegistration();
  const abone = await kayit?.pushManager.getSubscription();
  if (!abone) return;
  await api.post("/de/bildirim/iptal", { abonelik: abone.toJSON() }).catch(() => {});
  await abone.unsubscribe();
}

/** Ayar satırı için: {durum, mesgul, hata, degistir} */
export function useBildirim() {
  const [durum, setDurum] = useState(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  useEffect(() => { bildirimDurumu().then(setDurum).catch(() => setDurum("yok")); }, []);
  const degistir = useCallback(async () => {
    setMesgul(true); setHata("");
    try {
      if (durum === "acik") await bildirimKapat(); else await bildirimAc();
    } catch (e) {
      setHata(e.message || "Bildirim ayarı değiştirilemedi.");
    }
    setDurum(await bildirimDurumu().catch(() => "yok"));
    setMesgul(false);
  }, [durum]);
  return { durum, mesgul, hata, degistir };
}
