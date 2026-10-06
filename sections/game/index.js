// Game section (v32 / 2.11.0): "Keep Mars up". A small Mars falls from the top; tap it to bounce it back up; don't let it fall off the bottom.
//   - score = bounces (+3 for tapping a passing Phobos / Deimos bonus moon); the best score is saved on this device (aitor:sec:game, included in backups);
//   - gravity grows slowly with every bounce; where you tap on the planet decides the sideways kick; it bounces off the side walls (and softly off the top);
//   - a dust puff + ring on every tap, a short haptic tick where supported (navigator.vibrate; iOS ignores it), a small screen shake on a miss;
//   - from 20 points a second, smaller planet joins; pauses when the tab / app is hidden or the page is left; start / pause / game-over overlay.
// One <canvas> (DPR capped at 2), requestAnimationFrame with a fixed-step integrator (stable at 60 / 120 Hz), touch-action:none (no scroll / zoom while playing).
// Reduced motion: no screen shake, fewer particles, no planet spin; the game itself is unchanged (it is user-driven).
import { h, pageTitle } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { emptyDoc, validate, summary } from './model.js';

export { validate, summary, emptyDoc };
export const storageId = 'game';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ } };

/** Pure game physics, exported for tests. state = { W, H, g, balls:[{x,y,vx,vy,r,spin,a}], ... }. dt in seconds. Returns 'miss' when a planet left the bottom. */
export function stepPhysics(st, dt) {
  for (const b of st.balls) {
    b.vy += st.g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vx *= Math.pow(0.82, dt);                                     // a little air drag on the sideways motion
    b.a += b.spin * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.86; b.spin = -b.spin; }
    if (b.x > st.W - b.r) { b.x = st.W - b.r; b.vx = -Math.abs(b.vx) * 0.86; b.spin = -b.spin; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.35; }
    if (b.y - b.r > st.H) return 'miss';
  }
  return null;
}
/** Tap on a planet at (tx, ty): upward kick (enough to rise ~55 % of the field), sideways kick from the tap offset. Returns true if it was a hit. */
export function tapBall(st, b, tx, ty) {
  const dx = b.x - tx, dy = b.y - ty, reach = b.r * 1.55 + 10;     // forgiving hit area for fingers
  if (dx * dx + dy * dy > reach * reach) return false;
  b.vy = -Math.sqrt(2 * st.g * st.H * 0.55);
  b.vx = Math.max(-1, Math.min(1, dx / reach)) * st.W * 0.9 + b.vx * 0.25;
  b.spin = (dx / reach) * 4;
  return true;
}

