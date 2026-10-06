// AI-TOR service worker: precache everything (same-origin only) so the whole app works fully offline.
// The bundle contains NO user data: each user's finances live only in their own browser storage (localStorage).
// The encrypted feeds (feed/tasks.enc.json, feed/finances.enc.json, feed/destinations.enc.json; anything under feed/) is NEVER precached or served cache-first: it is fetched network-first and the last copy
// is kept in a separate cache ('aitor-feed') only as an offline fallback.
// v24: new section Architecture (sections/architecture/*) + chamfered rectangles inside sections (css/chamfer.css). v23: page transitions no longer scale/fade the Mars background twice (flicker fix, see README). v22: sections freeze the sunrise scene of their wheel position as their static background (js/sol.js; the section registry drives the wheel, the sun angles and the headers for any number of sections). v21: dynamic sunrise background (js/sunrise.js WebGL shader + assets/mars-map.webp, driven by the home wheel; Settings toggle). v20: To-Do 'Paste a list' (sections/todo/paste.js). v15: flat style (css/flat.css replaces css/glass.css + js/glass.js), A logo + lockup. v16: To-Do split into Personal / Work lists (no new files). v17: wheel centre = icon + Mars down arrow only (no text). v18: the arrow becomes a bold solid Ember down triangle; section icons = inline Set A solid SVGs (icons/sections/*.png no longer precached, kept in the repo).
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'aitor-v31';
const FEED_CACHE = 'aitor-feed';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'css/motion.css', 'css/flat.css', 'css/chamfer.css', 'assets/mars-photo.webp', 'assets/mars-map.webp', 'sections/finances/finances.css', 'sections/travels/travels.css', 'sections/todo/todo.css', 'sections/architecture/architecture.css',
  'js/app.js', 'js/sections.js', 'js/util.js', 'js/storage.js', 'js/ui.js', 'js/dataio.js', 'js/settings.js', 'js/feedcrypto.js', 'js/bg.js', 'js/sunrise.js', 'js/sol.js', 'js/nav.js', 'js/brand.js', 'js/splash.js', 'js/wheel.js', 'js/icons.js',
  'sections/finances/index.js', 'sections/finances/model.js', 'sections/finances/dashboard.js', 'sections/finances/edit.js', 'sections/finances/chart.js', 'sections/finances/feed.js', 'sections/finances/refreshbar.js',
  'sections/travels/index.js', 'sections/travels/model.js', 'sections/travels/countries.js', 'sections/travels/dest-model.js', 'sections/travels/dest-feed.js', 'sections/travels/dest-ui.js',
  'sections/todo/index.js', 'sections/todo/model.js', 'sections/todo/sync.js', 'sections/todo/paste.js',
  'sections/architecture/index.js', 'sections/architecture/model.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon.svg', 'icons/favicon.ico',
  'fonts/league-spartan-latin.woff2', 'fonts/league-spartan-latin-ext.woff2',
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
