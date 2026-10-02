/*
 * Travel Lite service worker: app shell only.
 *
 * What it does: lets the installed app open instantly and show the shell
 * (login or last screen) with no network, by keeping the HTML shell, the
 * built assets (/assets/*), the icons and the manifest.
 *
 * What it must never do: touch /api/*. Business data, session tokens and
 * anything tenant-specific always go to the network and are never stored
 * here, so nothing from one user can be served to another and a logout
 * leaves nothing behind. Non-GET requests and other origins are ignored.
 */

const CACHE_PREFIX = 'travel-lite-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const SHELL_URL = '/';
const PRECACHE = [SHELL_URL, '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the API: no caching, no offline answers, no replay.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Network first so a new deploy is picked up; the cached shell is only
    // the offline fallback. Only successful HTML responses refresh it.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const type = response.headers.get('content-type') || '';
          if (response.ok && type.includes('text/html')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((shell) => shell || Response.error())),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // The server answers an unknown path with the HTML shell and a 200 (SPA
            // fallback): caching that under an asset URL would later serve HTML as a script.
            const type = response.headers.get('content-type') || '';
            if (response.ok && response.type === 'basic' && !type.includes('text/html')) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
