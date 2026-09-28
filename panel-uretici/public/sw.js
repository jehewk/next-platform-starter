// Uygulama kabuğu önbelleği (iki uygulamada ortak; public/sw.js olarak kopyalanır).
//
// · Sayfa gezinmeleri: önce ağ, ağ yoksa önbellekteki index.html → uygulama
//   çevrimdışı açılır ve "bağlantı yok" mesajını kendisi gösterir.
// · /assets/ altındaki dosyalar (adında içerik özeti var): önce önbellek.
// · API çağrıları (başka alan adı) HİÇ önbelleğe alınmaz — eski ölçüm
//   gösterilmesi, hiç ölçüm gösterilmemesinden daha tehlikelidir.
const SURUM = "de-kabuk-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(["/", "/index.html", "/favicon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((a) => a !== SURUM).map((a) => caches.delete(a)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(e.request).then((v) => v || fetch(e.request).then((y) => {
      const kopya = y.clone();
      caches.open(SURUM).then((c) => c.put(e.request, kopya));
      return y;
    })));
  }
});
