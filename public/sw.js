// Minimal PWA service worker.
// Scope: makes the app installable and caches static assets (JS/CSS/icons)
// so the shell loads instantly on repeat visits. It deliberately does NOT
// cache page data or API responses — this is a live financial system, so
// sales/stock data must always come from the network, never a stale cache.
// If the device is truly offline, navigation requests fall back to a simple
// "you're offline" page instead of showing stale POS data.

const CACHE_NAME = "pos-static-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png", "/icon-512.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API/data calls (Supabase, RPCs) — always go to network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, fall back to offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static build assets: cache-first for speed.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|jpg|svg|ico|css|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        });
      })
    );
  }
});
