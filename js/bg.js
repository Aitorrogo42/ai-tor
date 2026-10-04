// Dynamic Mars background: a small starfield / ember-dust canvas (the big glow blobs are pure CSS, see css/motion.css).
// Lightweight by design: ~70 particles, 30fps, DPR capped at 2, paused while the page is hidden, never touches input.
// Reacts gently to scroll (parallax) and to device tilt where the browser allows it without a permission prompt.
// prefers-reduced-motion: draws one static frame and nothing moves.
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let root, par, cv, ctx2d, W = 0, H = 0, dpr = 1;
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
    ctx2d.fillStyle = p.dust ? `rgba(255,${130 + (p.z * 60) | 0},${80 + (p.z * 30) | 0},${(a * 0.7).toFixed(3)})` : `rgba(235,225,220,${(a * 0.75).toFixed(3)})`;
    ctx2d.beginPath(); ctx2d.arc(x, y, p.r, 0, 6.2832); ctx2d.fill();
  }
}

function applyPar() {
  // ease toward the target so the motion is soft (no jitter from scroll events)
  curY += (tY - curY) * 0.12; curX += (tX - curX) * 0.12;
  if (par) par.style.transform = `translate3d(${(curX * 6).toFixed(2)}px,${(-curY * 0.04).toFixed(2)}px,0)`;
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
}

export function initBackground() {
  root = document.getElementById('bg'); if (!root) return;
  par = root.querySelector('.bg-par'); cv = document.getElementById('bg-dust');
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
}
