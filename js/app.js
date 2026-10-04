import { sections } from './sections.js';
import { h, setCurrency } from './util.js';
import * as storage from './storage.js';
import { renderSettings } from './settings.js';

const app = document.getElementById('app');
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (!location.hash || location.hash === '#/') route(); });

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function renderHome() {
  document.title = 'AI-TOR';
  const name = storage.getCore().profile.name;
  const list = h('nav', { class: 'section-list', 'aria-label': 'Sections' },
    sections.map((s) =>
      h('a', { class: 'section-btn', href: s.route, 'data-section': s.id },
        h('span', { class: 'section-icon', 'aria-hidden': 'true' }, s.icon),
        h('span', { class: 'section-text' },
          h('span', { class: 'section-title' }, s.title),
          s.subtitle ? h('span', { class: 'section-sub' }, s.subtitle) : null),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
  const foot = h('footer', { class: 'home-foot' },
    h('p', null, '🔒 Your data stays on this device. No accounts, no tracking, no network calls.'));
  if (!isStandalone()) {
    if (deferredInstall) {
      foot.append(h('button', { class: 'ghost', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; route(); } }, 'Install AI-TOR'));
    } else {
      foot.append(h('p', { class: 'muted' }, 'To install: iPhone → Share → Add to Home Screen. Android → ⋮ menu → Install app.'));
    }
  }
  app.replaceChildren(
    h('header', { class: 'home-head' },
      h('a', { class: 'gear', href: '#/settings', id: 'settings-link', 'aria-label': 'Settings' }, '⚙️'),
      h('div', { class: 'logo', 'aria-hidden': 'true' }, 'AI'),
      h('h1', null, 'AI-TOR'),
      h('p', { class: 'greeting', id: 'greeting' }, name ? `Hello, ${name}` : 'Welcome'),
      h('p', { class: 'tagline' }, name ? 'Your life, in one place.' : 'Your life, in one place. Add your name in Settings.')),
    list, foot);
}

async function route() {
  const hash = location.hash || '#/';
  let core = storage.getCore();
  setCurrency(core.profile.currency);
  window.scrollTo(0, 0);
  if (hash === '#/settings') {
    const box = h('div', { class: 'section-root fin' });
    app.replaceChildren(box);
    await renderSettings(box, { rerender: route });
    return;
  }
  const section = sections.find((s) => hash === s.route || hash.startsWith(s.route + '/'));
  if (!section) { renderHome(); return; }
  document.title = section.title + ' · AI-TOR';
  app.replaceChildren(h('p', { class: 'loading' }, 'Loading…'));
  try {
    const mod = await section.loader();
    const container = h('div', { class: 'section-root', 'data-section': section.id });
    app.replaceChildren(container);
    // each section only ever gets its own namespaced store
    await mod.render(container, { section, hash, store: storage.section(section.id), rerender: () => route() });
  } catch (err) {
    console.error(err);
    app.replaceChildren(
      h('a', { class: 'back', href: '#/' }, '‹ Home'),
      h('div', { class: 'card error' }, h('h2', null, 'Could not load ' + section.title), h('p', null, String(err && err.message || err))));
  }
}

window.addEventListener('hashchange', route);
route();
storage.requestPersistence();

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
