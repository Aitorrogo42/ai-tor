// Finances data model: schema, validation, calculations, example data. Pure functions (no DOM, no storage).
import { isValidISODate, todayISO, addMonthsISO, uid } from '../../js/util.js';

export const SECTION_ID = 'finances';
export const VERSION = 1; // schema version of the finances document
export const DEFAULT_GROUPS = ['Stock/Equity', 'Retirement', 'Crypto', 'Cash/Bank', 'Property', 'Other'];
const FIXED_COLORS = { 'Stock/Equity': '#ff5238', Retirement: '#ffffff', Crypto: '#c4c5c6', 'Cash/Bank': '#d93a2d', Property: '#8a8a8c', Other: '#5a5a5c' };   // brand tones only: Ember / white / greys / Mars
const PALETTE = ['#8f1a1c', '#e2e3e3', '#ffb3a8', '#a3a4a5', '#b3261e', '#6f7071', '#ff7a66', '#d0d1d2'];   // custom groups: brand tone steps
export const LIMITS = { name: 80, group: 40, note: 500, notes: 5000, items: 500, amount: 1e15 };

export const emptyDoc = () => ({ version: VERSION, example: false, updatedAt: null, accounts: [], monthlyIncome: null, monthlyExpenses: null, debts: [], goals: [], notes: '', feed: null, monthlyExpensesOverride: null });

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

export const PRICE_LIMITS = { items: 60, ticker: 12, name: 80, asOf: 60, changePct: 10000 };
const BASIS = { close: 'close', live: 'live', nav: 'NAV' };
/** Sanitize a "Key holdings" price list. `feedShape` = snake_case feed items (change_pct/as_of), else the stored camelCase shape.
 *  Bad items are dropped (counted in `skipped`), bad optional fields are blanked. Order is kept. Returns { list, skipped } (list null = none). */
export function cleanPrices(raw, feedShape = false) {
  if (raw == null) return { list: null, skipped: 0 };
  if (!Array.isArray(raw)) return { list: null, skipped: 1 };
  let skipped = Math.max(0, raw.length - PRICE_LIMITS.items);
  const list = [];
  for (const o of raw.slice(0, PRICE_LIMITS.items)) {
    const ticker = o && typeof o === 'object' && isStr(o.ticker) ? o.ticker.trim() : '';
    if (!ticker || ticker.length > PRICE_LIMITS.ticker || !isAmt(o.price) || o.price < 0) { skipped++; continue; }
    const cp = feedShape ? o.change_pct : o.changePct, asOf = feedShape ? o.as_of : o.asOf;
    const basis = isStr(o.basis) ? BASIS[o.basis.trim().toLowerCase()] || null : null;
    list.push({ ticker, name: isStr(o.name) && o.name.trim() ? o.name.trim().slice(0, PRICE_LIMITS.name) : null, price: o.price,
      changePct: typeof cp === 'number' && Number.isFinite(cp) && Math.abs(cp) <= PRICE_LIMITS.changePct ? cp : null,
      asOf: isStr(asOf) && asOf.trim() ? asOf.trim().slice(0, PRICE_LIMITS.asOf) : null, basis });
  }
  return { list, skipped };
}

