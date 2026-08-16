// public/sw.js — minimal service worker, just enough to make the site
// installable as a home-screen app.
//
// Deliberately does NOT cache any HTML pages (dashboard, galleries, login) —
// those are dynamic and access-gated, so caching them could show stale or
// private content, or break the login/session flow. Only static, public
// assets are cached, and everything else always goes to the network.

const CACHE_NAME = 'mgb-gallery-static-v1';
const STATIC_ASSETS = [
  '/css/style.css',
  '/js/admin.js',
  '/js/client.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isStaticAsset = STATIC_ASSETS.includes(url.pathname);

  if (!isStaticAsset || event.request.method !== 'GET') {
    return; // let the browser handle everything else normally (network)
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
