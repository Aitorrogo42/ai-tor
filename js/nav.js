// Page transitions. Uses the View Transitions API (iOS 18+ Safari, Chrome) with shared-element morphs, and a Web Animations
// (WAAPI) fallback for everything else. Transform/opacity only. prefers-reduced-motion: plain short crossfade, no morphs.
//
// kinds: dive (home -> section), surface (section -> home), push / pop (deeper / shallower inside a section), tab (Visited <-> Destinations)
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mqReduce.matches;
export const supportsVT = () => typeof document.startViewTransition === 'function' && !window.__aitorNoVT;

const depthOf = (hash) => (hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean).length;
const TABS = ['#/travels', '#/travels/destinations'];

/** What kind of navigation is from -> to? null = same page. */
export function classify(from, to) {
  const f = (from || '#/').replace(/\/$/, '') || '#/', t = (to || '#/').replace(/\/$/, '') || '#/';
  if (f === t) return null;
  const df = depthOf(f), dt = depthOf(t);
  if (TABS.includes(f) && TABS.includes(t)) return 'tab';
  if (df === 0 && dt >= 1) return 'dive';
  if (dt === 0 && df >= 1) return 'surface';
  if (dt > df) return 'push';
  if (dt < df) return 'pop';
  return 'dive';
}
export const tabDir = (to) => ((to || '').replace(/\/$/, '') === '#/travels/destinations' ? 'tab-r' : 'tab-l');

const CLS = { dive: 'fwd', surface: 'back', push: 'push', pop: 'pop', tab: 'tab' };
const named = new Set();
function setName(el, name) { if (el) { el.style.viewTransitionName = name; named.add(el); } }
function clearNames() { for (const el of named) el.style.viewTransitionName = ''; named.clear(); }

// ---- shared-element pairs ----
const homeCard = (app, id) => id === 'settings' ? app.querySelector('a.gear') : app.querySelector(`a.section-btn[data-section="${id}"]`);
function nameHomeCard(app, id) {
  const c = homeCard(app, id); if (!c) return false;
  setName(c, 'sec-card');
  setName(c.querySelector('.section-icon img'), 'sec-icon');
  setName(c.querySelector('.section-title'), 'sec-title');
  return true;
}
function namePageHead(app) {
  const hd = app.querySelector('.fin-head'); if (!hd) return false;
  setName(hd, 'sec-card');
  setName(hd.querySelector('.sec-ico'), 'sec-icon');
  setName(hd.querySelector('.ph-title'), 'sec-title');
  return true;
}
const namePill = (app) => setName(app.querySelector('.tab-pill'), 'tab-pill');

let running = null;
let seq = 0;

/** Give the new page's items a staggered fade-up. Call after the page has rendered. */
export function markEnter(app, dir, { skipHead = false } = {}) {
  const host = app.firstElementChild && app.firstElementChild.classList.contains('section-root') ? app.firstElementChild : app;
  const items = [];
  for (const c of host.children) {
    if (c.classList.contains('section-list')) items.push(...c.children); else items.push(c);
  }
  let i = 0;
  for (const el of items) {
    if (i > 11) break;
    if (skipHead && el.classList.contains('fin-head')) continue;
    if (dir.startsWith('tab') && el.matches('.topbar,.fin-head,.trv-tabs')) continue;
    el.classList.add('stg'); el.style.setProperty('--i', String(i++));
  }
}
export function beginEnter(app, dir) {
  app.classList.remove('dir-fwd', 'dir-back', 'dir-push', 'dir-pop', 'dir-tab-r', 'dir-tab-l');
  app.classList.add('enter', 'dir-' + dir);
  clearTimeout(beginEnter.t);
  beginEnter.t = setTimeout(() => app.classList.remove('enter'), 1300);
}

/**
 * Run `commit` (swaps the DOM + renders the new page) inside an animated transition.
 * opts: { kind, app, secId (section being entered), prevSecId, to (new hash), enterDir }
 * commit(info) must render synchronously-visible content and resolve when the new page is in the DOM.
 */
