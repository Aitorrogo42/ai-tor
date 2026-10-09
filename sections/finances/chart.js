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
  const W = 320, H = 270, L = 50, R = 12, T = 16, B = 50;   // viewBox ~ phone column width so the 12px labels render at >= 12px
  const all = [goalValue, nowValue];
  const pad = Math.max(Math.abs(goalValue - nowValue) * 0.15, Math.abs(goalValue) * 0.02, 1);
  const { ticks, min, max } = niceTicks(Math.min(...all) - pad, Math.max(...all) + pad);
  const x0 = D(start), x1 = D(end);
  const X = (iso) => L + ((D(iso) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Illustration only, not a forecast. Dashed line is a straight line from your current net worth to your goal; the other line keeps today\'s net worth flat. No investment returns are assumed.' });
  ticks.forEach((v) => {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.08)', 'stroke-width': '1' }));
    svg.append(s('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: '#c4c5c6', 'font-size': '12' }, moneyCompact(v)));
  });
  const fmtD = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  for (let i = 0; i <= 3; i++) {
    const ms = x0 + ((x1 - x0) * i) / 3;
    const x = L + (i / 3) * (W - L - R);
    svg.append(s('line', { x1: x, x2: x, y1: H - B, y2: H - B + 4, stroke: '#c4c5c6' }));
    svg.append(s('text', { x, y: H - B + 18, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle', fill: '#c4c5c6', 'font-size': '12' }, fmtD(ms)));
  }
  svg.append(s('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: 'rgba(255,255,255,.18)' }));
  svg.append(s('line', { x1: L, x2: W - R, y1: Y(goalValue), y2: Y(goalValue), stroke: '#ffffff', 'stroke-width': '1', 'stroke-dasharray': '2 4', opacity: '.7' }));
  svg.append(s('text', { x: W - R, y: Y(goalValue) - 5, 'text-anchor': 'end', fill: '#ffffff', 'font-size': '12' }, 'Goal ' + moneyCompact(goalValue)));
  for (const ser of series) {
    const pts = ser.points.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    svg.append(s('polyline', { points: pts, fill: 'none', stroke: ser.color, 'stroke-width': '2.5', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', ...(ser.dash ? { 'stroke-dasharray': ser.dash } : {}) }));
  }
  svg.append(s('rect', { x: X(start) - 4.5, y: Y(nowValue) - 4.5, width: 9, height: 9, fill: '#ff5238', stroke: '#0a0305', 'stroke-width': '2', transform: `rotate(45 ${X(start)} ${Y(nowValue)})` }));   // v24: diamond, not a round dot
  svg.append(s('rect', { x: X(end) - 4.5, y: Y(goalValue) - 4.5, width: 9, height: 9, fill: '#ffffff', stroke: '#0a0305', 'stroke-width': '2', transform: `rotate(45 ${X(end)} ${Y(goalValue)})` }));
  svg.append(s('text', { class: 'nw-today', x: X(start) + 8, y: Y(nowValue) + 16, fill: '#ffffff', 'font-size': '12' }, 'Today ' + moneyCompact(nowValue)));
  if (min > 0) svg.append(s('text', { x: 6, y: H - 6, fill: '#c4c5c6', 'font-size': '12' }, 'Y-axis starts at ' + moneyCompact(min) + ' (not zero)'));
  return svg;
}

/** v40.1 savings projection: years 0..N on x, $0..max on y. rows = [{ year, saved, invested }] (model.projectSavings).
 *  Colours come from CSS classes (finances.css: .sv-*), so the Mars / Earth / Moon palettes apply. */
export function savingsChart({ rows, rate }) {
  const W = 320, H = 240, L = 50, R = 14, T = 14, B = 34;
  const top = Math.max(...rows.map((r) => Math.max(r.saved, r.invested)), 1);
  const { ticks, max } = niceTicks(0, top);
  const n = rows.length;
  const X = (y) => L + (y / n) * (W - L - R);
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', id: 'savings-chart', class: 'sv-chart',
    'aria-label': `Illustration only. Savings over ${n} years: saved only with no growth reaches ${moneyCompact(rows[n - 1].saved)}; if invested at an assumed ${rate}% a year it reaches ${moneyCompact(rows[n - 1].invested)}.` });
  ticks.forEach((v) => {
    svg.append(s('line', { class: 'sv-grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
    svg.append(s('text', { class: 'sv-lbl', x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': '12' }, moneyCompact(v)));
  });
  [1, 5, 10].filter((y) => y <= n).forEach((y) => {   // the line starts at today ($0 saved) on the left edge
    svg.append(s('line', { class: 'sv-axis', x1: X(y), x2: X(y), y1: H - B, y2: H - B + 4 }));
    svg.append(s('text', { class: 'sv-lbl', x: X(y), y: H - B + 18, 'text-anchor': y === n ? 'end' : 'middle', 'font-size': '12' }, 'Yr ' + y));
  });
  svg.append(s('line', { class: 'sv-axis', x1: L, x2: W - R, y1: H - B, y2: H - B }));
  const line = (key, cls) => {
    const pts = [[0, 0], ...rows.map((r) => [r.year, r[key]])].map(([y, v]) => `${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    svg.append(s('polyline', { class: cls, 'data-series': key, points: pts, fill: 'none', 'stroke-width': '2.5', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' }));
  };
  line('saved', 'sv-saved'); line('invested', 'sv-inv');
  rows.filter((r) => [1, 5, 10].includes(r.year)).forEach((r) => {
    const x = X(r.year), y = Y(r.invested);
    svg.append(s('rect', { class: 'sv-pt', 'data-year': String(r.year), x: x - 4, y: y - 4, width: 8, height: 8, transform: `rotate(45 ${x} ${y})` }));
  });
  return svg;
}
