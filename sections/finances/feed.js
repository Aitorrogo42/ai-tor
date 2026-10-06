// Finances feed ("Refresh"). Fetches ONE same-origin file, ./feed/finances.enc.json (AES-GCM encrypted snapshot published by the
// assistant), decrypts it on this device with the SHARED passphrase (js/feedcrypto.js, same one as the To-Do feed) and merges it
// into the local finances. No third-party requests. With no passphrase stored nothing is ever fetched.
//
// Plaintext schema (version 1):
//   { "version":1, "updated":"ISO", "as_of":"text",
//     "accounts":[{ "name", "value", "group", "id"?, "source"? }],        // required, at least one
//     "debts":[{ "name", "value", "id"? }]?, "income_monthly":number?, "expenses_monthly":number?,
//     "goals":[{ "name", "target", "date"?, "id"? }]?, "notes":"?",
//     "prices":[{ "ticker", "name"?, "price", "change_pct"?, "as_of"?, "basis"? }]? }   // "Key holdings", shown in the given order
// Merge rules: a feed item matches a local item by feed key (remembered `fk`), else by its `id` (when given), else by name
// (case-insensitive). Matches get the feed's value/group/(source→note) and become feed-managed; unmatched feed items are added.
// Feed-managed items that vanished from the feed are removed. Items you added yourself (no `fk`, no match) are never touched.
// `prices` are feed-only: each Refresh replaces them (missing = the Key holdings list is hidden). `debts`/`goals` missing from the feed = left alone. Feed `notes` are shown on the dashboard, they never overwrite your own notes.
import * as storage from '../../js/storage.js';
import { uid, isValidISODate } from '../../js/util.js';
import { FeedError, decryptEnvelope, fetchEnvelope, getPassphrase, setPassphrase, hasPassphrase, checkPassphrase } from '../../js/feedcrypto.js';
import { validate, emptyDoc, canonicalGroup, cleanPrices, LIMITS } from './model.js';

export const FEED_URL = new URL('../../feed/finances.enc.json', import.meta.url).href;   // same origin as the app
export const AUTO_REFRESH_MS = 15 * 60 * 1000;   // auto-refresh on app open at most once per 15 minutes (counts every attempt)
export { hasPassphrase, checkPassphrase };

const cfgStore = () => storage.config('finances');
const store = () => storage.section('finances');
let inFlight = null;

export function getState() { const c = cfgStore().get(); return (c && typeof c === 'object') ? c : {}; }
function record(patch) { try { cfgStore().set({ ...getState(), ...patch }); } catch { /* ignore */ } }

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITS.amount;
const norm = (s) => String(s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Validate the decrypted feed JSON text. Returns { ok, feed, skipped, error }. Bad single items are skipped (counted). */
export function parseFeed(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'The finance feed is not valid data.' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'The finance feed is not valid data.' };
  if (raw.version !== 1) return { ok: false, error: raw.version > 1 ? 'The finance feed is a newer format than this app understands. Update AI-TOR.' : 'The finance feed has an unknown version.' };
  let skipped = 0;
  const key = (o) => (isStr(o.id) && o.id.trim() && o.id.length <= 40) ? 'i:' + o.id.trim() : 'n:' + norm(o.name);
  const nameOk = (o) => o && typeof o === 'object' && isStr(o.name) && o.name.trim() && o.name.trim().length <= LIMITS.name;
  const take = (list, ok, make) => {
    if (list == null) return null;
    if (!Array.isArray(list) || list.length > LIMITS.items) { skipped += 1; return null; }
    const seen = new Set(), out = [];
    for (const o of list) {
      if (!nameOk(o) || !ok(o)) { skipped++; continue; }
      const it = make(o); it.fk = key(o);
      if (seen.has(it.fk)) { skipped++; continue; }
      seen.add(it.fk); out.push(it);
    }
    return out;
  };
  const accounts = take(raw.accounts, (o) => isNum(o.value) && o.value >= 0, (o) => ({
    name: o.name.trim(), value: o.value, group: (isStr(o.group) && o.group.trim() && o.group.trim().length <= LIMITS.group) ? canonicalGroup(o.group) : 'Other',
    note: isStr(o.source) ? o.source.trim().slice(0, LIMITS.note) : null, id: isStr(o.id) ? o.id.trim() : null }));
  if (!accounts || !accounts.length) return { ok: false, error: 'The finance feed has no accounts, so nothing was changed.' };
  const debts = take(raw.debts, (o) => isNum(o.value) && o.value >= 0, (o) => ({ name: o.name.trim(), amount: o.value, note: isStr(o.source) ? o.source.trim().slice(0, LIMITS.note) : null, id: isStr(o.id) ? o.id.trim() : null }));
  const goals = take(raw.goals, (o) => isNum(o.target) && o.target > 0 && (o.date == null || o.date === '' || isValidISODate(o.date)),
    (o) => ({ name: o.name.trim(), target: o.target, date: o.date ? o.date : null, id: isStr(o.id) ? o.id.trim() : null }));
  const amt = (v) => (isNum(v) && v >= 0 ? v : null);
  const pr = cleanPrices(raw.prices, true); skipped += pr.skipped;
  return { ok: true, skipped, feed: {
    updated: isStr(raw.updated) ? raw.updated.slice(0, 40) : null, asOf: isStr(raw.as_of) ? raw.as_of.slice(0, 200) : null,
    accounts, debts, goals, income: amt(raw.income_monthly), expenses: amt(raw.expenses_monthly),
    notes: isStr(raw.notes) && raw.notes.trim() ? raw.notes.slice(0, LIMITS.notes) : null,
    prices: pr.list && pr.list.length ? pr.list : null } };
}

