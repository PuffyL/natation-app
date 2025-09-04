const CACHE = "suivi-cache-v9";
const APP_SHELL = [
  "/", "/index.html", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(APP_SHELL);
      } catch (err) {
        // En dev, certains chemins peuvent échouer : on ignore pour ne pas bloquer l'install
        console.warn("[SW] precache warning:", err);
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Stratégie :
// - Navigations (SPA) : réseau → fallback cache /index.html si offline
// - Ressources même origine : cache d'abord, sinon réseau (+ mise en cache si OK)
// - On ignore les requêtes cross-origin (CDN, Google, etc.)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Ignorer cross-origin
  if (url.origin !== self.location.origin) return;

  // Navigations
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cached = await caches.match("/index.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Static same-origin
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          const cache = await caches.open(CACHE);
          cache.put(req, copy);
        }
        return res;
      } catch {
        // Fallback si la ressource fait partie de l'app shell
        const fallback = await caches.match(req.url.replace(self.location.origin, ""));
        return fallback || Response.error();
      }
    })()
  );
});
