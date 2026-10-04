// Finances data model: schema, validation, calculations, example data. Pure functions (no DOM, no storage).
import { isValidISODate, todayISO, addMonthsISO, uid } from '../../js/util.js';

export const SECTION_ID = 'finances';
export const VERSION = 1; // schema version of the finances document
export const DEFAULT_GROUPS = ['Stock/Equity', 'Retirement', 'Crypto', 'Cash/Bank', 'Property', 'Other'];
const FIXED_COLORS = { 'Stock/Equity': '#ff5238', Retirement: '#7aa7ff', Crypto: '#f2c14e', 'Cash/Bank': '#3ddc84', Property: '#d4a8ff', Other: '#8a8a8c' };
const PALETTE = ['#f08ab4', '#2dd4bf', '#d4a8ff', '#a3d65c', '#5cc3f0', '#b9a7ff', '#e9d36a', '#c9d1d9'];
export const LIMITS = { name: 80, group: 40, note: 500, notes: 5000, items: 500, amount: 1e15 };

export const emptyDoc = () => ({ version: VERSION, example: false, updatedAt: null, accounts: [], monthlyIncome: null, monthlyExpenses: null, debts: [], goals: [], notes: '', feed: null });

export function isEmptyDoc(d) {
  return !d || (!d.accounts.length && !d.debts.length && !d.goals.length && d.monthlyIncome == null && d.monthlyExpenses == null && !d.notes.trim());
}

/** Map any casing of a default group name to its canonical spelling. */
export function canonicalGroup(name) {
  const t = String(name ?? '').trim();
  return DEFAULT_GROUPS.find((g) => g.toLowerCase() === t.toLowerCase()) || t;
}

const isStr = (v) => typeof v === 'string';
const isAmt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITS.amount;

/** Validate + sanitize a finances document. Returns { ok, errors, doc }. Never throws. */
export function validate(raw) {
  const errors = [];
  const err = (m) => { if (errors.length < 12) errors.push(m); };
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Finances data must be an object.'], doc };
  if (!Number.isInteger(raw.version)) err('Finances: missing "version".');
  else if (raw.version > VERSION) err(`Finances: data is from a newer version of AI-TOR (schema ${raw.version}; this app supports up to ${VERSION}).`);
  else if (raw.version < 1) err('Finances: invalid "version".');
  doc.example = raw.example === true;
  doc.updatedAt = isStr(raw.updatedAt) ? raw.updatedAt.slice(0, 40) : null;

  const list = (key) => {
    if (raw[key] == null) return [];
    if (!Array.isArray(raw[key])) { err(`Finances: "${key}" must be a list.`); return []; }
    if (raw[key].length > LIMITS.items) { err(`Finances: too many ${key} (max ${LIMITS.items}).`); return []; }
    return raw[key];
  };
  const ids = new Set();
  const takeId = (v) => { let id = isStr(v) && v && v.length <= 40 && !ids.has(v) ? v : uid(); while (ids.has(id)) id = uid(); ids.add(id); return id; };
  const name = (o, where) => {
    if (!isStr(o.name) || !o.name.trim()) { err(`${where}: name is required.`); return null; }
    if (o.name.trim().length > LIMITS.name) { err(`${where}: name is too long (max ${LIMITS.name}).`); return null; }
    return o.name.trim();
  };
  const note = (o, where) => {
    if (o.note == null || o.note === '') return '';
    if (!isStr(o.note) || o.note.length > LIMITS.note) { err(`${where}: note must be text up to ${LIMITS.note} characters.`); return ''; }
    return o.note.trim();
  };

  // optional feed key: marks an item as managed by the encrypted finance feed (see feed.js); manual items have none
  const fk = (o) => (isStr(o.fk) && o.fk && o.fk.length <= 120 ? { fk: o.fk } : {});
  list('accounts').forEach((a, i) => {
    const w = `Account #${i + 1}`;
    if (!a || typeof a !== 'object') { err(`${w}: must be an object.`); return; }
    const n = name(a, w);
    if (!isAmt(a.value)) err(`${w}: "value" must be a number.`);
    else if (a.value < 0) err(`${w}: value can't be negative (add negatives under Debts).`);
    let g = a.group == null || a.group === '' ? 'Other' : a.group;
    if (!isStr(g) || g.trim().length > LIMITS.group) { err(`${w}: group must be text up to ${LIMITS.group} characters.`); g = 'Other'; }
    const nt = note(a, w);
    if (n && isAmt(a.value) && a.value >= 0) doc.accounts.push({ id: takeId(a.id), name: n, value: a.value, group: canonicalGroup(g) || 'Other', note: nt, ...fk(a) });
  });
  list('debts').forEach((d, i) => {
    const w = `Debt #${i + 1}`;
    if (!d || typeof d !== 'object') { err(`${w}: must be an object.`); return; }
    const n = name(d, w);
    if (!isAmt(d.amount) || d.amount < 0) err(`${w}: "amount" must be a number ≥ 0.`);
    const nt = note(d, w);
    if (n && isAmt(d.amount) && d.amount >= 0) doc.debts.push({ id: takeId(d.id), name: n, amount: d.amount, note: nt, ...fk(d) });
  });
  list('goals').forEach((g, i) => {
    const w = `Goal #${i + 1}`;
    if (!g || typeof g !== 'object') { err(`${w}: must be an object.`); return; }
    const n = name(g, w);
    if (!isAmt(g.target) || g.target <= 0) err(`${w}: "target" must be a number > 0.`);
    let date = null;
    if (g.date != null && g.date !== '') { if (isValidISODate(g.date)) date = g.date; else err(`${w}: "date" must look like YYYY-MM-DD.`); }
    if (n && isAmt(g.target) && g.target > 0) doc.goals.push({ id: takeId(g.id), name: n, target: g.target, date, ...fk(g) });
  });
  for (const key of ['monthlyIncome', 'monthlyExpenses']) {
    const v = raw[key];
    if (v == null) doc[key] = null;
    else if (!isAmt(v) || v < 0) err(`Finances: "${key}" must be a number ≥ 0 or null.`);
    else doc[key] = v;
  }
  if (raw.notes == null) doc.notes = '';
  else if (!isStr(raw.notes) || raw.notes.length > LIMITS.notes) err(`Finances: "notes" must be text up to ${LIMITS.notes} characters.`);
  else doc.notes = raw.notes;
  const f = raw.feed;   // metadata of the last feed refresh (text only)
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const t = (v, n) => (isStr(v) ? v.slice(0, n) : null);
    doc.feed = { updated: t(f.updated, 40), asOf: t(f.asOf, 200), refreshedAt: t(f.refreshedAt, 40), notes: t(f.notes, LIMITS.notes) };
  }
  return { ok: errors.length === 0, errors, doc };
}

