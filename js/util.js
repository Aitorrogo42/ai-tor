// Tiny DOM helpers. Text is always set via textContent (never innerHTML) so user data can't inject markup.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---- currency (display only; values are never converted) ----
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR', 'MXN', 'BRL', 'SEK', 'NOK', 'DKK', 'NZD', 'SGD', 'HKD', 'ZAR', 'AED'];
let cur = 'USD';
const cache = new Map();
export function setCurrency(c) { cur = CURRENCIES.includes(c) ? c : 'USD'; }
export function getCurrency() { return cur; }
function fmt(code, opts) {
  const key = code + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(undefined, { style: 'currency', currency: code, ...opts }));
  return cache.get(key);
}
export const formatMoney = (n, code = cur) => fmt(code, { maximumFractionDigits: 0 }).format(n);
export const money = (n) => formatMoney(n, cur);
export const money2 = (n) => fmt(cur, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export const moneyCompact = (n) => fmt(cur, { notation: 'compact', maximumFractionDigits: 2 }).format(n);
export const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';

/** Parse a user-typed amount. '' -> null; invalid -> NaN. Accepts "1,234.50", "$1 234". Decimal separator is ".". */
export function parseAmount(s) {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const clean = t.replace(/[,\s$€£¥]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) return NaN;
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
}
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}
export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function fmtDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Section logo (square PNG from icons/sections). Same rendered size everywhere it is used. */
export const sectionIcon = (id, size = 40) =>
  h('img', { class: 'sec-ico', src: `icons/sections/${id}-256.png`, width: String(size), height: String(size), alt: '', 'aria-hidden': 'true', decoding: 'async', style: `width:${size}px;height:${size}px` });
