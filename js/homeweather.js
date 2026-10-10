// v38: the home weather line follows the theme. Mars: Curiosity REMS (js/marsweather.js, unchanged: at most once a day). Earth: Starbase, TX from
// Open-Meteo (js/earthweather.js, at most every 30 min while the app is open). Moon: computed phase + lunar day/night at Tranquility Base
// (js/moonsky.js, no network). A theme's source is only contacted while that theme is in use. First check after the intro and an idle moment.
import { weatherBlock, refreshWeather, WX_DELAY_MS } from './marsweather.js';
import { earthBlock, refreshEarthWeather } from './earthweather.js';
import { moonBlock } from './moonsky.js';

const theme = () => document.documentElement.dataset.theme || 'mars';
/** The block for the current theme (or null: no data yet = the greeting alone). */
export function homeWeatherBlock() {
  const t = theme();
  return t === 'earth' || t === 'retro' ? earthBlock() : t === 'moon' ? moonBlock() : weatherBlock();
}
/** Swap the block in the home greeting (if the home screen is showing). */
export function paintHomeWeather() {
  const host = document.querySelector('.home-greet'); if (!host) return;
  host.querySelectorAll('.mars-wx').forEach((e) => e.remove());
  const blk = homeWeatherBlock(); if (blk) host.append(blk);
}
let started = false;
function tick() {
  if (!started || document.hidden) return;
  const t = theme();
  if (t === 'earth' || t === 'retro') refreshEarthWeather({ onNew: () => { if (theme() === 'earth' || theme() === 'retro') paintHomeWeather(); } });   // v44: Retro shows the Earth weather (Starbase, TX)
  else if (t === 'mars') refreshWeather();
  else paintHomeWeather();                              // Moon: recompute (phase / day-night change slowly)
}
let scheduled = false;
export function scheduleHomeWeather() {
  if (scheduled) return; scheduled = true;
  const go = () => { started = true; tick(); };
  setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 4000 }) : go()), WX_DELAY_MS);
  setInterval(tick, 5 * 60 * 1000);                      // each source's own limit applies (Earth 30 min, Mars 1 day)
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('aitor-theme', () => { paintHomeWeather(); tick(); });
}
