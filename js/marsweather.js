// Mars weather line on the home screen (v37). Source: NASA / Centro de Astrobiología REMS data from the Curiosity rover (Gale Crater),
//   GET https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json   (CORS *, JSON, newest sol first, ~120 KB gzipped)
// The data lags weeks behind, so it is shown as "Sol N" with the Earth date, never as live / today. Mars theme only since v38 (Earth: js/earthweather.js). A third-party
// request: made straight from the page (the service worker never touches cross-origin requests), at most once per day after a
// success (a failed attempt waits WX_RETRY_MS), only while online, and only after the intro has finished and the browser is idle, so it never
// delays the intro, the sunrise or the wheel. The last good result is kept in localStorage (aitor:cfg:marsweather, device only, never exported)
// and shown offline. No data at all = the greeting alone (no gap, no error text).
import * as storage from './storage.js';
import { h } from './util.js';

export const WX_URL = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json';
export const WX_MAX_AGE_MS = 24 * 60 * 60 * 1000;   // one successful fetch per day
export const WX_RETRY_MS = 3 * 60 * 60 * 1000;      // after a failure, try again at most every 3 h
export const WX_DELAY_MS = 5000;                           // after launch: the intro (~4 s) and the first wheel frames come first
const WX_TIMEOUT_MS = 20000;

const cfg = () => storage.config('marsweather');
const SVG = 'http://www.w3.org/2000/svg';

/** "-71" -> -71; "--", "", null, junk -> null. */
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace('\u2212', '-');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const txt = (v, n = 40) => (typeof v === 'string' && v.trim() && v.trim() !== '--' ? v.trim().slice(0, n) : null);

/** Pick the newest sol with real min AND max temperatures. Returns a small clean record or null. Never throws. */
export function pickSol(json) {
  const soles = json && typeof json === 'object' && Array.isArray(json.soles) ? json.soles : null;
  if (!soles) return null;
  for (const s of soles.slice(0, 400)) {
    if (!s || typeof s !== 'object') continue;
    const min = num(s.min_temp), max = num(s.max_temp), sol = num(s.sol);
    if (min == null || max == null || sol == null || min < -150 || max > 60 || min > max) continue;
    const p = num(s.pressure);
    const date = typeof s.terrestrial_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.terrestrial_date) ? s.terrestrial_date : null;
    return { sol: Math.round(sol), date, min: Math.round(min), max: Math.round(max),
      pressure: p != null && p > 0 && p < 2000 ? Math.round(p) : null, opacity: txt(s.atmo_opacity, 24) };
  }
  return null;
}

/** The cached record (validated again on read) or null. */
export function cached() {
  const c = cfg().get();
  if (!c || typeof c !== 'object' || !c.data) return null;
  const d = c.data;
  const ok = Number.isInteger(d.sol) && Number.isInteger(d.min) && Number.isInteger(d.max);
  return ok ? { sol: d.sol, date: typeof d.date === 'string' ? d.date : null, min: d.min, max: d.max,
    pressure: Number.isInteger(d.pressure) ? d.pressure : null, opacity: txt(d.opacity, 24) } : null;
}

const minus = (n) => (n < 0 ? '\u2212' + Math.abs(n) : String(n));
export function weatherText(d) {
  return ['Sol ' + d.sol, 'Gale Crater', `${minus(d.min)}\u00b0 / ${minus(d.max)} \u00b0C`, d.pressure != null ? d.pressure + ' Pa' : null, d.opacity]
    .filter(Boolean).join(' \u00b7 ');
}
function shortDate(iso) {
  if (!iso) return null;
  const [y, m, dd] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  const sameYear = y === new Date().getFullYear();
  return dt.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

// Weather icons: ONE map, condition kind -> inner SVG markup (children of the <svg>) for a 24 x 24 viewBox. Final set from the Graphic Designer
// (/workspace/ai-tor-design/icons-v2/weather/, see its README): straight segments on a 0.5 grid, stroke 2, square caps, miter joins. The root
// attributes below are copied exactly from those files; CSS only sets the size and `color` (never stroke-width / caps / joins: the gaps are
// measured for these values). To update an icon, paste the children of the new file's <svg> here; to add a condition, add a key + a wxIconKind rule.
export const WX_ICONS = {
  sunny: '<path d="M10.5 8H13.5L16 10.5V13.5L13.5 16H10.5L8 13.5V10.5Z"/><path d="M12 3V4"/><path d="M12 20V21"/><path d="M3 12H4"/><path d="M20 12H21"/><path d="M6.5 6.5L5.5 5.5"/><path d="M17.5 6.5L18.5 5.5"/><path d="M17.5 17.5L18.5 18.5"/><path d="M6.5 17.5L5.5 18.5"/>',   // icons-v2/weather/sunny.svg
  cloudy: '<path d="M5 18H19L21 16V14L19 12H17V10L14 7H11L8 10V11H5L3 13V16Z"/>',   // icons-v2/weather/cloudy.svg
  partly: '<path d="M7 20H19L21 18V16L19 14H18V13L15 10H12L9 13V14H7L5 16V18Z"/><path d="M4 11V9.5L7.5 6H10"/>',   // icons-v2/weather/alt/partly-cloudy.svg
  dust: '<path d="M3 10H15L17 8V6L15 4H14"/><path d="M6 15H21"/><path d="M3 20H8"/><path d="M13 20H15"/><path d="M20 20H21"/>',   // icons-v2/weather/dust.svg
  thermo: '<path d="M8 9V4.5L9.5 3H10.5L12 4.5V9"/><path d="M8.5 13H11.5L14 15.5V18.5L11.5 21H8.5L6 18.5V15.5Z"/><path d="M16 5H18"/><path d="M16 9H17"/>',   // icons-v2/weather/thermometer.svg
};
const WX_SVG_ATTRS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'miter', 'stroke-linecap': 'square' };
/** atmo_opacity text -> icon kind. Curiosity REMS (checked 2026-10-06, all 4,745 sols): "Sunny" (4,742) and "--" (3) only; the other rules
 *  follow the designer's suggested mapping for values the feed may report later. Unknown / "--" / empty -> thermometer. */
