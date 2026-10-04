// AI-TOR service worker: precache everything (same-origin only) so the whole app works fully offline.
// The bundle contains NO user data: each user's finances live only in their own browser storage (localStorage).
// The encrypted feeds (feed/tasks.enc.json, feed/finances.enc.json, feed/destinations.enc.json; anything under feed/) is NEVER precached or served cache-first: it is fetched network-first and the last copy
// is kept in a separate cache ('aitor-feed') only as an offline fallback.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'aitor-v10';
const FEED_CACHE = 'aitor-feed';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'sections/finances/finances.css', 'sections/travels/travels.css', 'sections/todo/todo.css',
  'js/app.js', 'js/sections.js', 'js/util.js', 'js/storage.js', 'js/ui.js', 'js/dataio.js', 'js/settings.js', 'js/feedcrypto.js',
  'sections/finances/index.js', 'sections/finances/model.js', 'sections/finances/dashboard.js', 'sections/finances/edit.js', 'sections/finances/chart.js', 'sections/finances/feed.js', 'sections/finances/refreshbar.js',
  'sections/travels/index.js', 'sections/travels/model.js', 'sections/travels/countries.js', 'sections/travels/dest-model.js', 'sections/travels/dest-feed.js', 'sections/travels/dest-ui.js',
  'sections/todo/index.js', 'sections/todo/model.js', 'sections/todo/sync.js',
  'icons/sections/finances-256.png', 'icons/sections/travels-256.png', 'icons/sections/todo-256.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(PRECACHE.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return c.put(u, r); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== FEED_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never touch cross-origin
  if (url.pathname.includes('/feed/')) {   // network-first, offline fallback = last good copy
    e.respondWith(fetch(new Request(req, { cache: 'no-store' })).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(FEED_CACHE).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(() => caches.open(FEED_CACHE).then((c) => c.match(url.pathname)).then((r) => r || Response.error())));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
  })));
});