function marsSprite(r) {                                             // pre-rendered planet (drawn once per size, then drawImage + rotate)
  const s = Math.ceil(r * 2 + 4), c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'), m = s / 2;
  const g = x.createRadialGradient(m - r * .35, m - r * .4, r * .1, m, m, r);
  g.addColorStop(0, '#f08a5a'); g.addColorStop(.55, '#c4472b'); g.addColorStop(1, '#5e1a12');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.fill();
  x.save(); x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.clip();
  x.fillStyle = 'rgba(70,16,10,.38)';
  for (const [cx, cy, cr] of [[-.35, .15, .22], [.3, -.25, .14], [.18, .42, .12], [-.1, -.5, .09], [.5, .2, .08]]) { x.beginPath(); x.arc(m + cx * r, m + cy * r, cr * r, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = 'rgba(255,215,190,.22)'; x.fillRect(m - r, m - r * .62, r * 2, r * .1);   // a faint polar-cap band
  x.restore();
  return c;
}

export async function render(root, ctx) {
  root.className = 'section-root fin game';
  document.title = 'Game · AI-TOR';
  const store = ctx.store;
  let doc = emptyDoc();
  const raw = store.get(); if (raw) { const v = validate(raw); if (v.ok) doc = v.doc; }

  const cv = h('canvas', { class: 'game-cv', id: 'game-cv', 'aria-label': 'Game field: tap the falling planet to keep it up', role: 'img' });
  const scoreEl = h('span', { class: 'game-score', id: 'game-score' }, '0');
  const bestEl = h('span', { class: 'game-best', id: 'game-best' }, 'Best ' + doc.best);
  const ovTitle = h('h2', { class: 'game-ov-title', id: 'game-ov-title' }, 'Keep Mars up');
  const ovText = h('p', { class: 'game-ov-text', id: 'game-ov-text' }, 'Tap the falling planet to bounce it. Where you tap decides the sideways kick. Don\'t let it fall off the bottom.');
  const ovBtn = h('button', { type: 'button', class: 'btn primary', id: 'game-start' }, 'Start');
  const overlay = h('div', { class: 'game-overlay', id: 'game-overlay' }, h('div', { class: 'card game-ov-card' }, ovTitle, ovText, ovBtn));
  const field = h('div', { class: 'game-field', id: 'game-field' }, cv, h('div', { class: 'game-hud', 'aria-hidden': 'true' }, scoreEl, bestEl), overlay);
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', id: 'game-live' });
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
    h('div', { class: 'fin-head' }, pageTitle('game', 'Game')),
    field, live);

  const c2 = cv.getContext('2d');
  let W = 300, H = 400, dpr = 1, sprite = null, spriteSmall = null, raf = 0, last = 0, acc = 0;
  const st = { W, H, g: 0, balls: [], parts: [], moon: null, score: 0, mode: 'ready', shake: 0, nextMoon: 6, t: 0 };
  const STEP = 1 / 120;

  function size() {
    // layout sizes (offset*), not getBoundingClientRect: the page may still be scaled / moved by the page transition when this runs
    let top = 0; for (let e = field; e; e = e.offsetParent) top += e.offsetTop;
    const avail = Math.max(320, Math.round(window.innerHeight - top - 14));
    field.style.height = avail + 'px';
    W = field.clientWidth; H = field.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const R = Math.round(Math.max(22, Math.min(34, W * 0.075)));
    sprite = marsSprite(R); spriteSmall = marsSprite(Math.round(R * 0.72));
    const sx = W / (st.W || W), sy = H / (st.H || H);
    for (const b of st.balls) { b.x *= sx; b.y *= sy; }
    st.W = W; st.H = H;
    draw();
  }
  const newBall = (small) => { const R = (small ? spriteSmall : sprite).width / 2 - 2; return { x: W * (0.3 + 0.4 * Math.random()), y: -R, vx: (Math.random() - 0.5) * W * 0.3, vy: 0, r: R, spin: 0, a: 0, small }; };
  function reset() {
    st.g = H * 1.15; st.balls = [newBall(false)]; st.balls[0].y = H * 0.18; st.balls[0].vy = -H * 0.2; st.parts = []; st.moon = null; st.score = 0; st.nextMoon = 6; st.shake = 0; st.t = 0;
    scoreEl.textContent = '0';
  }
  function setOverlay(mode) {
    overlay.hidden = mode === 'play';
    if (mode === 'ready') { ovTitle.textContent = 'Keep Mars up'; ovBtn.textContent = 'Start'; }
    if (mode === 'paused') { ovTitle.textContent = 'Paused'; ovText.textContent = `Score ${st.score}. Tap to carry on.`; ovBtn.textContent = 'Resume'; }
    if (mode === 'over') { ovTitle.textContent = st.score > 0 && st.score >= doc.best ? 'New best!' : 'Lost in space'; ovText.textContent = `Score ${st.score} · Best ${doc.best}`; ovBtn.textContent = 'Play again'; }
  }
  function start() {
    if (st.mode === 'paused') { st.mode = 'play'; setOverlay('play'); loop(); return; }
    reset(); st.mode = 'play'; setOverlay('play'); loop();
  }
  ovBtn.addEventListener('click', start);
  function pause() { if (st.mode !== 'play') return; st.mode = 'paused'; stopLoop(); setOverlay('paused'); draw(); }
  function over() {
    st.mode = 'over'; stopLoop();
    doc.played += 1; if (st.score > doc.best) doc.best = st.score; doc.updatedAt = new Date().toISOString();
    try { store.set(doc); } catch { /* storage full / private mode: the game still works */ }
    bestEl.textContent = 'Best ' + doc.best; live.textContent = `Game over. Score ${st.score}, best ${doc.best}.`;
    if (!reduced()) st.shake = 0.35;
    buzz([30, 40, 30]);
    let n = 0; const shakeOut = () => { draw(); if (st.shake > 0 && n++ < 30) { st.shake -= 1 / 60; requestAnimationFrame(shakeOut); } else { st.shake = 0; draw(); } };
    shakeOut();
    setOverlay('over');
  }
  function puff(x, y, col) {
    const n = reduced() ? 6 : 16;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 140; st.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 30, life: 0.5 + Math.random() * 0.3, t: 0, col, ring: false }); }
    st.parts.push({ x, y, vx: 0, vy: 0, life: 0.45, t: 0, col, ring: true });
  }
  function onTap(e) {
    if (st.mode !== 'play') return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), tx = e.clientX - r.left, ty = e.clientY - r.top;
    if (st.moon) { const m = st.moon, dx = m.x - tx, dy = m.y - ty; if (dx * dx + dy * dy < (m.r + 18) ** 2) { st.score += 3; puff(m.x, m.y, '255,236,210'); st.moon = null; scoreEl.textContent = String(st.score); buzz(12); return; } }
    for (const b of st.balls) {
      if (tapBall(st, b, tx, ty)) {
        st.score += 1; st.g = H * (1.15 + Math.min(1.1, st.score * 0.03));   // gravity slowly grows (caps at ~2x)
        scoreEl.textContent = String(st.score); puff(b.x, b.y + b.r * 0.6, '255,170,120'); buzz(8);
        if (st.score === 20 && st.balls.length === 1) st.balls.push(newBall(true));
        if (st.score >= st.nextMoon && !st.moon) { st.nextMoon = st.score + 7 + Math.floor(Math.random() * 6); const fromL = Math.random() < 0.5, R = Math.max(9, W * 0.025); st.moon = { x: fromL ? -R : W + R, y: H * (0.15 + 0.3 * Math.random()), vx: (fromL ? 1 : -1) * W * 0.28, r: R, name: Math.random() < 0.5 ? 'Phobos' : 'Deimos' }; }
        return;
      }
    }
  }
  cv.addEventListener('pointerdown', onTap);
  cv.addEventListener('touchstart', (e) => { if (st.mode === 'play') e.preventDefault(); }, { passive: false });   // no double-tap zoom / scroll while playing

  function update(dt) {
    if (st.mode !== 'play') return;                                   // never run (or end) a game twice, e.g. a test step right after the loop's own game over
    st.t += dt;
    if (stepPhysics(st, dt) === 'miss') return over();
    if (st.moon) { st.moon.x += st.moon.vx * dt; if (st.moon.x < -40 || st.moon.x > W + 40) st.moon = null; }
    for (const p of st.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.vx *= 0.97; }
    st.parts = st.parts.filter((p) => p.t < p.life);
  }
  function draw() {
    const c = c2; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    if (st.shake > 0) c.translate((Math.random() - 0.5) * 10 * st.shake / 0.35, (Math.random() - 0.5) * 6 * st.shake / 0.35);
    // danger line at the bottom
    c.fillStyle = 'rgba(255,82,56,.55)'; c.fillRect(0, H - 2, W, 2);
    for (const p of st.parts) {
      const k = 1 - p.t / p.life;
      if (p.ring) { c.strokeStyle = `rgba(${p.col},${(0.7 * k).toFixed(3)})`; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 8 + (1 - k) * 34, 0, Math.PI * 2); c.stroke(); }
      else { c.fillStyle = `rgba(${p.col},${(0.85 * k).toFixed(3)})`; c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    }
    if (st.moon) { const m = st.moon; c.fillStyle = '#b9a99a'; c.beginPath(); c.ellipse(m.x, m.y, m.r * 1.15, m.r * 0.85, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(90,70,60,.6)'; c.beginPath(); c.arc(m.x - m.r * 0.3, m.y - m.r * 0.1, m.r * 0.28, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '600 11px "League Spartan", sans-serif'; c.textAlign = 'center'; c.fillText('+3', m.x, m.y - m.r - 6); }
    for (const b of st.balls) {
      const sp = b.small ? spriteSmall : sprite, s = sp.width;
      c.save(); c.translate(b.x, b.y); if (!reduced()) c.rotate(b.a); c.drawImage(sp, -s / 2, -s / 2); c.restore();
    }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!root.isConnected) return stopLoop();
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; acc += dt;
    while (acc >= STEP && st.mode === 'play') { update(STEP); acc -= STEP; }
    if (st.mode === 'play') draw();
  }
  function loop() { stopLoop(); last = 0; acc = 0; raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const onVis = () => { if (document.hidden) pause(); };
  const onResize = () => size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (field.clientWidth !== W) size(); }) : null; if (ro) ro.observe(field);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onResize);
  window.addEventListener('hashchange', function bye() { pause(); stopLoop(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); window.removeEventListener('hashchange', bye); }, { once: true });
  window.__aitorGame = { st, start, pause, stop: () => stopLoop(), tap: (x, y) => onTap({ clientX: cv.getBoundingClientRect().left + x, clientY: cv.getBoundingClientRect().top + y, preventDefault() {} }), step: (n = 1) => { for (let i = 0; i < n; i++) update(STEP); draw(); } };   // test hook (no data)
  sprite = marsSprite(28); spriteSmall = marsSprite(20);           // placeholder sprites until the field is measured (size() rebuilds them)
  reset(); setOverlay('ready');
  requestAnimationFrame(() => { size(); if (st.mode === 'ready') { reset(); draw(); } });
}