// v46 net worth HISTORY (feed-only, user-entered facts): [{ date 'YYYY-MM-DD', label, netWorth }] drawn as the past of the projection chart. `feedShape` = snake_case (net_worth).
export const HISTORY_LIMITS = { items: 24, label: 20 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function cleanHistory(raw, feedShape = false) {
  if (raw == null) return { list: null, skipped: 0 };
  if (!Array.isArray(raw)) return { list: null, skipped: 1 };
  let skipped = Math.max(0, raw.length - HISTORY_LIMITS.items);
  const list = [], seen = new Set();
  for (const o of raw.slice(0, HISTORY_LIMITS.items)) {
    const nw = o && typeof o === 'object' ? (feedShape ? o.net_worth : o.netWorth) : null;
    if (!o || typeof o !== 'object' || !isStr(o.date) || !isValidISODate(o.date) || seen.has(o.date) || typeof nw !== 'number' || !Number.isFinite(nw) || Math.abs(nw) > LIMITS.amount) { skipped++; continue; }
    seen.add(o.date);
    const label = isStr(o.label) && o.label.trim() ? o.label.trim().slice(0, HISTORY_LIMITS.label) : MONTHS[Number(o.date.slice(5, 7)) - 1] + ' ' + o.date.slice(0, 4);
    list.push({ date: o.date, label, netWorth: nw });
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  return { list, skipped };
}

// v40.1 "Income breakdown" (feed-only, like the Key holdings): who brings in the monthly income and, optionally, one person's paycheck
// (gross, each deduction line, net) and monthly gross / deductions / net. Never edited by hand; replaced on every Refresh; absent = card hidden.
export const BREAKDOWN_LIMITS = { people: 8, lines: 12, name: 40, label: 60, note: 300, asOf: 60, perYear: 366 };
/** Sanitize an income breakdown. `feedShape` = snake_case feed object (monthly_net, per_year, as_of), else the stored camelCase shape.
 *  Bad people / lines are dropped (counted in `skipped`), bad optional parts are blanked. Returns { value, skipped } (value null = none). */
export function cleanBreakdown(raw, feedShape = false) {
  if (raw == null) return { value: null, skipped: 0 };
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.people)) return { value: null, skipped: 1 };
  const L = BREAKDOWN_LIMITS, amt = (v) => isAmt(v) && v >= 0;
  const txt = (v, n) => (isStr(v) && v.trim() ? v.trim().slice(0, n) : null);
  const k = (o, snake, camel) => (o ? (feedShape ? o[snake] : o[camel]) : undefined);
  let skipped = Math.max(0, raw.people.length - L.people);
  const people = [];
  for (const o of raw.people.slice(0, L.people)) {
    const name = o && typeof o === 'object' ? txt(o.name, L.name) : null;
    const net = k(o, 'monthly_net', 'monthlyNet');
    if (!name || !amt(net)) { skipped++; continue; }
    const p = { name, monthlyNet: net, note: txt(o.note, L.note), paycheck: null, monthly: null };
    const pc = o.paycheck;
    if (pc && typeof pc === 'object' && !Array.isArray(pc) && amt(pc.gross) && amt(pc.net)) {
      const per = k(pc, 'per_year', 'perYear');
      const lines = [];
      for (const ln of (Array.isArray(pc.lines) ? pc.lines.slice(0, L.lines) : [])) {
        const label = ln && typeof ln === 'object' ? txt(ln.label, L.label) : null;
        if (label && amt(ln.amount)) lines.push({ label, amount: ln.amount }); else skipped++;
      }
      p.paycheck = { perYear: Number.isInteger(per) && per > 0 && per <= L.perYear ? per : null, gross: pc.gross, lines, net: pc.net };
    } else if (pc != null) skipped++;
    const mo = o.monthly;
    if (mo && typeof mo === 'object' && !Array.isArray(mo) && amt(mo.gross) && amt(mo.deductions) && amt(mo.net)) p.monthly = { gross: mo.gross, deductions: mo.deductions, net: mo.net };
    else if (mo != null) skipped++;
    people.push(p);
  }
  if (!people.length) return { value: null, skipped: skipped || 1 };
  const basis = txt(raw.basis, 20);
  return { value: { asOf: txt(k(raw, 'as_of', 'asOf'), L.asOf), basis: basis ? basis.toLowerCase() : null, estimate: raw.estimate === true, note: txt(raw.note, L.note), people }, skipped };
}

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
    if (!isAmt(d.amount) || d.amount < 0) err(`${w}: "amount" must be a number >= 0.`);
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
    else if (!isAmt(v) || v < 0) err(`Finances: "${key}" must be a number >= 0 or null.`);
    else doc[key] = v;
  }
  // v40.1: "Your estimate" for monthly expenses, typed on the dashboard. It wins over monthlyExpenses (the feed / edit-page value) until reset.
  const ov = raw.monthlyExpensesOverride;
  if (ov != null) {
    if (ov && typeof ov === 'object' && isAmt(ov.value) && ov.value >= 0) doc.monthlyExpensesOverride = { value: ov.value, at: isStr(ov.at) ? ov.at.slice(0, 40) : null };
    else err('Finances: "monthlyExpensesOverride" must be { value: number >= 0, at }.');
  }
  if (raw.notes == null) doc.notes = '';
  else if (!isStr(raw.notes) || raw.notes.length > LIMITS.notes) err(`Finances: "notes" must be text up to ${LIMITS.notes} characters.`);
  else doc.notes = raw.notes;
  const f = raw.feed;   // metadata of the last feed refresh (text only)
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const t = (v, n) => (isStr(v) ? v.slice(0, n) : null);
    doc.feed = { updated: t(f.updated, 40), asOf: t(f.asOf, 200), refreshedAt: t(f.refreshedAt, 40), notes: t(f.notes, LIMITS.notes) };
    const pr = cleanPrices(f.prices).list;   // "Key holdings" from the last feed (feed-only, never edited by hand)
    if (pr && pr.length) doc.feed.prices = pr;
    const ib = cleanBreakdown(f.incomeBreakdown).value;   // v40.1 "Income breakdown" from the last feed (feed-only)
    if (ib) doc.feed.incomeBreakdown = ib;
    const hs = cleanHistory(f.history).list;   // v46 net worth history from the last feed (feed-only)
    if (hs && hs.length) doc.feed.history = hs;
  }
  return { ok: errors.length === 0, errors, doc };
}

