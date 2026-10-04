import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { yerelKurulum } from "./yerel";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

yerelKurulum();

// Tarayıcıda kurulabilir uygulama (PWA). Mağaza sürümünde (Capacitor)
// dosyalar zaten cihazdadır; service worker gerekmez.
if (import.meta.env.PROD && "serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
