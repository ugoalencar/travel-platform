// Minimal service worker for the customer portal PWA.
//
// Scope is deliberately narrow: cache the static app shell (HTML/JS/CSS/
// icons) so the app can install and open instantly/offline, but NEVER
// cache /customer-api/*, /customer-auth/*, or /api/* responses -- trip,
// payment and document data must always be fetched fresh, and caching an
// authenticated response here would risk serving one customer's data
// after a different customer logs in on the same device.
const CACHE_NAME = 'minha-viagem-shell-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/customer-api') || url.pathname.startsWith('/customer-auth') || url.pathname.startsWith('/api');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.origin !== self.location.origin || isApiRequest(url)) {
    return; // let the network handle it untouched
  }

  if (event.request.mode === 'navigate') {
    // Network-first for page loads, falling back to the cached shell
    // (index.html) when offline so the SPA still opens -- the router then
    // renders whatever it can without live data.
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Static assets: cache-first, populating the cache on first fetch.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
