// Home selection wheel. A flat dial of thin white radial ticks around a hollow centre. The tick at 12 o'clock is the selection
// (longer, bolder, Ember); each section owns one "major" tick, the rest are minor ticks. Rotate it by dragging (touch / mouse), flicking
// (inertia + snap), tapping a tick, the arrow keys, Home/End or the mouse wheel; it always snaps so exactly one section is at the top.
// v17: the hollow centre shows ONLY the selected section's line icon and a Mars-red down marker (no text); v18: the marker is a bold solid down-pointing triangle; the section name stays as a visually
// hidden label + a polite live region for screen readers. The centre is the link that opens the section.
// v21: every paint dispatches a 'wheel-angle' event on window ({angle: continuous degrees, index, dragging}) for the dynamic sunrise background (js/bg.js).
// Reduced motion: no inertia or spring, the dial jumps to the new position. Flat: no blur, no glow, no shadow.
import { h } from './util.js';
import { icon, sectionGlyph, hasSectionGlyph } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const VB = 300, C = VB / 2, R0 = 96;                 // viewBox size, centre, inner radius of the ticks (hollow centre)
const PER = 12;                                      // ticks between two sections
const SIGMA = 21;                                    // degrees: how far from 12 o'clock a tick still grows
const EMBER = [255, 82, 56], WHITE = [255, 255, 255];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
const easeOutBack = (t) => { const c1 = 1.05, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// v17 focus policy: the focus ring on the wheel / centre button shows ONLY after a real keyboard interaction (html.kbd-nav). Any pointer / touch
// removes it, and scripted focus (splash hand-off, tapping the dial) never draws it, so no red ring appears on first load or first touch.
if (!window.__wheelModality) {
  window.__wheelModality = true;
  const html = document.documentElement;
  const KEYS = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ']);
  window.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey && KEYS.has(e.key)) html.classList.add('kbd-nav'); }, true);
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) window.addEventListener(t, () => html.classList.remove('kbd-nav'), { capture: true, passive: true });
}

let lastSel = 0;   // the wheel remembers the last section while the app stays open (coming back from a section)

/**
 * items: [{ id, title, route, iconName?, label? }]  (v18/v19: section ids finances|travels|todo|settings use the inline Set A glyph from icons.js; others iconName)
 * returns the wheel element (role=slider). `el.wheel` has { select(i, animate), index() }.
 */
