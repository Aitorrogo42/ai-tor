import { sections } from './sections.js';
import { h, setCurrency } from './util.js';
import * as storage from './storage.js';
import { renderSettings } from './settings.js';
import { initBackground, setBackdropSection } from './bg.js';
import { initGlass } from './glass.js';
import { classify, transition, beginEnter, markEnter } from './nav.js';

const app = document.getElementById('app');
initBackground();
initGlass();
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (!location.hash || location.hash === '#/') route(); });

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// Settings gear: white line-art SVG (Feather "settings", MIT) to match the section icons
function gearIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z');
  svg.append(c, p);
  return svg;
}

function greetingText(name) {
  const hr = new Date().getHours();
  const part = hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function renderHome() {
  document.title = 'AI-TOR';
  const name = storage.getCore().profile.name;
  const list = h('nav', { class: 'section-list', 'aria-label': 'Sections' },
    sections.map((s) =>
      h('a', { class: 'section-btn', href: s.route, 'data-section': s.id },
        h('span', { class: 'section-icon', 'aria-hidden': 'true' }, h('img', { src: s.icon, width: '56', height: '56', alt: '', decoding: 'async' })),
        h('span', { class: 'section-text' },
          h('span', { class: 'section-title' }, s.title),
          s.subtitle ? h('span', { class: 'section-sub' }, s.subtitle) : null),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
  const foot = h('footer', { class: 'home-foot' },
    h('p', null, '🔒 Your data stays on this device. No accounts, no tracking.'));
  if (!isStandalone()) {
    if (deferredInstall) {
      foot.append(h('button', { class: 'ghost', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; route(); } }, 'Install AI-TOR'));
    } else {
      foot.append(h('p', { class: 'muted' }, 'To install: iPhone → Share → Add to Home Screen. Android → ⋮ menu → Install app.'));
    }
  }
  app.replaceChildren(
    h('header', { class: 'home-head' },
      h('div', { class: 'brand-row' },
        h('div', { class: 'brand' }, h('div', { class: 'logo', 'aria-hidden': 'true' }, 'AI'), h('h1', { class: 'wordmark' }, 'AI-TOR')),
        h('a', { class: 'gear', href: '#/settings', id: 'settings-link', 'aria-label': 'Settings' }, gearIcon())),
      h('p', { class: 'greeting', id: 'greeting' }, greetingText(name)),
      h('p', { class: 'tagline' }, name ? 'Your life, in one place.' : 'Your life, in one place. Add your name in Settings.')),
    list, foot);
}

// Raycast-style spotlight: the Mars glow on a home card follows the finger / pointer.
document.addEventListener('pointerdown', trackGlow, { passive: true });
document.addEventListener('pointermove', trackGlow, { passive: true });
function trackGlow(e) {
  const c = e.target && e.target.closest && e.target.closest('.section-btn');
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
  c.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
}

let shownHash = null;     // hash of the page currently on screen (null before the first render)
let shownSec = 'home';    // home | settings | <section id>

const secOf = (hash) => {
  if (!hash || hash === '#/') return 'home';
  if (hash === '#/settings') return 'settings';
  const s = sections.find((x) => hash === x.route || hash.startsWith(x.route + '/'));
  return s ? s.id : 'home';
};

/**
 * Render the page for location.hash. `animate` is true only for real navigations (hashchange / first load);
 * re-renders after a save or refresh pass nothing, so they never replay transitions.
 */
let navSeq = 0;
async function route(opts = {}) {
  const seq = ++navSeq;
  const hash = location.hash || '#/';
  const core = storage.getCore();
  setCurrency(core.profile.currency);
  const target = secOf(hash);
  const kind = opts.animate && shownHash != null ? classify(shownHash, hash) : null;
  const first = shownHash == null;
  const prevSec = shownSec;
  const animateIn = !!opts.animate || first;

  // what to draw (module is loaded BEFORE the transition starts, so the old page never freezes on a slow import)
  let build;
  if (hash === '#/settings') {
    build = async () => {
      const box = h('div', { class: 'section-root fin', 'data-section': 'settings' });
      app.replaceChildren(box);
      await renderSettings(box, { rerender: route });
    };
  } else {
    const section = sections.find((s) => hash === s.route || hash.startsWith(s.route + '/'));
    if (!section) build = async () => renderHome();
    else {
      let mod = null, loadErr = null;
      try { mod = await section.loader(); } catch (err) { loadErr = err; }
      if (seq !== navSeq) return;
      build = async () => {
        document.title = section.title + ' · AI-TOR';
        const showErr = (err) => {
          console.error(err);
          app.replaceChildren(
            h('a', { class: 'back', href: '#/' }, '‹ Home'),
            h('div', { class: 'card error' }, h('h2', null, 'Could not load ' + section.title), h('p', null, String(err && err.message || err))));
        };
        if (loadErr) return showErr(loadErr);
        try {
          const container = h('div', { class: 'section-root', 'data-section': section.id });
          app.replaceChildren(container);
          // each section only ever gets its own namespaced store
          await mod.render(container, { section, hash, store: storage.section(section.id), rerender: () => route() });
        } catch (err) { showErr(err); }
      };
    }
  }

  const commit = async (info = {}) => {
    if (seq !== navSeq) return;
    window.scrollTo(0, 0);
    if (animateIn) beginEnter(app, info.dir || 'fwd');
    setBackdropSection(target);
    await build();
    if (animateIn && seq === navSeq) markEnter(app, info.dir || 'fwd', { skipHead: !!info.skipHead });
    shownHash = hash; shownSec = target;
  };

  if (kind) {
    await transition({ kind, app, secId: target, prevSecId: prevSec, to: hash }, commit);
  } else {
    await commit({ dir: 'fwd' });
  }
}

window.addEventListener('hashchange', () => route({ animate: true }));
route({ animate: true });
storage.requestPersistence();

// Optional To-Do task sync: does nothing (and loads nothing) unless the user configured it in To-Do. At most once every few hours.
async function autoSync() {
  try {
    const c = storage.config('todo').get();
    if (!c || !c.passphrase) return;
    const m = await import('../sections/todo/sync.js');
    await m.maybeAutoSync();
  } catch (e) { console.warn('auto-sync skipped', e); }
}
autoSync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });

// Optional Finances feed refresh: needs the shared passphrase (set in Finances or To-Do). At most once per 15 minutes.
async function autoRefreshFinances() {
  try {
    const f = storage.config('feed').get(), t = storage.config('todo').get();
    if (!((f && f.passphrase) || (t && t.passphrase))) return;
    const m = await import('../sections/finances/feed.js');
    await m.maybeAutoRefresh();
  } catch (e) { console.warn('finances auto-refresh skipped', e); }
}
autoRefreshFinances();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoRefreshFinances(); });

// Optional Travels → Destinations feed (proposals from the Travel Guide): same shared passphrase, at most once per 15 minutes.
async function autoRefreshDestinations() {
  try {
    const f = storage.config('feed').get(), t = storage.config('todo').get();
    if (!((f && f.passphrase) || (t && t.passphrase))) return;
    const m = await import('../sections/travels/dest-feed.js');
    await m.maybeAutoRefresh();
  } catch (e) { console.warn('destinations auto-refresh skipped', e); }
}
autoRefreshDestinations();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoRefreshDestinations(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      reg.update().catch(() => {});
    }).catch((e) => console.warn('SW registration failed', e));
  });
}
