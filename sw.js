const CACHE_NAME = "meu-bebe-offline-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=13",
  "./script.js?v=13",
  "./storage.js",
  "./manifest.json",
  "./service-worker.js",
  "./widget.html",
  "./widget-data.json",
  "./styles.css?v=13",
  "./app.js?v=13",
  "./manifest.webmanifest",
  "./assets/baby-clouds.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
