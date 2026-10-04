// Hand-drawn inline SVG illustration chart (no libraries). Straight line only: no returns are modeled.
import { moneyCompact } from '../../js/util.js';
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const D = (iso) => new Date(iso + 'T00:00:00Z').getTime();

function niceTicks(lo, hi, count = 4) {
  let range = hi - lo;
  if (range <= 0) range = Math.abs(hi) * 0.2 || 1;
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const t0 = Math.floor(lo / step) * step, t1 = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = t0; v <= t1 + step / 2; v += step) ticks.push(v);
  return { ticks, min: t0, max: t1 };
}

/** series: [{label,color,dash,points:[[iso,value],...]}] */
export function projectionChart({ series, start, end, goalValue, nowValue }) {
  const W = 360, H = 250, L = 52, R = 14, T = 16, B = 42;
  const all = [goalValue, nowValue];
  const pad = Math.max(Math.abs(goalValue - nowValue) * 0.15, Math.abs(goalValue) * 0.02, 1);
  const { ticks, min, max } = niceTicks(Math.min(...all) - pad, Math.max(...all) + pad);
  const x0 = D(start), x1 = D(end);
  const X = (iso) => L + ((D(iso) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Illustration only, not a forecast. Dashed line is a straight line from your current net worth to your goal; the other line keeps today\'s net worth flat. No investment returns are assumed.' });
  ticks.forEach((v) => {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: '#1c2740', 'stroke-width': '1' }));
    svg.append(s('text', { x: L - 6, y: Y(v) + 3, 'text-anchor': 'end', fill: '#8b9bb4', 'font-size': '10' }, moneyCompact(v)));
  });
  const fmtD = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  for (let i = 0; i <= 3; i++) {
    const ms = x0 + ((x1 - x0) * i) / 3;
    const x = L + (i / 3) * (W - L - R);
    svg.append(s('line', { x1: x, x2: x, y1: H - B, y2: H - B + 4, stroke: '#8b9bb4' }));
    svg.append(s('text', { x, y: H - B + 16, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle', fill: '#8b9bb4', 'font-size': '10' }, fmtD(ms)));
  }
  svg.append(s('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: '#2a3858' }));
  svg.append(s('line', { x1: L, x2: W - R, y1: Y(goalValue), y2: Y(goalValue), stroke: '#3ee07f', 'stroke-width': '1', 'stroke-dasharray': '2 4', opacity: '.7' }));
  svg.append(s('text', { x: W - R, y: Y(goalValue) - 5, 'text-anchor': 'end', fill: '#3ee07f', 'font-size': '10' }, 'Goal ' + moneyCompact(goalValue)));
  for (const ser of series) {
    const pts = ser.points.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    svg.append(s('polyline', { points: pts, fill: 'none', stroke: ser.color, 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(ser.dash ? { 'stroke-dasharray': ser.dash } : {}) }));
  }
  svg.append(s('circle', { cx: X(start), cy: Y(nowValue), r: 4.5, fill: '#a78bfa', stroke: '#0b1220', 'stroke-width': '2' }));
  svg.append(s('circle', { cx: X(end), cy: Y(goalValue), r: 4.5, fill: '#3ee07f', stroke: '#0b1220', 'stroke-width': '2' }));
  svg.append(s('text', { x: X(start) + 8, y: Y(nowValue) + 16, fill: '#c9b8ff', 'font-size': '10' }, 'Today ' + moneyCompact(nowValue)));
  if (min > 0) svg.append(s('text', { x: 6, y: H - 4, fill: '#8b9bb4', 'font-size': '9' }, 'Y-axis starts at ' + moneyCompact(min) + ' (not zero)'));
  return svg;
}
