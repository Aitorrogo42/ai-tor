// Launch intro (v35: automatic, no tap needed): on every app launch (page load) that lands on the home screen, show ONLY the white "A" on pure black
// (no header, no text, no tabs, Mars background hidden) for ~0.8 s, then the A glides slowly up to the exact spot of the real header logo
// (FLIP: measured, then one transform animation, so it lands with no jump) while the Mars scene comes up like a sunrise: the background's exposure
// eases up (opacity) and a warm glow rises from the horizon and melts away (.splash-dawn: transform + opacity only). The home screen (header, wheel)
// fades in during the second half. ~3.6 s in all, ease-in-out. A tap anywhere (or Enter / Space / Escape) skips it. Reduced motion: a short plain fade.
// The splash markup (#splash, inline SVG) and the `splash` class on <html> are static in index.html so the first paint is already the splash,
// independent of how long JS takes. If JS never loads, css/motion.css reveals the app by itself after a few seconds (failsafe animation).
// States on <html>: .splash (the black hold) -> .splash-go (animating; + .splash-app once the home screen is revealed, + .splash-skip when skipped) -> none. Not shown on in-app navigation, on deep links
// (reloading inside a section), after a service-worker update reload, or in automated browsers (navigator.webdriver) unless ?splash=1.
const root = document.documentElement;
const SKIP_KEY = 'aitor-nosplash';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Mark that the next load (the service-worker update reload) should skip the splash. */
export function skipNextSplash() { try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ } }

/** Decide synchronously (module evaluation) whether this launch shows the splash; if not, remove it at once. */
export function splashWanted() {
  let skip = false;
  try { if (sessionStorage.getItem(SKIP_KEY)) { sessionStorage.removeItem(SKIP_KEY); skip = true; } } catch { /* ignore */ }
  const home = !location.hash || location.hash === '#/';
  const auto = navigator.webdriver === true && !/[?&]splash=1\b/.test(location.search);
  const on = root.classList.contains('splash') && home && !skip && !auto && !/[?&]nosplash\b/.test(location.search);
  if (!on) endSplash();
  return on;
}

