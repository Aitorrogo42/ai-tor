// Dynamic Mars background: a small starfield / ember-dust canvas (the glow blobs and the rising Mars photo are pure CSS + one WebP, see css/motion.css).
// Lightweight by design: ~70 particles, 30fps, DPR capped at 2, paused while the page is hidden, never touches input.
// Reacts gently to scroll (parallax) and to device tilt where the browser allows it without a permission prompt.
// prefers-reduced-motion: draws one static frame and nothing moves.
// v21: DYNAMIC SUNRISE. The home wheel drives a sun angle ("sol", one full wheel turn = one Martian day, see README) and a WebGL shader (js/sunrise.js)
// draws the lit Mars sphere, atmosphere, sun and stars behind the home screen. Falls back to the CSS layers (a glow + a night veil, moved by transform/opacity only) when
// WebGL is missing / lost, and to the plain static photo when the Settings toggle "Dynamic sunrise background" is off.
// v22: FREEZE. Opening a section stops the loop and renders ONE final frame at the sun angle of that section (the angle its wheel position showed; see js/sol.js and
// js/sections.js sectionSunAngle), under a flat dark veil (.sol-veil) so text keeps AA contrast. Going home resumes from the very same angle (no jump). Deep links /
// cold starts use the section's default angle. Toggle off = the old dimmed photo. No-WebGL: the CSS fallback layers are frozen at the same angle.
import { createSunrise, solarState } from './sunrise.js';
import * as storage from './storage.js';
import { sunAnchors, sectionSunAngle } from './sections.js';
import { solFromWheelAngle, nearestEquivalent, norm360, SOL_ORIGIN } from './sol.js';
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let root, par, marsPar, cv, ctx2d, W = 0, H = 0, dpr = 1;
let stars = [];
let raf = 0, last = 0, running = false;
let scrollY = 0, tiltX = 0, tiltY = 0, tX = 0, tY = 0, curY = 0, curX = 0, needPar = true;

function make(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const dust = i % 5 === 0;                       // every 5th particle is a warm ember
    const z = 0.25 + Math.random() * 0.75;          // depth: bigger z = nearer = moves more
    out.push({ x: Math.random(), y: Math.random(), z, r: (dust ? 0.9 : 0.5) + z * (dust ? 1.1 : 0.9), dust,
      tw: Math.random() * 6.28, ts: 0.4 + Math.random() * 1.4, vy: (dust ? 4 : 1.5) * z, vx: (Math.random() - 0.5) * 2 * z });
  }
  return out;
}

function size() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw(t) {
  ctx2d.clearRect(0, 0, W, H);
  const s = t / 1000, still = reduce();
  for (const p of stars) {
    // slow drift upward (dust) / sideways, wrapped; scroll + tilt parallax scaled by depth
    let x = p.x * W + (still ? 0 : p.vx * s) + curX * p.z * 14;
    let y = p.y * H - (still ? 0 : p.vy * s) - curY * p.z * 0.12;
    x = ((x % W) + W) % W; y = ((y % H) + H) % H;
    const a = still ? 0.55 * p.z : (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.tw + s * p.ts))) * (0.35 + 0.65 * p.z);
    ctx2d.fillStyle = p.dust ? `rgba(255,${84 + (p.z * 40) | 0},${70 + (p.z * 34) | 0},${(a * 0.7).toFixed(3)})` : `rgba(244,226,226,${(a * 0.75).toFixed(3)})`;
    ctx2d.beginPath(); ctx2d.arc(x, y, p.r, 0, 6.2832); ctx2d.fill();
  }
}

function applyPar() {
  // ease toward the target so the motion is soft (no jitter from scroll events)
  curY += (tY - curY) * 0.12; curX += (tX - curX) * 0.12;
  if (par) par.style.transform = `translate3d(${(curX * 6).toFixed(2)}px,${(-curY * 0.04).toFixed(2)}px,0)`;
  // the planet is the far horizon: it hardly moves (a few px of tilt, a hair of scroll) and always stays fixed to the screen
  if (marsPar) marsPar.style.transform = `translate3d(${(curX * 3).toFixed(2)}px,${(Math.max(-24, Math.min(0, -curY * 0.012))).toFixed(2)}px,0)`;
  return Math.abs(tY - curY) > 0.1 || Math.abs(tX - curX) > 0.05;
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  if (t - last < 33) return;            // ~30fps
  last = t;
  tY = Math.max(-1500, Math.min(1500, scrollY)); tX = tiltX;
  applyPar();
  draw(t);
}

function start() {
  if (running || reduce() || document.hidden) return;
  running = true; last = 0; document.documentElement.classList.remove('bg-paused');
  raf = requestAnimationFrame(frame);
}
function stop() { running = false; cancelAnimationFrame(raf); document.documentElement.classList.add('bg-paused'); }