export function summary(doc, fmt) {
  const c = compute(doc);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `${plural(doc.accounts.length, 'account')}, ${plural(doc.debts.length, 'debt')}, ${plural(doc.goals.length, 'goal')} · net worth ${fmt(c.netWorth)}`;
}

export function groupColor(name, allNames) {
  if (FIXED_COLORS[name]) return FIXED_COLORS[name];
  const custom = allNames.filter((n) => !FIXED_COLORS[n]);
  return PALETTE[Math.max(0, custom.indexOf(name)) % PALETTE.length];
}

/** All derived numbers for the dashboard. Net worth = assets − debts. No invented values. */
export function compute(doc) {
  const assets = doc.accounts.reduce((s, a) => s + a.value, 0);
  const debts = doc.debts.reduce((s, d) => s + d.amount, 0);
  const names = [...new Set(doc.accounts.map((a) => a.group))];
  const groups = names.map((n) => {
    const accounts = doc.accounts.filter((a) => a.group === n);
    const total = accounts.reduce((s, a) => s + a.value, 0);
    return { name: n, color: groupColor(n, names), accounts, total, share: assets > 0 ? total / assets : 0 };
  }).sort((a, b) => b.total - a.total);
  const cashAccounts = doc.accounts.filter((a) => a.group === 'Cash/Bank');
  const surplus = doc.monthlyIncome != null && doc.monthlyExpenses != null ? doc.monthlyIncome - doc.monthlyExpenses : null;
  return { assets, debts, netWorth: assets - debts, groups, hasCash: cashAccounts.length > 0, cashTotal: cashAccounts.reduce((s, a) => s + a.value, 0), surplus };
}

/** Plain-language alerts derived only from the user's own numbers. */
export function alerts(doc, c, fmtPct, fmt) {
  const out = [];
  if (c.netWorth < 0) out.push('Your debts are larger than your tracked assets.');
  const top = c.groups[0];
  if (top && c.groups.length > 1 && top.share >= 0.6) out.push(`${fmtPct(top.share)} of your assets are in one group (${top.name}).`);
  if (doc.monthlyIncome != null && doc.monthlyExpenses != null && doc.monthlyExpenses > doc.monthlyIncome) out.push('Monthly expenses are higher than monthly income.');
  const today = todayISO();
  for (const g of doc.goals) if (g.date && g.date < today && c.netWorth < g.target) out.push(`The date for goal "${g.name}" has passed and it isn't reached yet (${fmt(g.target - c.netWorth)} to go).`);
  return out;
}

/** Goals that can be illustrated: target above current net worth and a date in the future. */
export function projectableGoals(doc, c) {
  const today = todayISO();
  return doc.goals.filter((g) => g.date && g.date > today && g.target > c.netWorth).sort((a, b) => a.date.localeCompare(b.date));
}

/** FAKE example data for the "Load example data" button. */
export function exampleDoc() {
  const today = todayISO();
  const a = (name, value, group, note = '') => ({ id: uid(), name, value, group, note });
  return {
    version: VERSION, example: true, updatedAt: new Date().toISOString(),
    accounts: [
      a('Example Brokerage', 48000, 'Stock/Equity', 'Fake example'),
      a('Example 401(k)', 62500, 'Retirement'),
      a('Example IRA', 18200, 'Retirement'),
      a('Example Crypto Wallet', 3400, 'Crypto'),
      a('Example Checking', 5200, 'Cash/Bank'),
      a('Example Savings', 12000, 'Cash/Bank'),
      a('Example Home', 285000, 'Property', 'Estimated value'),
      a('Example Collectibles', 2500, 'Hobby fund'),
    ],
    monthlyIncome: 6500, monthlyExpenses: 4800,
    debts: [{ id: uid(), name: 'Example Mortgage', amount: 190000, note: '' }, { id: uid(), name: 'Example Credit Card', amount: 1200, note: '' }],
    goals: [{ id: uid(), name: 'Example goal: reach 300,000', target: 300000, date: addMonthsISO(today, 18) }],
    notes: 'This is FAKE example data so you can see how AI-TOR looks. Erase it any time and add your own.',
  };
}
