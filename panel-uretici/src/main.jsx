import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Leaflet stilleri yerel paketten gelir; CDN bagimliligi yok.
import "leaflet/dist/leaflet.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