function endSplash() {
  root.classList.remove('splash', 'splash-go', 'splash-rm', 'splash-armed', 'splash-app', 'splash-skip');
  const dawn = document.querySelector('.splash-dawn:not(.fading)'); if (dawn) dawn.remove();
  root.style.removeProperty('--intro-glide');
  const el = document.getElementById('splash'); if (el) el.remove();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const INTRO = { HOLD: 800, GLIDE: 2800, APP_AT: 1800, FAST: 420, RM_FADE: 380 };   // ms: black hold, logo glide (= the sunrise), home screen reveal (from the glide start), skip / reduced-motion durations

/**
 * Arm the launch intro. `ready` resolves when the home screen is in the DOM; `prepare()` starts the page's staggered entrance (called once, when the home screen is revealed).
 */
export function armSplash(ready, prepare) {
  const box = document.getElementById('splash');
  const btn = document.getElementById('splash-btn');
  const mark = btn && btn.querySelector('.splash-mark');
  if (!box || !btn || !mark) { endSplash(); prepare(); return; }
  root.classList.add('splash-armed');   // JS is alive: disables the CSS failsafe that would otherwise reveal the app after 6 s
  try { btn.focus({ preventScroll: true }); } catch { /* ignore */ }
  window.addEventListener('keydown', () => box.classList.add('kb'), { once: true });

  let phase = 'hold', flight = null, prepared = false, skipping = false;
  const k = Math.max(1, Number(window.__aitorIntroScale) || 1);       // test / screenshot hook only: slows the whole intro down k times (default 1)
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const reveal = () => { if (prepared) return; prepared = true; root.classList.add('splash-app'); prepare(); };   // header / wheel stagger in (CSS)
  const done = () => {
    if (phase === 'done') return;
    phase = 'done'; timers.forEach(clearTimeout); reveal(); endSplash();
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch { /* ignore */ }
  };
  // the home screen must be in the DOM and the Mars photo decoded before anything fades in (no pop-in); never wait long for the photo
  const readyP = (async () => {
    try { await ready; } catch { /* the route shows its own error card */ }
    const photo = document.querySelector('.mars-photo');
    if (photo && !(photo.complete && photo.naturalWidth)) { try { await Promise.race([photo.decode(), wait(600)]); } catch { /* ignore */ } }
  })();

  async function go(fast) {
    if (phase !== 'hold') return;
    phase = 'go';
    await readyP;
    if (phase !== 'go') return;
    fast = fast || skipping;                                         // skipped while the home screen was still loading
    const target = document.querySelector('.home-head .brand-mark');   // the real header logo (still hidden, but laid out)
    const rm = reduced() || !target;
    const from = mark.getBoundingClientRect();
    const to = target ? target.getBoundingClientRect() : null;
    window.scrollTo(0, 0);
    root.style.setProperty('--intro-glide', (INTRO.GLIDE * k) + 'ms');   // the CSS sunrise (#bg exposure + .splash-dawn) runs exactly as long as the glide
    if (!rm && !fast) { const dawn = document.createElement('i'); dawn.className = 'splash-dawn'; dawn.setAttribute('aria-hidden', 'true'); document.body.insertBefore(dawn, box); }
    root.classList.remove('splash');
    root.classList.add('splash-go');
    if (fast) root.classList.add('splash-skip');
    if (rm) {
      root.classList.add('splash-rm'); reveal();
      try { box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: INTRO.RM_FADE, easing: 'ease', fill: 'forwards' }).finished.then(done, done); }
      catch { done(); }
      return;
    }
    if (fast) reveal(); else later(reveal, INTRO.APP_AT * k);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const s = to.width / from.width;
    try {
      flight = mark.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }],
        { duration: fast ? INTRO.FAST : INTRO.GLIDE * k, easing: fast ? 'cubic-bezier(.4,0,.2,1)' : 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
    } catch { done(); return; }
    // the real logo takes over in the same frame the flying copy is removed
    flight.finished.then(() => requestAnimationFrame(done), done);
  }

  // skip: a tap anywhere / Enter / Space / Escape. During the black hold -> a quick version; mid-intro -> land now (the A is already on its path to the header logo)
  const skip = (e) => {
    if (phase === 'done' || skipping) return;
    skipping = true;
    if (e && e.cancelable) e.preventDefault();
    if (phase === 'hold') { go(true); return; }
    if (!flight) return;                                               // still waiting for the home screen: go() picks the quick version
    // a running CSS transition keeps its original 2.8 s even when .splash-skip changes the duration: hand #bg and the glow over to short WAAPI fades from where they are
    const bg = document.getElementById('bg');
    if (bg) { const cur = parseFloat(getComputedStyle(bg).opacity) || 0; bg.getAnimations().forEach((a) => a.cancel()); try { bg.animate([{ opacity: cur }, { opacity: 1 }], { duration: INTRO.FAST, easing: 'cubic-bezier(.2,0,.2,1)' }); } catch { /* jumps to 1 */ } }
    const dawn = document.querySelector('.splash-dawn');
    if (dawn) { const cur = parseFloat(getComputedStyle(dawn).opacity) || 0; dawn.classList.add('fading'); dawn.getAnimations().forEach((a) => a.cancel()); dawn.style.opacity = '0'; try { dawn.animate([{ opacity: cur }, { opacity: 0 }], { duration: 320, easing: 'ease-out' }).finished.then(() => dawn.remove(), () => dawn.remove()); } catch { dawn.remove(); } }
    root.classList.add('splash-skip'); reveal();
    try { flight.finish(); } catch { done(); }
  };
  box.addEventListener('pointerdown', skip);
  btn.addEventListener('click', skip);
  window.addEventListener('keydown', function onKey(e) { if (phase === 'done') { window.removeEventListener('keydown', onKey); return; } if (e.key === 'Escape' || ((e.key === 'Enter' || e.key === ' ') && document.activeElement !== btn)) skip(e); });

  window.__aitorIntro = { phase: () => phase, reveal, skipping: () => skipping };   // test / screenshot hook (no data)
  Promise.all([readyP, wait(INTRO.HOLD * k)]).then(() => go(false));
}
