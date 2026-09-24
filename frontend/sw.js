// Service worker: the app shell and the 3D engine are precached so the planner opens without a connection.
// Project data never goes through this cache: it lives in IndexedDB per user (src/offline). Uploaded
// textures/models are cached as they are used ("media") and wiped on sign-out.
// Injected by the build (frontend/vite.config.ts): { version, files, external }. Changing it changes this
// file's bytes, which is what makes browsers install the new version.
const PRECACHE = self.__PRECACHE__;
const APP = `app-${PRECACHE.version}`;
const MEDIA = 'media-v1';
const RUNTIME = 'runtime-v1';
const CROSS_ORIGIN_OK = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP);
      await cache.addAll(PRECACHE.files.map((f) => new Request(f, { cache: 'reload' })));
      await Promise.all(PRECACHE.external.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => cache.put(u, r)).catch(() => {})));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function fromApp(req) {
  return (await caches.open(APP)).match(req, { ignoreSearch: true });
}

async function cacheFirst(req, cacheName) {
  const hit = (await fromApp(req)) || (await caches.match(req));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || net;
}

async function page(req) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(req, { signal: ctl.signal });
    clearTimeout(t);
    return res;
  } catch {
    return (await fromApp('/index.html')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Uploaded files (disk storage): immutable URLs.
    if (url.pathname.startsWith('/api/v1/storage/')) return event.respondWith(cacheFirst(req, MEDIA));
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return; // API: network only
    if (url.pathname.startsWith('/prototipo/')) return;
    if (req.mode === 'navigate') return event.respondWith(page(req));
    return event.respondWith(cacheFirst(req, RUNTIME));
  }
  if (/\.blob\.vercel-storage\.com$/.test(url.hostname)) return event.respondWith(cacheFirst(req, MEDIA));
  if (CROSS_ORIGIN_OK.includes(url.origin)) return event.respondWith(staleWhileRevalidate(req));
});