export function wxIconKind(opacity) {
  const o = (opacity || '').trim().toLowerCase();
  if (/^(sunny|clear)/.test(o)) return 'sunny';
  if (/partly|mostly sunny/.test(o)) return 'partly';
  if (/dust|haz|storm|opacity high/.test(o)) return 'dust';
  if (/cloud|overcast/.test(o)) return 'cloudy';
  return 'thermo';
}
export function wxIcon(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries(WX_SVG_ATTRS)) svg.setAttribute(k, v);
  svg.setAttribute('class', 'wx-ico wx-ico-' + kind); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = WX_ICONS[kind] || WX_ICONS.thermo;   // constant markup from this file only (never from the network)
  return svg;
}

/** The weather block (icon + line + attribution) for a record, or null when there is no data. */
export function weatherBlock(d = cached()) {
  if (!d) return null;
  const when = shortDate(d.date);
  return h('div', { class: 'mars-wx', id: 'mars-wx', 'data-sol': String(d.sol) },
    h('p', { class: 'wx-line', id: 'mars-wx-line', 'aria-label': 'Mars weather, ' + weatherText(d) }, wxIcon(wxIconKind(d.opacity)), h('span', null, weatherText(d))),
    h('p', { class: 'wx-attr', id: 'mars-wx-attr' }, 'Curiosity rover' + (when ? ' \u00b7 ' + when : '')));
}

/** Put the latest block into the home greeting (if the home screen is on screen). */
function paint() {
  const host = document.querySelector('.home-greet');
  if (!host) return;
  const th = document.documentElement.dataset.theme; if (th && th !== 'mars') return;   // v38: Earth / Moon show their own line (js/homeweather.js)
  const blk = weatherBlock();
  const old = host.querySelector('#mars-wx');
  if (old && blk) old.replaceWith(blk);
  else if (blk) host.append(blk);
}

function due(now = Date.now()) {
  const c = cfg().get() || {};
  const t = (s) => (typeof s === 'string' ? Date.parse(s) || 0 : 0);
  if (c.data && now - t(c.fetchedAt) < WX_MAX_AGE_MS) return false;   // fresh enough (one successful fetch per day)
  if (c.lastAttemptAt && now - t(c.lastAttemptAt) < WX_RETRY_MS) return false;   // a recent attempt (failed or not): wait
  return true;
}

let inFlight = null;
/** Fetch now if due (never throws). Resolves true when a new record was stored. */
export function refreshWeather({ force = false } = {}) {
  if (inFlight) return inFlight;
  if (!force && (!due() || (typeof navigator !== 'undefined' && navigator.onLine === false))) return Promise.resolve(false);
  const prev = cfg().get() || {};
  try { cfg().set({ ...prev, lastAttemptAt: new Date().toISOString() }); } catch { /* storage full: still try */ }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), WX_TIMEOUT_MS) : null;
  inFlight = fetch(WX_URL, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      const d = pickSol(json);
      if (!d) return false;
      try { cfg().set({ ...(cfg().get() || {}), data: d, fetchedAt: new Date().toISOString() }); } catch { return false; }
      paint();
      return true;
    })
    .catch(() => false)
    .finally(() => { if (timer) clearTimeout(timer); inFlight = null; });
  return inFlight;
}

let scheduled = false;
/** Called once at startup: waits for the intro and an idle moment, then refreshes if due. */
export function scheduleWeather() {
  if (scheduled) return; scheduled = true;
  const go = () => refreshWeather();
  const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 0));
  setTimeout(idle, WX_DELAY_MS);
  window.addEventListener('online', () => refreshWeather());
}
