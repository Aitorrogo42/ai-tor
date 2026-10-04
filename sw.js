// AI-TOR service worker: precache everything (same-origin only) so the whole app works fully offline.
// The bundle contains NO user data: each user's finances live only in their own browser storage (localStorage).
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'aitor-v3';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'sections/finances/finances.css', 'sections/travels/travels.css',
  'js/app.js', 'js/sections.js', 'js/util.js', 'js/storage.js', 'js/ui.js', 'js/dataio.js', 'js/settings.js',
  'sections/finances/index.js', 'sections/finances/model.js', 'sections/finances/dashboard.js', 'sections/finances/edit.js', 'sections/finances/chart.js',
  'sections/travels/index.js', 'sections/travels/model.js', 'sections/travels/countries.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never touch cross-origin
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
  })));
});
