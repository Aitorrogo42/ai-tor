import { sections } from './sections.js';
import { lockup } from './brand.js';
import { icon } from './icons.js';
import { h, setCurrency } from './util.js';
import * as storage from './storage.js';
import { renderSettings } from './settings.js';
import { initBackground, setBackdropSection } from './bg.js';
import { createWheel } from './wheel.js';
import { classify, transition, beginEnter, markEnter } from './nav.js';
import { splashWanted, armSplash, skipNextSplash } from './splash.js';

const app = document.getElementById('app');
const splashOn = splashWanted();   // launch splash (see js/splash.js): the first render must not start its entrance animation behind it
initBackground();
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; const f = document.getElementById('app-foot'); if (f) f.replaceWith(buildFoot()); });

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}


function greetingText(name) {
  const hr = new Date().getHours();
  const part = hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

/** Privacy line + install hint (v18: moved from the home screen to the bottom of Settings). */
function buildFoot() {
  const foot = h('footer', { class: 'app-foot', id: 'app-foot' },
    h('p', { class: 'priv' }, icon('lock'), 'Your data stays on this device. No tracking.'));
  if (!isStandalone()) {
    if (deferredInstall) {
      foot.append(h('button', { class: 'ghost', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; const f = document.getElementById('app-foot'); if (f) f.replaceWith(buildFoot()); } }, 'Install AI-TOR'));
    } else {
      foot.append(h('details', { class: 'install-hint' }, h('summary', null, 'Install on your phone'),
        h('p', null, 'iPhone: Share, then Add to Home Screen. Android: browser menu, then Install app.')));
    }
  }
  return foot;
}

function renderHome() {
  document.title = 'AI-TOR';
  const name = storage.getCore().profile.name;
  // the home selection wheel (js/wheel.js): one entry per section + Settings
  const wheelItems = [...sections.map((x) => ({ id: x.id, title: x.title, route: x.route })), { id: 'settings', title: 'Settings', route: '#/settings' }];
  const list = createWheel(wheelItems);
  app.replaceChildren(
    h('header', { class: 'home-head' },
      h('h1', { class: 'lockup-h1', 'aria-label': 'ai-tor' }, lockup('lockup lockup-hero'))),
    list,
    h('div', { class: 'home-greet' },    // v19: greeting block at the very bottom of the screen (fixed, above the safe-area / home indicator)
      h('p', { class: 'greeting', id: 'greeting' }, greetingText(name)),
      h('p', { class: 'tagline' }, name ? 'Your finances, travels and to-do list in one place.' : 'Your finances, travels and to-do list in one place. Add your name in Settings.')));   // v18: no footer on the home screen; the privacy line + install hint now live at the bottom of Settings (buildFoot)
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
  const animateIn = (!!opts.animate || first) && !(first && splashOn);

  // what to draw (module is loaded BEFORE the transition starts, so the old page never freezes on a slow import)
  let build;
  if (hash === '#/settings') {
    build = async () => {
      const box = h('div', { class: 'section-root fin', 'data-section': 'settings' });
      app.replaceChildren(box);
      await renderSettings(box, { rerender: route });
      box.append(buildFoot());
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
            h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
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
const firstRoute = route({ animate: true });
if (splashOn) armSplash(firstRoute, () => { beginEnter(app, 'fwd'); markEnter(app, 'fwd'); });
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
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; skipNextSplash(); location.reload(); } });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      if (!reg || typeof reg.update !== 'function') return;   // some embedded/blocked contexts resolve with nothing
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      reg.update().catch(() => {});
    }).catch((e) => console.warn('SW registration failed', e));
  });
}
