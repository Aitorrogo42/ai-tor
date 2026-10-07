// v38 Moon theme: there is no weather station on the Moon, so the home line shows only things computed on this device from the date:
// the real lunar phase (name + % illuminated) and whether it is lunar day or night at Tranquility Base (Apollo 11, 0.67 N 23.47 E), plus a
// TYPICAL surface temperature, clearly marked as an estimate (~ +120 C in daylight, ~ -130 C at night). No network request.
// Phase: low-precision formulas from Meeus, Astronomical Algorithms ch. 47-48 (phase angle error well under 1 %).
// Day / night: the subsolar selenographic longitude is taken as 180 deg - the Moon's elongation from the Sun (0 at new Moon: far side lit), libration ignored
// (+-8 deg), so the answer can be wrong only within a day or so of the local sunrise / sunset at the site.
import { h } from './util.js';
import { wxIcon } from './marsweather.js';

const RAD = Math.PI / 180;
export const TRANQUILITY = { lat: 0.67, lon: 23.47 };
const norm = (a) => ((a % 360) + 360) % 360;

/** { illum: 0..1, waxing, elongation (deg, 0..360 from the Sun eastward), name } for a Date. */
export function moonPhase(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);   // mean elongation
  const M = norm(357.5291092 + 35999.0502909 * T);                        // Sun mean anomaly
  const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T);   // Moon mean anomaly
  const i = norm(180 - D - 6.289 * Math.sin(Mp * RAD) + 2.1 * Math.sin(M * RAD) - 1.274 * Math.sin((2 * D - Mp) * RAD)
    - 0.658 * Math.sin(2 * D * RAD) - 0.214 * Math.sin(2 * Mp * RAD) - 0.11 * Math.sin(D * RAD));   // phase angle
  const illum = (1 + Math.cos(i * RAD)) / 2;
  const waxing = D < 180;
  const E = 180 - (i > 180 ? 360 - i : i);                                 // elongation 0..180
  const elongation = waxing ? E : 360 - E;
  let name;
  if (illum < 0.03) name = 'New Moon';
  else if (illum > 0.97) name = 'Full Moon';
  else if (Math.abs(illum - 0.5) < 0.04) name = waxing ? 'First quarter' : 'Last quarter';
  else name = (waxing ? 'Waxing ' : 'Waning ') + (illum < 0.5 ? 'crescent' : 'gibbous');
  return { illum, waxing, elongation, name };
}
/** Lunar day / night at a site (selenographic lon, deg). */
export function lunarDay(date = new Date(), site = TRANQUILITY) {
  const sub = 180 - moonPhase(date).elongation;                            // subsolar selenographic longitude
  const d = Math.abs(((site.lon - sub) % 360 + 540) % 360 - 180);
  return d < 90;
}
export function moonText(date = new Date()) {
  const p = moonPhase(date), day = lunarDay(date);
  return [p.name, `${Math.round(p.illum * 100)}% lit`, `Tranquility Base: lunar ${day ? 'day' : 'night'}`, day ? '~120 \u00b0C (est.)' : '~\u2009\u2212130 \u00b0C (est.)'].join(' \u00b7 ');
}
export function moonBlock(date = new Date()) {
  return h('div', { class: 'mars-wx home-wx', id: 'moon-wx' },
    h('p', { class: 'wx-line', id: 'moon-wx-line', 'aria-label': 'Moon, ' + moonText(date) }, wxIcon('thermo'), h('span', null, moonText(date))),
    h('p', { class: 'wx-attr', id: 'moon-wx-attr' }, 'Computed on this device \u00b7 temperature is an estimate'));
}