export function setBackdropSection(id) {
  document.documentElement.dataset.sec = id || 'home';
  sunSync();
}

// ===================== v21 dynamic sunrise =====================
const SOL_OFFSET = SOL_ORIGIN;               // sol (deg) = 90 - wheel angle (deg) with the default even spread: with the wheel at rest on the first section (Finances) the sun is rising at the limb
export const solFromWheel = (angleDeg) => solFromWheelAngle(angleDeg, sunAnchors());      // v22: piecewise linear through the section anchors (js/sol.js); unwrapped, so any number of turns loops seamlessly
const cfg = () => storage.config('display');
export const isDynamicBackground = () => { try { const c = cfg().get(); return !(c && c.dynbg === false); } catch { return true; } };
const sun = { mode: 'off', renderer: null, canvas: null, cur: SOL_OFFSET, tgt: SOL_OFFSET, first: true, raf: 0, last: 0, lastDraw: 0, off: 0, texImg: null, ready: false, scale: 0, slow: 0, cost: 0, timer: 0, glow: null, night: null, dirty: true, frames: 0, frozen: false, t: 0 };
const cdiff360 = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);   // distance between two angles on the circle (degrees)
const isHome = () => { const s = document.documentElement.dataset.sec; return !s || s === 'home'; };

function sunLayout() {
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (!sun.scale) sun.scale = dpr;
  let sc = Math.min(sun.scale, dpr);
  const budget = 1.25e6;                                   // ~1.25 Mpx per frame max: keeps iPhone GPUs comfortable
  if (W * H * sc * sc > budget) sc = Math.sqrt(budget / (W * H));
  sun.renderer.resize(W, H, sc);
}

function setVars(st) {
  const el = root; if (!el) return;
  el.style.setProperty('--sol-deg', norm360(sun.cur).toFixed(2));
  el.style.setProperty('--sol-elev', st.E.toFixed(2));
  el.style.setProperty('--sol-day', st.day.toFixed(3));
  el.style.setProperty('--sol-night', st.night.toFixed(3));
  el.style.setProperty('--sol-city', st.city.toFixed(3));
}

function cssState() {
  const W = window.innerWidth, H = window.innerHeight, R = 1.5 * Math.min(W, 0.7 * H);
  return solarState(norm360(sun.cur) * Math.PI / 180, W, H, W / 2, 0.62 * H + R, R);
}
function applyCss(st) {                                      // fallback layers: transform / opacity only
  if (sun.glow) {
    const prox = Math.exp(-Math.pow(st.sinE / 0.3, 2)), amp = st.sinE < 0 ? Math.exp(st.sinE * 3.4) : Math.max(0.15, 1 - 0.78 * Math.min(1, Math.max(0, (st.sinE - 0.04) / 0.71)));
    sun.glow.style.transform = `translate3d(${st.sunX.toFixed(1)}px,${Math.max(st.sunY, -200).toFixed(1)}px,0)`;
    sun.glow.style.opacity = Math.min(1, (0.2 + 0.8 * prox) * amp).toFixed(3);
  }
  if (sun.night) sun.night.style.opacity = (0.82 * st.night).toFixed(3);
  const dust = document.getElementById('bg-dust'); if (dust) dust.style.opacity = (0.25 + 0.75 * st.night).toFixed(3);
}

function sunRender(real) { sunRenderAt(real - sun.off); }
function sunRenderAt(t) {                                      // t = shader time (ms) = real time minus sun.off
  sun.frames++; sun.t = t;                                                  // the shader time of the last frame: a frozen frame reuses it, so the planet does not shift when it freezes
  const still = reduce();
  const t0 = performance.now();
  const st = sun.renderer.draw(norm360(sun.cur) * Math.PI / 180, still ? 0 : t / 1000, still);
  sun.cost = sun.cost * 0.7 + (performance.now() - t0) * 0.3;      // CPU-side cost of the draw call (≈0 on a real GPU, large on a software renderer)
  if (st) setVars(st);
  sun.dirty = false;
}