export async function transition(opts, commit) {
  const { kind, app } = opts;
  const root = document.documentElement;
  const me = ++seq;
  if (running) { try { running.skipTransition(); } catch { /* already done */ } running = null; }
  clearNames(); root.className = root.className.replace(/\bvt-\S+/g, '').trim();
  const dir = kind === 'tab' ? tabDir(opts.to) : CLS[kind];
  const morph = !reduced() && (kind === 'dive' || kind === 'surface');
  const info = { dir, skipHead: false };

  // ---------- View Transitions path ----------
  if (supportsVT()) {
    let ok = false;
    if (morph) ok = kind === 'dive' ? nameHomeCard(app, opts.secId) : namePageHead(app);
    if (kind === 'tab' && !reduced()) namePill(app);
    root.classList.add('vt-' + (reduced() ? 'tab' : CLS[kind]));
    info.skipHead = morph && ok;
    let vt;
    try {
      vt = document.startViewTransition(async () => {
        await commit(info);
        if (morph) (kind === 'dive' ? namePageHead : (a) => nameHomeCard(a, opts.prevSecId))(app);
        if (kind === 'tab' && !reduced()) namePill(app);
      });
    } catch (e) { // some engines throw on odd states: fall through to a plain swap
      clearNames(); root.className = root.className.replace(/\bvt-\S+/g, '').trim();
      await commit(info); return;
    }
    running = vt;
    const done = () => { if (seq === me) { clearNames(); root.className = root.className.replace(/\bvt-\S+/g, '').trim(); } if (running === vt) running = null; };
    vt.finished.then(done, done);
    try { await vt.updateCallbackDone; } catch { /* commit threw: route() shows its own error card */ }
    return vt;
  }

  // ---------- fallback path (WAAPI) ----------
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const oldIcon = kind === 'dive' ? (homeCard(app, opts.secId) || document).querySelector('.section-icon img') : kind === 'surface' ? app.querySelector('.fin-head .sec-ico') : null;
  const oldRect = morph ? rect(oldIcon) : null;
  const oldPill = kind === 'tab' ? rect(app.querySelector('.tab-pill')) : null;
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const out = { dive: 'scale(.94)', surface: 'scale(1.05)', push: 'translate3d(-12%,0,0) scale(.97)', pop: 'translate3d(12%,0,0) scale(.97)', tab: 'none' }[kind];
  if (!reduced()) {
    try { await app.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: out }], { duration: kind === 'tab' ? 120 : 180, easing: 'ease-in', fill: 'forwards' }).finished; } catch { /* cancelled */ }
  }
  await commit(info);
  if (reduced()) { try { app.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); } catch { /* ignore */ } return; }
  try { app.getAnimations().forEach((a) => { if (a.effect && a.effect.target === app) a.cancel(); }); } catch { /* ignore */ }
  if (morph && oldRect) {
    const ni = kind === 'dive' ? app.querySelector('.fin-head .sec-ico') : (homeCard(app, opts.prevSecId) || document).querySelector('.section-icon img');
    const nr = rect(ni);
    if (ni && nr && nr.width) {
      const dx = oldRect.left - nr.left, dy = oldRect.top - nr.top, s = oldRect.width / nr.width;
      ni.style.position = 'relative'; ni.style.zIndex = '5';
      const a = ni.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 520, easing: ease });
      a.onfinish = a.oncancel = () => { ni.style.position = ''; ni.style.zIndex = ''; };
    }
  }
  if (kind === 'tab' && oldPill) {
    const np = app.querySelector('.tab-pill'); const nr = np && np.getBoundingClientRect();
    if (nr && nr.width) np.animate([{ transform: `translateX(${oldPill.left - nr.left}px) scaleX(${oldPill.width / nr.width})` }, { transform: 'none' }], { duration: 420, easing: ease });
  }
}