export function createWheel(items) {
  const K = items.length, A = 360 / K, N = K * PER;
  let rot = -lastSel * A, sel = lastSel, raf = 0, anim = null;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`); svg.setAttribute('class', 'wheel-dial'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const ticks = [];
  for (let j = 0; j < N; j++) {
    const l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'tick'); l.dataset.j = String(j);
    svg.append(l); ticks.push(l);
  }

  const links = items.map((it, i) => h('a', { class: 'section-btn wheel-open' + (i === sel ? ' sel' : ''), 'aria-label': 'Open ' + it.title, href: it.route, 'data-section': it.id, id: it.id === 'settings' ? 'settings-link' : null, tabindex: i === sel ? '0' : '-1', 'aria-hidden': i === sel ? null : 'true' },
    h('span', { class: 'section-icon', 'aria-hidden': 'true' }, hasSectionGlyph(it.id) ? sectionGlyph(it.id) : icon(it.iconName || 'plus', 'ico ico-lg')),
    h('span', { class: 'section-title sr-only' }, it.title),                 // v17: screen-reader name only, nothing visible but the icon + arrow
    h('span', { class: 'wheel-arrow', 'aria-hidden': 'true' }, icon('triangleDown', 'ico', { filled: true }))));
  const centre = h('div', { class: 'wheel-centre' }, links);
  const live = h('div', { class: 'sr-only wheel-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });   // announces the selected section (the slider's children are presentational)
  const root = h('div', { class: 'wheel', id: 'wheel', role: 'slider', tabindex: '0', 'aria-label': 'Choose a section. Arrow keys turn the wheel, Enter opens it.',
    'aria-valuemin': '1', 'aria-valuemax': String(K), 'aria-orientation': 'horizontal' }, svg, centre);

  const nearest = (r) => ((Math.round(-r / A) % K) + K) % K;
  function paint() {
    for (let j = 0; j < N; j++) {
      const a = j * (360 / N), phi = wrap180(a + rot), g = Math.exp(-Math.pow(phi / SIGMA, 2));
      const major = j % PER === 0;
      const len = major ? 15 + 24 * g : 6 + 11 * g;
      const w = major ? 2.6 + 2.2 * g : 1.7 + 1.2 * g;
      const th = (a + rot) * Math.PI / 180, ux = Math.sin(th), uy = -Math.cos(th);
      const t = ticks[j];
      t.setAttribute('x1', (C + ux * R0).toFixed(2)); t.setAttribute('y1', (C + uy * R0).toFixed(2));
      t.setAttribute('x2', (C + ux * (R0 + len)).toFixed(2)); t.setAttribute('y2', (C + uy * (R0 + len)).toFixed(2));
      t.setAttribute('stroke-width', w.toFixed(2));
      t.setAttribute('stroke', major ? mix(WHITE, EMBER, g * g) : '#fff');
      t.setAttribute('stroke-opacity', (major ? 0.72 + 0.28 * g : 0.42 + 0.5 * g).toFixed(2));
    }
    const n = nearest(rot);
    if (n !== sel) setSel(n);
    // v21: the continuous dial angle drives the home background (js/bg.js turns it into the sun angle: one full turn = one Martian day)
    window.dispatchEvent(new CustomEvent('wheel-angle', { detail: { angle: rot, index: sel, dragging: !!drag } }));
  }
  function setSel(n) {
    sel = n; lastSel = n;
    links.forEach((a, i) => { const on = i === n; a.classList.toggle('sel', on); a.tabIndex = on ? 0 : -1; if (on) a.removeAttribute('aria-hidden'); else a.setAttribute('aria-hidden', 'true'); });
    live.textContent = items[n].title;
    if (!live.isConnected) { const att = () => { if (!live.isConnected && root.parentNode) root.after(live); }; if (root.parentNode) att(); else { Promise.resolve().then(att); requestAnimationFrame(att); } }
    root.setAttribute('aria-valuenow', String(n + 1)); root.setAttribute('aria-valuetext', items[n].title);
    if (!reduced() && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate && navigator.vibrate(6); } catch { /* not supported (iOS) */ } }
  }
  const targetFor = (i, from = rot) => { const base = -i * A; return base + 360 * Math.round((from - base) / 360); };
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; anim = null; }
  function animateTo(target, dur) {
    stop();
    if (reduced() || Math.abs(target - rot) < 0.01) { rot = target; paint(); return; }
    const from = rot, t0 = performance.now(); dur = dur || Math.min(640, 280 + Math.abs(target - from) * 2.4);
    anim = { target };
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      rot = from + (target - from) * easeOutBack(p); paint();
      if (p < 1) raf = requestAnimationFrame(step); else { rot = target; paint(); raf = 0; anim = null; }
    };
    raf = requestAnimationFrame(step);
  }
  const select = (i, animate = true) => { i = ((i % K) + K) % K; const tg = targetFor(i); if (animate) animateTo(tg); else { stop(); rot = tg; paint(); } };
  const step = (d) => animateTo((anim ? anim.target : -nearest(rot) * A) - d * A);   // d = +1 next section (wheel turns counter-clockwise)

  // ---- pointer: drag, flick, tap a tick
  let drag = null;
  const angleAt = (e) => { const r = root.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; };
  const inRing = (e) => { const r = root.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); return d > r.width * 0.5 * (R0 - 6) / C * 0.98; };
  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !inRing(e)) return;
    stop(); root.focus({ preventScroll: true, focusVisible: false });
    drag = { id: e.pointerId, a: angleAt(e), a0: angleAt(e), x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, samples: [[performance.now(), rot]] };
    try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    root.classList.add('drag');
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const a = angleAt(e); rot += wrap180(a - drag.a); drag.a = a;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
    const now = performance.now(); drag.samples.push([now, rot]); while (drag.samples.length > 2 && now - drag.samples[0][0] > 90) drag.samples.shift();
    paint();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; root.classList.remove('drag');
    try { root.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.type === 'pointercancel') { select(nearest(rot)); return; }
    if (d.moved < 8 && performance.now() - d.t0 < 500) {            // tap on a tick: bring the nearest section to the top
      let best = 0, bd = 1e9; for (let i = 0; i < K; i++) { const dd = Math.abs(wrap180(i * A + rot - d.a0)); if (dd < bd) { bd = dd; best = i; } }
      select(best); return;
    }
    const s = d.samples, last = s[s.length - 1];
    // release velocity in deg/ms over the last ~90 ms of movement; a pause before letting go means no flick
    const v = s.length > 1 && performance.now() - last[0] < 80 ? (last[1] - s[0][1]) / Math.max(1, last[0] - s[0][0]) : 0;
    const proj = rot + Math.max(-1.5 * A, Math.min(1.5 * A, v * 200));                                                                    // inertia: where it would coast to
    select(nearest(proj));
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);

  // ---- keyboard + mouse wheel
  root.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (k === 'Home') { e.preventDefault(); select(0); }
    else if (k === 'End') { e.preventDefault(); select(K - 1); }
    else if ((k === 'Enter' || k === ' ') && e.target === root) { e.preventDefault(); links[sel].click(); }
  });
  let wheelAt = 0;
  root.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 4) return;
    e.preventDefault();
    const now = performance.now(); if (now - wheelAt < 240) return; wheelAt = now;
    step(d > 0 ? 1 : -1);
  }, { passive: false });

  root.wheel = { select, step, index: () => sel, items };
  setSel(sel); paint();
  return root;
}