/** Merge `items` (parsed feed items) into `list` in place. Returns { added, updated, removed }. */
function mergeList(list, items, fields) {
  const st = { added: 0, updated: 0, removed: 0 };
  const used = new Set(), match = new Map();
  for (const it of items) { const m = list.find((x) => !used.has(x) && x.fk === it.fk); if (m) { used.add(m); match.set(it, m); } }          // 1. remembered feed key
  for (const it of items) if (!match.has(it)) {                                                                                           // 2. feed id, then name
    const m = (it.id && list.find((x) => !used.has(x) && !x.fk && x.id === it.id)) || list.find((x) => !used.has(x) && norm(x.name) === norm(it.name));
    if (m) { used.add(m); match.set(it, m); }
  }
  for (const it of items) {
    const m = match.get(it);
    if (m) {
      const before = JSON.stringify(fields.map((f) => m[f]));
      m.fk = it.fk;
      for (const f of fields) if (it[f] !== null && it[f] !== undefined) m[f] = it[f];
      if (JSON.stringify(fields.map((f) => m[f])) !== before) st.updated++;
    } else {
      const n = { id: it.id && !list.some((x) => x.id === it.id) ? it.id : uid(), fk: it.fk };
      for (const f of fields) n[f] = it[f] ?? (f === 'note' ? '' : null);
      list.push(n); used.add(n); st.added++;
    }
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].fk && !used.has(list[i])) { list.splice(i, 1); st.removed++; }   // dropped from the feed
  return st;
}

/** Merge a parsed feed into a validated finances doc (mutates `doc`). */
export function mergeFeed(doc, feed, { refreshedAt = new Date().toISOString(), envUpdated = null } = {}) {
  const stats = { accounts: mergeList(doc.accounts, feed.accounts, ['name', 'value', 'group', 'note']), debts: null, goals: null };
  if (feed.debts) stats.debts = mergeList(doc.debts, feed.debts, ['name', 'amount', 'note']);
  if (feed.goals) stats.goals = mergeList(doc.goals, feed.goals, ['name', 'target', 'date']);
  if (feed.income != null) doc.monthlyIncome = feed.income;
  if (feed.expenses != null) doc.monthlyExpenses = feed.expenses;
  doc.example = false;
  doc.updatedAt = refreshedAt;
  doc.feed = { updated: feed.updated || envUpdated, asOf: feed.asOf, refreshedAt, notes: feed.notes };
  if (feed.prices && feed.prices.length) doc.feed.prices = feed.prices;   // replaced on every refresh; absent = list hidden
  const sum = (s) => s ? s.added + s.updated + s.removed : 0;
  return { ...stats, changed: sum(stats.accounts) + sum(stats.debts) + sum(stats.goals) };
}

/** Fetch + decrypt + merge. Never throws. Resolves { ok, stats, skipped, error, kind }.
 *  `passphrase` (optional): try this one; it is stored only after it decrypts successfully (then shared with To-Do). */
export function refresh({ auto = false, passphrase = null } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const pass = passphrase != null ? passphrase : getPassphrase();
    if (!pass) return { ok: false, kind: 'nopass', error: 'Enter your passphrase to refresh from your assistant.' };
    if (passphrase != null) { const errs = checkPassphrase(passphrase); if (errs.length) return { ok: false, kind: 'nopass', error: errs[0] }; }
    const attemptAt = new Date().toISOString();
    const fail = (error, kind) => { record({ lastAttemptAt: attemptAt, lastError: error, lastErrorKind: kind }); return { ok: false, error, kind }; };
    let env, text;
    try { env = await fetchEnvelope(FEED_URL, 'finance', 'Your finance feed has not been published yet (404). Your assistant needs to publish it first. Try again later.'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not load the finance feed.', e instanceof FeedError ? e.kind : 'network'); }
    try { text = await decryptEnvelope(env, pass, 'finance'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not read the encrypted finance file.', e instanceof FeedError ? e.kind : 'format'); }
    const parsed = parseFeed(text);
    if (!parsed.ok) return fail(parsed.error, 'format');
    // read-merge-write synchronously so a concurrent edit in the UI cannot be lost
    const raw = store().get();
    let doc = emptyDoc();
    if (raw) {
      const v = validate(raw);
      if (!v.ok) return fail('Saved finances look damaged, so refresh did not change them. Restore a backup or reset Finances.', 'damaged');
      if (!v.doc.example) doc = v.doc;   // fake example data is replaced, never mixed with real numbers
    }
    const stats = mergeFeed(doc, parsed.feed, { envUpdated: env && env.updated });
    try { store().set(doc); } catch { return fail('Could not save: storage is full or blocked.', 'storage'); }
    if (passphrase != null) { try { setPassphrase(passphrase); } catch { /* ignore */ } }
    record({ lastAttemptAt: attemptAt, lastRefreshAt: doc.feed.refreshedAt, lastError: null, lastErrorKind: null, lastAuto: auto });
    try { window.dispatchEvent(new CustomEvent('aitor:finances-refreshed', { detail: { auto, stats } })); } catch { /* ignore */ }
    return { ok: true, stats, skipped: parsed.skipped };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function shouldAutoRefresh(now = Date.now()) {
  if (!hasPassphrase()) return false;
  const last = Date.parse(getState().lastAttemptAt || '') || 0;
  return now - last >= AUTO_REFRESH_MS;
}
/** Used on app open / when the app returns to the foreground. Skips example data and the edit page. */
export function maybeAutoRefresh() {
  if (!shouldAutoRefresh() || String(location.hash).startsWith('#/finances/edit')) return Promise.resolve(null);
  const raw = store().get();
  if (raw && raw.example === true) return Promise.resolve(null);
  return refresh({ auto: true });
}
