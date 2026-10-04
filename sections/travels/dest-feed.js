// Destinations feed ("Refresh"). Fetches ONE same-origin file, ./feed/destinations.enc.json (AES-GCM encrypted, published by the
// assistant from the Travel Guide's proposals), decrypts it on this device with the SHARED passphrase (js/feedcrypto.js, the same
// one as To-Do and Finances) and merges it into the Travels document. No third-party requests. With no passphrase stored nothing is fetched.
// Device sync info (last attempt / refresh / error) lives in aitor:cfg:destinations (never exported); the places live in aitor:sec:travels.
import * as storage from '../../js/storage.js';
import { FeedError, decryptEnvelope, fetchEnvelope, getPassphrase, setPassphrase, hasPassphrase, checkPassphrase } from '../../js/feedcrypto.js';
import { validate, emptyDoc } from './model.js';
import { parseFeed, mergePlaces } from './dest-model.js';

export const FEED_URL = new URL('../../feed/destinations.enc.json', import.meta.url).href;   // same origin as the app
export const AUTO_REFRESH_MS = 15 * 60 * 1000;   // auto-refresh on app open at most once per 15 minutes (every attempt counts)
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
    const fail = (error, kind) => { record({ lastAttemptAt: attemptAt, lastError: error, lastErrorKind: kind }); return { ok: false, error, kind }; };
    let env, text;
    try { env = await fetchEnvelope(FEED_URL, 'destinations', 'Your destinations feed has not been published yet (404). Your assistant needs to publish it first. Try again later.'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not load the destinations feed.', e instanceof FeedError ? e.kind : 'network'); }
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
    record({ lastAttemptAt: attemptAt, lastRefreshAt: refreshedAt, feedUpdated: parsed.updated || (env && env.updated) || null, lastError: null, lastErrorKind: null, lastAuto: auto });
    try { window.dispatchEvent(new CustomEvent('aitor:destinations-refreshed', { detail: { auto, stats } })); } catch { /* ignore */ }
    return { ok: true, stats, skipped: parsed.skipped };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function shouldAutoRefresh(now = Date.now()) {
  if (!hasPassphrase()) return false;
  const last = Date.parse(getState().lastAttemptAt || '') || 0;
  return now - last >= AUTO_REFRESH_MS;
}
/** Used on app open / when the app returns to the foreground. */
export function maybeAutoRefresh() {
  if (!shouldAutoRefresh()) return Promise.resolve(null);
  return refresh({ auto: true });
}
