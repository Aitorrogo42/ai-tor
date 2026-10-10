// v46 Finances privacy: ONE Show / Hide toggle (a sticky bar at the top of the tab) blurs or reveals ALL of the user's personal figures together.
// (v44 did only the headline net worth, with a button beside it.) The guarantees of v44 hold for EVERY hidden figure:
//  - while hidden the DOM holds a FIXED PLACEHOLDER, never the real number (so find-in-page, copy, reader mode, screen readers and attributes such as
//    aria-label / data-count never see it), and the placeholder is also blurred (CSS filter, >= 8 px) so it looks like a blurred number;
//  - not selectable, aria-hidden (the headline carries one accessible name);
//  - nothing is stored: the state lives in this closure only, so every draw (open, re-render, feed refresh, edit) starts hidden again, and the app going
//    to the background (visibilitychange / pagehide / pageshow) hides everything again.
// Public data (ticker prices and day change, dates, labels, the "Updated ... as of ..." bar, a group's share of assets) is simply not wrapped.
import { h } from '../../js/util.js';
import { icon } from '../../js/icons.js';

/** Fixed-length placeholders (the same length for every amount, so the width never reveals the magnitude). */
export const MASK = { money: '$88,888', big: '$8,888,888', pct: '88%', chart: '$\u2022\u2022\u2022', text: 'Hidden. Tap Show to read.' };

