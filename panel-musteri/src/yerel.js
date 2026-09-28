import { Capacitor } from "@capacitor/core";

/**
 * Mağaza uygulaması (iOS/Android) içindeyken yerel ayarlar: siyah durum
 * çubuğu, açılış görselinin kapanması, Android geri tuşu. Tarayıcıda
 * hiçbir şey yapmaz; eklentiler yalnızca yerel ortamda yüklenir.
 */
export async function yerelKurulum() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/app"),
  ]);
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === "android") StatusBar.setBackgroundColor({ color: "#000000" }).catch(() => {});
  SplashScreen.hide().catch(() => {});
  App.addListener("backButton", ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp()));
}
