// v44 Net-worth privacy blur. The headline total net worth (and the few places that repeat it exactly) is blurred every time the dashboard is drawn.
// While hidden the DOM holds a FIXED PLACEHOLDER, not the real number (so find-in-page, copy, reader mode and screen readers never see it), and the
// placeholder is also blurred (CSS filter) so it looks like a blurred number. Revealing swaps the real text back in. Nothing is stored: the state lives in
// this closure only, so it is hidden again after every re-render (open, feed refresh, edit) and whenever the page goes to the background.
import { h } from '../../js/util.js';
import { icon } from '../../js/icons.js';

export function netWorthPrivacy() {
  let hidden = true;
  const items = [];                       // { el, real, mask, kind: 'html' | 'svg' }
  const toggles = [];

  const paint = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.el.isConnected && it.seen) { items.splice(i, 1); continue; }
      it.seen = it.seen || it.el.isConnected;
      it.el.textContent = hidden ? it.mask : it.real;
      it.el.dataset.nwHidden = hidden ? 'true' : 'false';
      if (it.kind === 'html') it.el.classList.toggle('nw-blur', hidden);
      if (it.main) {                       // the headline carries the accessible name; the repeats are simply hidden from assistive tech
        if (hidden) { it.el.setAttribute('role', 'img'); it.el.setAttribute('aria-label', 'Net worth hidden'); it.el.removeAttribute('aria-hidden'); }
        else { it.el.removeAttribute('role'); it.el.removeAttribute('aria-label'); }
      } else if (hidden) { it.el.setAttribute('aria-hidden', 'true'); } else { it.el.removeAttribute('aria-hidden'); }
    }
    for (const b of toggles) {
      if (!b.isConnected) continue;
      b.querySelector('.nw-tl').textContent = hidden ? 'Show' : 'Hide';
      b.setAttribute('aria-label', hidden ? 'Show net worth' : 'Hide net worth');
      b.dataset.nwHidden = hidden ? 'true' : 'false';
      b.querySelector('.nw-ico').replaceChildren(icon(hidden ? 'eye' : 'eyeOff'));
    }
  };
  const set = (v) => { hidden = v; paint(); };

  /** A blurred span (or other tag) that shows `mask` while hidden and `real` once revealed. */
  function secret(real, mask, opts = {}) {
    const el = h(opts.tag || 'span', { class: (opts.cls || '') + ' nw-secret', id: opts.id });
    items.push({ el, real, mask, kind: 'html', main: !!opts.main });
    if (opts.main) { el.addEventListener('click', () => { if (hidden) set(false); }); }
    paint();
    return el;
  }
  /** Same for an SVG <text> (a bullet mask instead of a CSS blur: CSS filters on SVG children are not reliable on every browser). */
  function svgText(el, mask) {
    if (!el) return;
    items.push({ el, real: el.textContent, mask, kind: 'svg' });
    paint();
  }
  function toggle(target) {
    const b = h('button', { type: 'button', class: 'btn ghost small nw-toggle', id: 'nw-toggle', 'aria-controls': target, onclick: () => set(!hidden) },
      h('span', { class: 'nw-ico' }), h('span', { class: 'nw-tl' }));
    toggles.push(b);
    paint();
    return b;
  }
  // Re-hide whenever the app goes to the background / comes back (any visibility change) and when the page is hidden or frozen.
  const rehide = () => { if (!items.some((i) => i.el.isConnected)) { cleanup(); return; } if (!hidden) set(true); };
  const cleanup = () => { document.removeEventListener('visibilitychange', rehide); window.removeEventListener('pagehide', rehide); window.removeEventListener('pageshow', rehide); };
  document.addEventListener('visibilitychange', rehide);
  window.addEventListener('pagehide', rehide);
  window.addEventListener('pageshow', rehide);
  return { secret, svgText, toggle, set, isHidden: () => hidden };
}
