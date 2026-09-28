import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Leaflet stilleri yerel paketten gelir; CDN bagimliligi yok.
import "leaflet/dist/leaflet.css";
import "./index.css";
import { yerelKurulum } from "./yerel";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

yerelKurulum();

// Kurulabilir uygulama (PWA): yalnızca derlenmiş tarayıcı sürümünde; geliştirmede
// önbellek değişiklikleri gizlerdi, mağaza sürümünde (Capacitor) gerekmez.
if (import.meta.env.PROD && "serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
