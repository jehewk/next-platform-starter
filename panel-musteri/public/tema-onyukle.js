// Tema, sayfa cizilmeden once uygulanir; acik temada koyu yanip sonme olmaz.
// Harici dosya: CSP script-src 'self' ile calisir (inline script engellenir).
try {
  var a = JSON.parse(localStorage.getItem("de_ayarlar") || "{}");
  var t = a.tema || "koyu";
  if (t === "sistem") t = matchMedia("(prefers-color-scheme: light)").matches ? "acik" : "koyu";
  document.documentElement.dataset.tema = t;
} catch (e) {}