const IDLE_MS = 100;                                        // idle (wheel at rest): ~10 fps is plenty for the slow rotation / star twinkle
function sunFrame() {
  sun.raf = requestAnimationFrame(sunFrame);
  const t = performance.now();                                // v23: one time base only (the rAF timestamp can lag behind performance.now() when frames queue up, which made the shader clock jump back / forth after a resume)
  const dt = sun.last ? Math.min(100, t - sun.last) : 16; sun.last = t;
  const diff = sun.tgt - sun.cur;
  let moving = false;
  if (Math.abs(diff) > 0.02) { sun.cur += diff * (1 - Math.exp(-dt / 70)); moving = true; } else if (diff !== 0) { sun.cur = sun.tgt; moving = true; }
  const still = reduce();
  if (!moving && !sun.dirty && (still || t - sun.lastDraw < IDLE_MS)) return;      // idle: ~10 fps for the star twinkle / slow rotation, nothing at all in reduced motion
  if (sun.cost > 8 && t - sun.lastDraw < sun.cost * 2.2) return;                   // slow (software) renderer: never use more than ~1/3 of the main thread
  sun.lastDraw = t;
  sunRender(t);
  // adaptive quality: if drawing is slow, render fewer pixels
  if (sun.cost > 14 || (moving && dt > 26)) { sun.slow++; if (sun.slow > (sun.cost > 14 ? 4 : 30) && sun.scale > 0.5) { sun.scale *= 0.8; sun.slow = 0; sun.cost = 0; sunLayout(); sun.dirty = true; } } else sun.slow = Math.max(0, sun.slow - 1);
}

function sunStart() {
  if (sun.mode !== 'gl' || sun.raf || document.hidden || !isHome()) return;
  sun.last = 0; sun.dirty = true;
  if (sun.t) sun.off = performance.now() - sun.t;               // v23: shader time continues from the last drawn frame (the slow planet drift + star twinkle must not jump after a stay in a section / a hidden page)
  sun.raf = requestAnimationFrame(sunFrame);
}
function sunStop() { if (sun.raf) cancelAnimationFrame(sun.raf); sun.raf = 0; }

const html = () => document.documentElement;
function sunSync() {                                          // called when the visible section / visibility / toggle changes
  if (sun.mode === 'off') { html().classList.remove('sol-frozen'); sun.frozen = false; return; }
  if (isHome()) {
    sun.frozen = false; html().classList.remove('sol-frozen');
    if (sun.mode === 'gl') sunStart(); else if (sun.mode === 'css') applyCss(cssState());
    return;
  }
  // inside a section: freeze at that section's sun angle (v22)
  const a = sectionSunAngle(document.documentElement.dataset.sec);
  sunStop();
  if (a != null) { sun.cur = sun.tgt = nearestEquivalent(a, sun.cur); sun.first = false; }
  sun.frozen = true; html().classList.add('sol-frozen');
  if (sun.mode === 'gl') { if (sun.ready) sunRenderAt(sun.t || performance.now() - sun.off); }
  else if (sun.mode === 'css') { const st = cssState(); setVars(st); applyCss(st); }
}

function onWheelAngle(e) {
  if (sun.mode === 'off') return;
  const d = e.detail || {}; if (typeof d.angle !== 'number') return;
  let tgt = solFromWheel(d.angle);
  if (cdiff360(tgt, sun.cur) < 0.01) { sun.cur = tgt; sun.tgt = tgt; }      // same angle a whole number of days away (e.g. coming back home from a section): adopt it, never spin
  const apply = () => { sun.tgt = tgt; if (sun.first || reduce() || sun.mode === 'css') { sun.cur = tgt; sun.first = false; } sun.dirty = true; if (sun.mode === 'css') { const st = cssState(); setVars(st); applyCss(st); } else if (sun.mode === 'gl') { isHome() && !sun.raf ? sunStart() : 0; } };
  if (reduce() && d.dragging) { clearTimeout(sun.timer); sun.timer = setTimeout(() => { sun.tgt = tgt; sun.cur = tgt; sun.dirty = true; if (sun.mode === 'css') { const st = cssState(); setVars(st); applyCss(st); } }, 160); return; }   // reduced motion: change only once the wheel settles
  if (reduce() && !d.dragging) { clearTimeout(sun.timer); sun.timer = setTimeout(apply, 60); return; }
  apply();
}

function fallbackCss(reason) {
  sun.mode = 'css'; document.documentElement.classList.remove('gl-on', 'sol-want'); document.documentElement.classList.add('sol-css');
  sunStop(); sun.reason = reason || 'no-webgl';
  const st = cssState(); setVars(st); applyCss(st); sunSync();
}

