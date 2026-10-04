// Launch splash: on every app launch (page load) that lands on the home screen, show ONLY the white "A" on pure black
// (no header, no text, no tabs, Mars background hidden). Tap (or Enter/Space on the focused button) and the A glides to the exact spot of the
// real header logo (FLIP: measured, then one transform animation, so it lands with no jump) while the "ai-tor" wordmark and the
// cards fade/slide in and the Mars background (photo, glow, starfield) fades in. Reduced motion: plain fades, nothing moves.
// The splash markup (#splash, inline SVG) and the `splash` class on <html> are static in index.html so the first paint is already the splash,
// independent of how long JS takes. If JS never loads, css/motion.css reveals the app by itself after a few seconds (failsafe animation).
// States on <html>: .splash (waiting for the tap) -> .splash-go (animating) -> none. Not shown on in-app navigation, on deep links
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
  root.classList.remove('splash', 'splash-go', 'splash-rm', 'splash-armed');
  const el = document.getElementById('splash'); if (el) el.remove();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Arm the splash. `ready` resolves when the home screen is in the DOM; `prepare()` starts the page's staggered entrance (called at the tap).
 */
export function armSplash(ready, prepare) {
  const box = document.getElementById('splash');
  const btn = document.getElementById('splash-btn');
  const mark = btn && btn.querySelector('.splash-mark');
  if (!box || !btn || !mark) { endSplash(); prepare(); return; }
  let started = false;
  root.classList.add('splash-armed');   // JS is alive: disables the CSS failsafe that would otherwise reveal the app after 6 s
  try { btn.focus({ preventScroll: true }); } catch { /* ignore */ }
  window.addEventListener('keydown', () => box.classList.add('kb'), { once: true });

  btn.addEventListener('click', async () => {
    if (started) return;
    started = true;
    btn.disabled = true;
    try { await ready; } catch { /* the route shows its own error card */ }
    // the Mars photo must be decoded before the background fades in (no pop-in); never wait long
    const photo = document.querySelector('.mars-photo');
    if (photo && !(photo.complete && photo.naturalWidth)) { try { await Promise.race([photo.decode(), wait(600)]); } catch { /* ignore */ } }

    const target = document.querySelector('.home-head .brand-mark');   // the real header logo (still hidden, but laid out)
    const rm = reduced() || !target;
    box.classList.add('stop-pulse');
    const from = mark.getBoundingClientRect();
    const to = target ? target.getBoundingClientRect() : null;
    window.scrollTo(0, 0);
    root.classList.remove('splash');
    root.classList.add('splash-go');
    if (rm) root.classList.add('splash-rm');
    prepare();                                          // header/cards stagger in (CSS), background fade starts (CSS)

    const done = () => { endSplash(); try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch { /* ignore */ } };
    if (rm) {
      try { box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease', fill: 'forwards' }).finished.then(done, done); }
      catch { done(); }
      return;
    }
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const s = to.width / from.width;
    let a;
    try {
      a = mark.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }],
        { duration: 720, delay: 60, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'both' });
    } catch { done(); return; }
    // the real logo takes over in the same frame the flying copy is removed
    a.finished.then(() => requestAnimationFrame(done), done);
  });
}
