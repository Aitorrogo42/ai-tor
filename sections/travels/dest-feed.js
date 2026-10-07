// Destinations feed ("Refresh"). Fetches ONE same-origin file, ./feed/destinations.enc.json (AES-GCM encrypted, published by the
// assistant from the Travel Guide's proposals), decrypts it on this device with the SHARED passphrase (js/feedcrypto.js, the same
// one as To-Do and Finances) and merges it into the Travels document. No third-party requests. With no passphrase stored nothing is fetched.
// Device sync info (last attempt / refresh / error) lives in aitor:cfg:destinations (never exported); the places live in aitor:sec:travels.
import * as storage from '../../js/storage.js';
import { FeedError, decryptEnvelope, fetchEnvelope, getPassphrase, setPassphrase, hasPassphrase, checkPassphrase, AUTO_MS, autoDueIn, nextFailStreak } from '../../js/feedcrypto.js';
import { validate, emptyDoc } from './model.js';
import { parseFeed, mergePlaces } from './dest-model.js';

export const FEED_URL = new URL('../../feed/destinations.enc.json', import.meta.url).href;   // same origin as the app
export const AUTO_REFRESH_MS = AUTO_MS;   // auto-refresh on open / back in the foreground at most once per 15 minutes; v40: a network failure retries sooner (js/feedcrypto.js)
export { hasPassphrase, checkPassphrase };

const cfg = () => storage.config('destinations');
const store = () => storage.section('travels');
let inFlight = null;

export function getState() { const c = cfg().get(); return (c && typeof c === 'object') ? c : {}; }
function record(patch) { try { cfg().set({ ...getState(), ...patch }); } catch { /* ignore */ } }

/** Read the CURRENT stored travels doc (always fresh from storage so a background refresh and the UI never overwrite each other).
 *  Returns { ok, doc, errors }. */
export function readDoc() {
  const raw = store().get();
  if (!raw) return { ok: true, doc: emptyDoc(), errors: [] };
  const v = validate(raw);
  return { ok: v.ok, doc: v.doc, errors: v.errors };
}
/** Read-modify-write the stored doc synchronously. fn(doc) mutates. Returns false if storage failed or the doc is damaged. */
export function mutate(fn) {
  const r = readDoc();
  if (!r.ok) return false;
  fn(r.doc);
  r.doc.updatedAt = new Date().toISOString();
  try { store().set(r.doc); return true; } catch { return false; }
}

/** Fetch + decrypt + merge. Never throws. Resolves { ok, stats, skipped, error, kind }.
 *  `passphrase` (optional): try this one; it is stored only after it decrypts successfully. */
export function refresh({ auto = false, passphrase = null } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const pass = passphrase != null ? passphrase : getPassphrase();
    if (!pass) return { ok: false, kind: 'nopass', error: 'Enter your passphrase to get the latest destinations.' };
    if (passphrase != null) { const errs = checkPassphrase(passphrase); if (errs.length) return { ok: false, kind: 'nopass', error: errs[0] }; }
    const attemptAt = new Date().toISOString();
    const fail = (error, kind) => { record({ lastAttemptAt: attemptAt, lastError: error, lastErrorKind: kind, failStreak: nextFailStreak(getState(), kind) }); return { ok: false, error, kind }; };
    let env, text;
    try { env = await fetchEnvelope(FEED_URL, 'destinations', 'Your destinations feed has not been published yet (404). Your assistant needs to publish it first. Try again later.'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not load the destinations feed.', e instanceof FeedError ? e.kind : 'network'); }
    // v40: the same encrypted file as last time (same ciphertext) -> nothing to decrypt or merge; skips the slow passphrase key derivation on every foreground
    const sig = env && typeof env.ct === 'string' ? `${env.updated || ''}|${env.ct.length}|${env.ct.slice(-32)}` : null;
    const st0 = getState();
    if (passphrase == null && sig && st0.feedSig === sig && st0.lastRefreshAt && readDoc().ok) {
      const at = new Date().toISOString();
      record({ lastAttemptAt: attemptAt, lastRefreshAt: at, lastError: null, lastErrorKind: null, failStreak: 0, lastAuto: auto });
      try { window.dispatchEvent(new CustomEvent('aitor:destinations-refreshed', { detail: { auto, stats: { added: 0, updated: 0, removed: 0 }, unchanged: true } })); } catch { /* ignore */ }
      return { ok: true, stats: { added: 0, updated: 0, removed: 0 }, skipped: 0, unchanged: true };
    }
    try { text = await decryptEnvelope(env, pass, 'destinations'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not read the encrypted destinations file.', e instanceof FeedError ? e.kind : 'format'); }
    const parsed = parseFeed(text);
    if (!parsed.ok) return fail(parsed.error, 'format');
    const cur = readDoc();
    if (!cur.ok) return fail('Saved travels data looks damaged, so refresh did not change it. Restore a backup or reset Travels in Settings.', 'damaged');
    const refreshedAt = new Date().toISOString();
    let stats = { added: 0, updated: 0, removed: 0 };
    if (parsed.places.length || parsed.removed.size) {   // an empty feed changes nothing (and never creates a stored document)
      const ok = mutate((doc) => { stats = mergePlaces(doc.destinations, parsed, refreshedAt); });
      if (!ok) return fail('Could not save: storage is full or blocked.', 'storage');
    }
    if (passphrase != null) { try { setPassphrase(passphrase); } catch { /* ignore */ } }
    record({ lastAttemptAt: attemptAt, lastRefreshAt: refreshedAt, feedUpdated: parsed.updated || (env && env.updated) || null, feedSig: sig, lastError: null, lastErrorKind: null, failStreak: 0, lastAuto: auto });
    try { window.dispatchEvent(new CustomEvent('aitor:destinations-refreshed', { detail: { auto, stats } })); } catch { /* ignore */ }
    return { ok: true, stats, skipped: parsed.skipped };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** Milliseconds until the next auto refresh is due (0 = now), or null without a passphrase. */
export function autoRefreshIn(now = Date.now()) { return hasPassphrase() ? autoDueIn(getState(), now, AUTO_REFRESH_MS) : null; }
export function shouldAutoRefresh(now = Date.now()) { return autoRefreshIn(now) === 0; }
/** Used on app open / when the app returns to the foreground / comes back online (js/feedauto.js). */
export function maybeAutoRefresh() {
  if (!shouldAutoRefresh()) return Promise.resolve(null);
  return refresh({ auto: true });
}

// ---- v40: "NEW" = places that arrived since your last visit to the Destinations list ----
// Boundary for this visit = when you last looked at the list in an EARLIER visit (aitor:cfg:destinations.listSeenAt). It is frozen for the
// current visit (sessionStorage), so places stay NEW while you browse; a visit ends when the app is closed or sits in the background > 30 min.
// Opening a place still clears its NEW. With no history yet (first run after the update), only the most recent arrival batch is NEW.
const VISIT_KEY = 'aitor:dst-visit', VISIT_GAP_MS = 30 * 60 * 1000;
let hiddenAt = 0;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > VISIT_GAP_MS) { try { sessionStorage.removeItem(VISIT_KEY); } catch { /* ignore */ } }
  hiddenAt = 0;
});
export function visitBoundary() {
  try { const v = sessionStorage.getItem(VISIT_KEY); if (v !== null) return v || null; } catch { /* no sessionStorage: use the stored value */ }
  const b = getState().listSeenAt || '';
  try { sessionStorage.setItem(VISIT_KEY, b); } catch { /* ignore */ }
  return b || null;
}
export function markListSeen() { visitBoundary(); record({ listSeenAt: new Date().toISOString() }); }