function sunEnable() {
  const html = document.documentElement;
  if (!root) return;
  html.classList.add('sol-want');                             // from now on the photo layers stay hidden: the shader scene (or its sky colour until it is ready) is the background, no photo flash
  if (!sun.glow) {
    sun.glow = root.querySelector('.sol-glow'); sun.night = root.querySelector('.sol-night');
  }
  if (sun.mode === 'gl' || sun.mode === 'css') { html.classList.toggle('gl-on', sun.mode === 'gl' && sun.ready); html.classList.toggle('sol-css', sun.mode === 'css'); html.classList.toggle('sol-want', sun.mode === 'gl'); sunSync(); return; }
  let r = null;
  try {
    sun.canvas = sun.canvas || document.getElementById('bg-gl') || Object.assign(document.createElement('canvas'), { id: 'bg-gl' });
    if (!sun.canvas.parentNode) root.insertBefore(sun.canvas, root.querySelector('.sol-veil'));
    r = createSunrise(sun.canvas, { onLost: () => { sun.ready = false; fallbackCss('context-lost'); }, onRestored: () => { sun.renderer = r; sun.mode = 'gl'; sun.ready = true; html.classList.remove('sol-css'); html.classList.add('gl-on'); sunLayout(); sun.dirty = true; sunSync(); } });
  } catch (err) { fallbackCss('webgl-failed'); return; }
  sun.renderer = r; sun.mode = 'gl'; sunLayout();
  const done = () => {
    if (sun.mode !== 'gl') return;
    sunRender(performance.now() / 1000 * 1000); sun.ready = true;
    html.classList.add('gl-on'); html.classList.remove('sol-css'); sunSync();
  };
  const img = new Image(); img.decoding = 'async';
  img.onload = () => { try { r.setTexture(img); } catch { /* plain procedural planet */ } done(); };
  img.onerror = () => done();
  img.src = new URL('../assets/mars-map.webp', import.meta.url).href;
  setTimeout(() => { if (!sun.ready && sun.mode === 'gl') done(); }, 6000);       // texture never arrived: show the procedural planet rather than an empty sky
}

function sunDisable() {
  const html = document.documentElement;
  sunStop(); html.classList.remove('gl-on', 'sol-css', 'sol-want', 'sol-frozen'); sun.mode = 'off'; sun.frozen = false;
  if (root) ['--sol-deg', '--sol-elev', '--sol-day', '--sol-night', '--sol-city'].forEach((k) => root.style.removeProperty(k));
  if (sun.glow) sun.glow.style.opacity = '0'; if (sun.night) sun.night.style.opacity = '0';
  const dust = document.getElementById('bg-dust'); if (dust) dust.style.opacity = '';
  if (sun.renderer) { try { sun.renderer.dispose(); } catch { /* ignore */ } sun.renderer = null; if (sun.canvas) { sun.canvas.remove(); sun.canvas = null; } sun.ready = false; }
}

/** Settings toggle. Persists on this device only. */
export function setDynamicBackground(on) {
  try { cfg().set({ dynbg: !!on }); } catch { /* storage blocked: still applies for this session */ }
  if (on) { sun.first = true; sunEnable(); } else sunDisable();
}

function initSun() {
  window.addEventListener('wheel-angle', onWheelAngle);
  window.addEventListener('resize', () => { if (sun.mode === 'gl') { sunLayout(); sun.dirty = true; if (sun.frozen && sun.ready) sunRenderAt(sun.t || performance.now() - sun.off); } else if (sun.mode === 'css') applyCss(cssState()); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (sun.mode === 'gl') (document.hidden ? sunStop() : sunSync()); });
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener && mq.addEventListener('change', () => { sun.dirty = true; sunSync(); });
  if (isDynamicBackground()) sunEnable();
  window.__aitorBg.sun = {
    mode: () => sun.mode, ready: () => sun.ready, reason: () => sun.reason || '', solDeg: () => norm360(sun.cur), targetDeg: () => norm360(sun.tgt), running: () => !!sun.raf,
    snap: (deg) => { sun.tgt = sun.cur = deg; sun.dirty = true; if (sun.mode === 'gl') { sunRender(performance.now()); } else if (sun.mode === 'css') { const st = cssState(); setVars(st); applyCss(st); } },
    scale: () => sun.scale, frozen: () => sun.frozen, shaderTime: () => sun.t, offset: () => sun.off, canvas: () => sun.canvas, draws: () => sun.frames, anchors: () => sunAnchors(),
  };
}

export function initBackground() {
  root = document.getElementById('bg'); if (!root) return;
  par = root.querySelector('.bg-par'); marsPar = root.querySelector('.mars-par'); cv = document.getElementById('bg-dust');
  if (!cv || !cv.getContext) return;
  ctx2d = cv.getContext('2d');
  stars = make(72);
  size(); draw(performance.now());
  window.addEventListener('resize', () => { size(); draw(performance.now()); }, { passive: true });
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  // tilt: only where it needs no permission (Android/desktop). iOS asks for permission, so we never prompt: scroll parallax is enough there.
  if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', (e) => { if (e.gamma != null) tiltX = Math.max(-1, Math.min(1, e.gamma / 30)); }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener && mq.addEventListener('change', () => { if (mq.matches) { stop(); draw(0); } else start(); });
  start();
  window.__aitorBg = { running: () => running, stars: stars.length };   // used by the test script only
  initSun();
}
