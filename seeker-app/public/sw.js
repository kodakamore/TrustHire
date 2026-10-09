/* TrustHire Verify — service worker.
 *
 * Caching policy for a TRUST product:
 *   - App SHELL is cached → the app opens instantly and works offline.
 *   - /api/* is NETWORK-ONLY, always. Verification verdicts must NEVER be
 *     served from cache: a revoked ad shown as "verified" from a stale
 *     cache would be a trust failure. Offline lookups get an explicit
 *     503 so the UI says "can't verify right now" instead of lying.
 */
const VERSION = 'trusthire-shell-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // Parse the built index.html for hashed bundle URLs — the app shell is
      // not usable offline without its JS/CSS, so pre-cache them too.
      let assets = [];
      try {
        const index = await (await fetch('/index.html')).text();
        assets = [...index.matchAll(/(?:src|href)="(\/(?:assets|icons|scripts)\/[^"]+)"/g)].map((m) => m[1]);
      } catch { /* offline install: cache what we can */ }
      await Promise.all(
        [...SHELL, ...assets].map((url) =>
          cache.add(url).catch(() => {
            /* icon/asset may not exist in dev — shell must still install */
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ---- API: network only, never cached ------------------------------------
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              error: 'You appear to be offline. Verification requires an internet connection.',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    return;
  }

  // ---- SPA navigations: network first, shell fallback ---------------------
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // ---- Static assets: cache first, refresh in background ------------------
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