export function summary(doc, fmt) {
  // v46: no amounts in the import / Settings summary (it can be on screen around other people); counts only
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `${plural(doc.accounts.length, 'account')}, ${plural(doc.debts.length, 'debt')}, ${plural(doc.goals.length, 'goal')}`;
}

export function groupColor(name, allNames) {
  if (FIXED_COLORS[name]) return FIXED_COLORS[name];
  const custom = allNames.filter((n) => !FIXED_COLORS[n]);
  return PALETTE[Math.max(0, custom.indexOf(name)) % PALETTE.length];
}

/** v40.1: the monthly expenses the dashboard uses: your typed estimate when set (it wins over every feed refresh), else the feed / edit-page value. */
export function effectiveExpenses(doc) { return doc.monthlyExpensesOverride ? doc.monthlyExpensesOverride.value : doc.monthlyExpenses; }

/** v40.1 savings projection (illustration, not advice): `surplus` saved at the end of every month for `years` years.
 *  saved = no growth (surplus x months); invested = the same deposits compounding monthly at annualPct / 12 per month (future value of an ordinary annuity).
 *  Returns [{ year, saved, invested }] for years 1..years. No market data: the only rate is the one the user typed (default 5%). */
export const RETURN_DEFAULT = 5, RETURN_MIN = 0, RETURN_MAX = 30;
export function projectSavings(surplus, annualPct, years = 10) {
  const r = annualPct / 100 / 12, out = [];
  for (let y = 1; y <= years; y++) {
    const n = 12 * y;
    out.push({ year: y, saved: surplus * n, invested: r === 0 ? surplus * n : surplus * ((1 + r) ** n - 1) / r });
  }
  return out;
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
  const expenses = effectiveExpenses(doc);
  const surplus = doc.monthlyIncome != null && expenses != null ? doc.monthlyIncome - expenses : null;
  return { assets, debts, netWorth: assets - debts, groups, hasCash: cashAccounts.length > 0, cashTotal: cashAccounts.reduce((s, a) => s + a.value, 0), surplus, expenses,
    annualSavings: surplus != null ? surplus * 12 : null };
}

/** Plain-language alerts derived only from the user's own numbers. */
export function alerts(doc, c, fmtPct, fmt) {
  const out = [];
  if (c.netWorth < 0) out.push('Your debts are larger than your tracked assets.');
  const top = c.groups[0];
  if (top && c.groups.length > 1 && top.share >= 0.6) out.push(`${fmtPct(top.share)} of your assets are in one group (${top.name}).`);
  if (doc.monthlyIncome != null && c.expenses != null && c.expenses > doc.monthlyIncome) out.push('Monthly expenses are higher than monthly income.');
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
