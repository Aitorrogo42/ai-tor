// v38: app themes (Settings > Background): Mars (default), Earth, Moon, Retro. A theme is (1) a set of CSS custom properties on <html data-theme="...">
// (accent, buttons, box tint, greeting text, sky colours; css/themes.css) and (2) the background scene: the planet textures, the shader look and the
// static / CSS-fallback photo (js/bg.js asks THEMES[id].bg). Structure and behaviour never change: same wheel, sun angles, freeze, intro, ticks, city lights.
// The choice is a device setting: localStorage 'aitor:cfg:theme' = {"body":"earth"} (the Graphics Engineer's key; one source of truth for the CSS theme AND the
// planet body). Testing override: ?body=earth|moon in the URL (not persisted). It rides along in exports as an optional "display.theme".
// Assets of Earth / Moon are loaded only when that theme is in use (the service worker caches them on first use, not at install).
import * as storage from './storage.js';

export const THEME_IDS = ['mars', 'earth', 'moon', 'retro'];
export const DEFAULT_THEME = 'mars';
const A = (p) => new URL('../assets/' + p, import.meta.url).href;
export const THEMES = {
  mars: { id: 'mars', label: 'Mars', blurb: 'Red planet, dusty sky (default)', themeColor: '#0a0305',
    bg: { map: A('mars-map.webp'), second: A('city-lights.webp'), photo: A('mars-photo.webp'), cityCss: A('city-lights-css.webp') } },
  earth: { id: 'earth', label: 'Earth', blurb: 'Blue planet, blue sky, real city lights', themeColor: '#02060d',
    bg: { map: A('earth-day.webp'), second: A('earth-clouds.webp'), third: A('earth-globe.webp'), photo: A('earth-photo.webp'), cityCss: null } },   // GFX pass 3: day crop (lights in alpha), drifting clouds, whole globe outside the crop
  moon: { id: 'moon', label: 'Moon', blurb: 'Grey Moon, black sky, Earthrise', themeColor: '#000000',
    bg: { map: A('moon-albedo.webp'), second: A('earth-disc.webp'), third: A('city-lights.webp'), fourth: A('moon-relief.webp'), photo: A('moon-photo.webp'), cityCss: null } },   // GFX pass 3: LROC albedo + LOLA relief atlas; third = Moon base lights
  // v45: Retro = pixel-art Earth at the bottom (Earth's composition) on a low-res canvas (js/retrosky.js; map = the tiny class map assets/retro-earth.png); photo = the static pixel scene (toggle off), baked by tools/make_retro_assets.py
  retro: { id: 'retro', label: 'Retro', blurb: 'Pixel-art Earth, retro grey, 8-bit', themeColor: '#121110',
    bg: { map: A('retro-earth.png'), second: null, third: null, fourth: null, photo: A('retro-photo.webp'), cityCss: null } },
};

const cfg = () => storage.config('theme');
export const isTheme = (id) => THEME_IDS.includes(id);
const urlOverride = () => { try { const u = new URLSearchParams(location.search).get('body'); return isTheme(u) ? u : null; } catch { return null; } };
/** The saved theme (device setting), ignoring the ?body= override. */
export function savedTheme() {
  try { const c = cfg().get(); return c && isTheme(c.body) ? c.body : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}
/** The theme to show: ?body= (testing, not persisted) > aitor:cfg:theme {body} > 'mars'. */
export function getTheme() { return urlOverride() || savedTheme(); }
function persist(id) {
  try { cfg().set({ body: id }); } catch { /* storage blocked: applies for this session */ }
}

let current = null;
const listeners = new Set();
export function onTheme(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Put the theme on <html> (CSS variables follow at once). No persistence, no background work: see setTheme. */
export function applyThemeAttr(id) {
  const t = THEMES[isTheme(id) ? id : DEFAULT_THEME];
  current = t.id;
  const html = document.documentElement;
  html.dataset.theme = t.id; html.dataset.body = t.id;   // data-body: the Graphics Engineer's CSS-fallback rules (css/motion.css)
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t.themeColor);
  return t;
}

let bgSwitch = null;   // js/bg.js registers: (id) => Promise (resolves when the new scene's textures are in and a frame is drawn)
export function registerBackgroundSwitcher(fn) { bgSwitch = fn; }

let seq = 0;
/** Switch theme: preload the scene, then crossfade (View Transition when available, else a short fade of the background). Resolves when done. */
export async function setTheme(id, { save = true, animate = true } = {}) {
  if (!isTheme(id)) id = DEFAULT_THEME;
  const my = ++seq;
  if (save) persist(id);
  if (id === current) return id;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  const swap = async () => { applyThemeAttr(id); window.dispatchEvent(new CustomEvent('aitor-theme', { detail: { theme: id } })); if (bgSwitch) await bgSwitch(id); listeners.forEach((f) => { try { f(id); } catch { /* ignore */ } }); };
  html.classList.add('theme-switching');
  try {
    if (bgSwitch && bgSwitch.preload) await bgSwitch.preload(id);           // textures decoded BEFORE anything changes on screen: no flash
    if (my !== seq) return current;
    if (animate && !reduce && document.startViewTransition && !html.matches('[class*=vt-]')) {
      html.classList.add('vt-theme');
      const vt = document.startViewTransition(swap);
      try { await vt.finished; } catch { /* skipped */ } finally { html.classList.remove('vt-theme'); }
    } else if (animate && !reduce) {
      html.classList.add('theme-fade'); await new Promise((r) => setTimeout(r, 220));
      await swap(); requestAnimationFrame(() => html.classList.remove('theme-fade')); await new Promise((r) => setTimeout(r, 260));
    } else await swap();
  } finally { html.classList.remove('theme-switching'); }
  return id;
}

/** Called once at startup, before the first render. */
export function initTheme() {
  applyThemeAttr(getTheme());
  window.__aitorTheme = {
    get: () => current, saved: () => savedTheme(), list: () => THEME_IDS.slice(), set: (id, o) => setTheme(id, o),
    assets: (id) => ({ ...THEMES[isTheme(id) ? id : current].bg }), labels: () => Object.fromEntries(THEME_IDS.map((k) => [k, THEMES[k].label])),
  };
  return current;
}