export function financePrivacy() {
  let hidden = true;
  const items = [];                       // { el, kind, real, mask, main, seen }
  const toggles = [];
  const hideHooks = [];

  const paintItem = (it) => {
    const el = it.el;
    if (it.kind === 'attr') {             // an attribute that would carry the real number (aria-label, ...): swap, or remove when no neutral text
      if (hidden) { if (it.mask == null) el.removeAttribute(it.name); else el.setAttribute(it.name, it.mask); }
      else if (it.real == null) el.removeAttribute(it.name); else el.setAttribute(it.name, it.real);
      return;
    }
    if (it.kind === 'swap') {             // a whole group of SVG / HTML nodes (e.g. the past line of the projection chart): only the placeholder nodes are in the DOM while hidden
      el.replaceChildren(...(hidden ? it.mask : it.real));
      el.dataset.nwHidden = hidden ? 'true' : 'false';
      return;
    }
    el.dataset.nwHidden = hidden ? 'true' : 'false';
    if (it.kind === 'bar') {              // a progress bar: its width is a ratio of a personal number
      el.style.width = hidden ? it.mask : it.real;
      el.classList.toggle('nw-blur', hidden);
      if (hidden) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
      return;
    }
    el.textContent = hidden ? it.mask : it.real;
    if (it.kind === 'html') el.classList.toggle('nw-blur', hidden);
    if (it.main) {                         // the headline carries the accessible name; the repeats are simply hidden from assistive tech
      if (hidden) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Net worth hidden'); el.removeAttribute('aria-hidden'); }
      else { el.removeAttribute('role'); el.removeAttribute('aria-label'); }
    } else if (hidden) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  };
  const paint = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.el.isConnected && it.seen) { items.splice(i, 1); continue; }
      it.seen = it.seen || it.el.isConnected;
      paintItem(it);
    }
    for (const b of toggles) {
      if (!b.isConnected) continue;
      b.querySelector('.nw-tl').textContent = hidden ? 'Show' : 'Hide';
      b.setAttribute('aria-label', hidden ? 'Show personal figures' : 'Hide personal figures');
      b.setAttribute('aria-pressed', hidden ? 'false' : 'true');
      b.dataset.nwHidden = hidden ? 'true' : 'false';
      b.querySelector('.nw-ico').replaceChildren(icon(hidden ? 'eye' : 'eyeOff'));
      const st = b.closest('.privbar') && b.closest('.privbar').querySelector('.pb-state');
      if (st) st.textContent = hidden ? 'Hidden' : 'Visible';
      const bar = b.closest('.privbar'); if (bar) bar.dataset.nwHidden = hidden ? 'true' : 'false';
    }
  };
  const set = (v) => {
    const was = hidden; hidden = v; paint();
    if (v && !was) for (const fn of hideHooks.slice()) { try { fn(); } catch (e) { console.warn(e); } }   // e.g. close an open number editor
  };

  /** A blurred span (or other tag) that shows `mask` while hidden and `real` once revealed. */
  function secret(real, mask = MASK.money, opts = {}) {
    const el = h(opts.tag || 'span', { class: (opts.cls || '') + ' nw-secret', id: opts.id });
    items.push({ el, real: String(real), mask, kind: 'html', main: !!opts.main });
    if (opts.main) el.addEventListener('click', () => { if (hidden) set(false); });
    paint();
    return el;
  }
  /** Same for an SVG <text> (a bullet mask instead of a CSS blur: CSS filters on SVG children are not reliable on every browser). */
  function svgText(el, mask) {
    if (!el) return;
    items.push({ el, real: el.textContent, mask, kind: 'svg' });
    paint();
  }
  /** Swap an attribute (aria-label, ...) so the real number is not in the DOM while hidden. mask null = remove it while hidden. */
  function attr(el, name, real, mask = null) {
    if (!el) return;
    items.push({ el, kind: 'attr', name, real, mask });
    paint();
  }
  /** Replace the children of `el` (an SVG <g>) by `maskNodes` while hidden and by `realNodes` once revealed (the real nodes are kept in memory, never in the page while hidden). */
  function swap(el, realNodes, maskNodes) {
    items.push({ el, kind: 'swap', real: realNodes, mask: maskNodes });
    paint();
    return el;
  }
  /** A progress bar element (<i>): constant placeholder width + blur while hidden, the real width once revealed. */
  function bar(el, realWidth, maskWidth = '50%') {
    items.push({ el, kind: 'bar', real: realWidth, mask: maskWidth });
    paint();
    return el;
  }
  /** Mark every [data-mask] SVG text of a chart (the projection / savings charts put the amount labels there). */
  function chart(svg) {
    svg.querySelectorAll('[data-mask]').forEach((t) => svgText(t, t.getAttribute('data-mask')));
    return svg;
  }
  /** The sticky bar at the very top of the tab: the ONE Show / Hide button for every personal figure. */
  function toggleBar(target = 'networth') {
    const b = h('button', { type: 'button', class: 'btn primary small nw-toggle', id: 'priv-toggle', 'aria-controls': target, onclick: () => set(!hidden) },
      h('span', { class: 'nw-ico' }), h('span', { class: 'nw-tl' }));
    toggles.push(b);
    const bar = h('div', { class: 'privbar', id: 'privbar' },
      h('div', { class: 'pb-text', role: 'status' }, h('b', { class: 'pb-t' }, 'Your figures'), h('span', { class: 'pb-state' })),
      b);
    paint();
    return bar;
  }
  /** Called each time the figures go from visible to hidden (the number editor uses it so a typed amount never stays on screen). */
  const onHide = (fn) => { hideHooks.push(fn); };
  // Re-hide whenever the app goes to the background / comes back (any visibility change) and when the page is hidden or frozen.
  const rehide = () => { if (!toggles.some((t) => t.isConnected) && !items.some((i) => i.el.isConnected)) { cleanup(); return; } if (!hidden) set(true); };
  const cleanup = () => { document.removeEventListener('visibilitychange', rehide); window.removeEventListener('pagehide', rehide); window.removeEventListener('pageshow', rehide); };
  document.addEventListener('visibilitychange', rehide);
  window.addEventListener('pagehide', rehide);
  window.addEventListener('pageshow', rehide);
  return { secret, svgText, attr, bar, swap, chart, toggleBar, onHide, set, isHidden: () => hidden };
}
export const netWorthPrivacy = financePrivacy;   // v44 name, kept for anything that still imports it
