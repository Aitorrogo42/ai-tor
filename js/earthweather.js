// v38 Earth theme: live weather for Starbase, TX under the home greeting. Source: Open-Meteo (free, no key, CORS *), current conditions:
//   GET https://api.open-meteo.com/v1/forecast?latitude=25.997&longitude=-97.157&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day
//       &temperature_unit=fahrenheit&wind_speed_unit=mph
// Only requested while the Earth theme is in use: at most every 30 min while the app is open (a failed attempt waits WX_RETRY_MS), only online,
// straight from the page (the service worker never touches cross-origin requests), plain GET, no cookies, no referrer, nothing personal sent.
// First request after the intro and an idle moment (same timing as js/marsweather.js). The last good result stays in localStorage
// (aitor:cfg:earthweather, device only, never exported) and is shown offline. No data = the greeting alone.
import * as storage from './storage.js';
import { h } from './util.js';
import { wxIcon } from './marsweather.js';

export const EWX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=25.997&longitude=-97.157&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph';
export const EWX_MAX_AGE_MS = 30 * 60 * 1000;     // refresh at most every 30 min
export const EWX_RETRY_MS = 10 * 60 * 1000;       // after a failed attempt: wait 10 min
const EWX_TIMEOUT_MS = 15000;
const PLACE = 'Starbase, TX';
const cfg = () => storage.config('earthweather');

/** WMO weather code -> [label, icon kind]. The designer's set has sunny / partly / cloudy / thermometer (no rain, snow, storm, fog or
 *  clear-night icon yet): rain, drizzle, snow, fog and storms use "cloudy"; a clear NIGHT uses the thermometer (a sun at night would be wrong). */
export function wmo(code, isDay = 1) {
  const c = Number(code), night = Number(isDay) === 0;
  const t = (label, kind) => [label, kind];
  if (c === 0) return t('Clear', night ? 'thermo' : 'sunny');
  if (c === 1) return t('Mainly clear', night ? 'thermo' : 'sunny');
  if (c === 2) return t('Partly cloudy', night ? 'cloudy' : 'partly');
  if (c === 3) return t('Overcast', 'cloudy');
  if (c === 45 || c === 48) return t('Fog', 'cloudy');
  if (c >= 51 && c <= 57) return t('Drizzle', 'cloudy');
  if (c >= 61 && c <= 67) return t('Rain', 'cloudy');
  if (c >= 71 && c <= 77) return t('Snow', 'cloudy');
  if (c >= 80 && c <= 82) return t('Showers', 'cloudy');
  if (c === 85 || c === 86) return t('Snow showers', 'cloudy');
  if (c >= 95 && c <= 99) return t('Thunderstorm', 'cloudy');
  return t(null, 'thermo');
}

const fin = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
/** Validate an Open-Meteo answer -> small clean record or null. Never throws. */
export function pickCurrent(json) {
  const c = json && typeof json === 'object' && json.current && typeof json.current === 'object' ? json.current : null;
  if (!c) return null;
  const temp = fin(c.temperature_2m, -80, 150);
  if (temp == null) return null;
  const off = fin(json.utc_offset_seconds, -50400, 50400) || 0;
  let time = null;
  if (typeof c.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time)) { const ms = Date.parse(c.time + 'Z') - off * 1000; if (Number.isFinite(ms)) time = new Date(ms).toISOString(); }
  const code = Number.isInteger(c.weather_code) && c.weather_code >= 0 && c.weather_code <= 99 ? c.weather_code : null;
  return { temp: Math.round(temp), code, wind: fin(c.wind_speed_10m, 0, 300) != null ? Math.round(c.wind_speed_10m) : null,
    rh: fin(c.relative_humidity_2m, 0, 100) != null ? Math.round(c.relative_humidity_2m) : null, isDay: c.is_day === 0 ? 0 : 1, time };
}
export function cached() {
  const c = cfg().get();
  return c && typeof c === 'object' && c.data && Number.isInteger(c.data.temp) ? c.data : null;
}
const minus = (n) => (n < 0 ? '\u2212' + Math.abs(n) : String(n));
export function earthText(d) {
  const [label] = wmo(d.code, d.isDay);
  return [PLACE, `${minus(d.temp)} \u00b0F`, label, d.wind != null ? `Wind ${d.wind} mph` : null, d.rh != null ? `${d.rh}%` : null].filter(Boolean).join(' \u00b7 ');
}
function updated(d, fetchedAt) {
  const iso = d.time || fetchedAt; const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? 'updated ' + new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
}
/** Weather block (same markup / styling as the Mars line: .mars-wx) or null. */
export function earthBlock(d = cached()) {
  if (!d) return null;
  const c = cfg().get() || {};
  const [, kind] = wmo(d.code, d.isDay);
  return h('div', { class: 'mars-wx home-wx', id: 'earth-wx', 'data-code': String(d.code) },
    h('p', { class: 'wx-line', id: 'earth-wx-line', 'aria-label': 'Weather, ' + earthText(d) }, wxIcon(kind), h('span', null, earthText(d))),
    h('p', { class: 'wx-attr', id: 'earth-wx-attr' }, ['Open-Meteo', updated(d, c.fetchedAt)].filter(Boolean).join(' \u00b7 ')));
}

function due(now = Date.now()) {
  const c = cfg().get() || {};
  const t = (s) => (typeof s === 'string' ? Date.parse(s) || 0 : 0);
  if (c.data && now - t(c.fetchedAt) < EWX_MAX_AGE_MS) return false;
  if (c.lastAttemptAt && now - t(c.lastAttemptAt) < EWX_RETRY_MS) return false;
  return true;
}
let inFlight = null;
/** Fetch now if due (never throws). onNew() is called after a new record was stored. */
export function refreshEarthWeather({ force = false, onNew } = {}) {
  if (inFlight) return inFlight;
  if (!force && (!due() || navigator.onLine === false)) return Promise.resolve(false);
  try { cfg().set({ ...(cfg().get() || {}), lastAttemptAt: new Date().toISOString() }); } catch { /* still try */ }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), EWX_TIMEOUT_MS) : null;
  inFlight = fetch(EWX_URL, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      const d = pickCurrent(json);
      if (!d) return false;
      try { cfg().set({ ...(cfg().get() || {}), data: d, fetchedAt: new Date().toISOString() }); } catch { return false; }
      if (onNew) onNew();
      return true;
    })
    .catch(() => false)
    .finally(() => { if (timer) clearTimeout(timer); inFlight = null; });
  return inFlight;
}
