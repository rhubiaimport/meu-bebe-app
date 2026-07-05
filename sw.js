const CACHE_NAME = "meu-bebe-offline-v35";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=35",
  "./script.js?v=35",
  "./firebase-config.js",
  "./storage.js",
  "./manifest.json",
  "./service-worker.js",
  "./widget.html",
  "./widget-data.json",
  "./styles.css?v=35",
  "./app.js?v=35",
  "./manifest.webmanifest",
  "./assets/baby-clouds.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const isPage = request.mode === "navigate" || request.destination === "document";
  const isFreshAsset = ["script", "style", "worker"].includes(request.destination);

  if (isPage || isFreshAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
