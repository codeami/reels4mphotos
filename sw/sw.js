/* Precaching service worker. The build substitutes the PRECACHE constant below with the list of
 * built asset URLs (relative to this file). Privacy rule: only that fixed list
 * is ever cached. Requests for anything else (photos are never fetched anyway)
 * pass straight through and are never stored or re-sent. */
const CACHE = 'r4p-__VERSION__';
const PRECACHE = __PRECACHE__;
const scopeUrl = new URL('./', self.location.href);
const precacheUrls = new Set(PRECACHE.map((p) => new URL(p, scopeUrl).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...precacheUrls]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';
  const key = isNav ? new URL('./', scopeUrl).href : url.origin + url.pathname;
  if (!precacheUrls.has(key)) return;
  event.respondWith(caches.match(key).then((hit) => hit ?? fetch(req)));
});
