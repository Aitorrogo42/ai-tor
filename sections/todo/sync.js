// Optional task feed. AI-TOR fetches ONE same-origin file, ./feed/tasks.enc.json (an AES-GCM encrypted copy of the task list,
// published next to the app), and decrypts it on this device with a passphrase using WebCrypto. No third-party requests, no tokens.
// The passphrase is shared with the Finances feed (js/feedcrypto.js) and lives only in localStorage on this device
// ("aitor:cfg:feed", mirrored in "aitor:cfg:todo"); it is never exported or sent anywhere.
// With no passphrase set this module makes zero requests.
//
// File format: {"v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"<b64>","iv":"<b64>","ct":"<b64 ciphertext+16-byte tag>","updated":"ISO"}
// Key = PBKDF2-HMAC-SHA256(NFC(passphrase) as UTF-8, salt, iter) -> 256-bit AES-GCM key; 12-byte iv; no AAD.
import * as storage from '../../js/storage.js';
import { validate, emptyDoc, parseFeed, mergeFeed } from './model.js';
import * as feedcrypto from '../../js/feedcrypto.js';
import { FeedError } from '../../js/feedcrypto.js';   // shared crypto + passphrase live in js/feedcrypto.js
export { FeedError };

export const AUTO_SYNC_MS = 4 * 60 * 60 * 1000;   // auto-sync on open at most every 4 hours after a success
export const RETRY_MS = 30 * 60 * 1000;           // ...and not more than every 30 min after a failed attempt
export const FEED_URL = new URL('../../feed/tasks.enc.json', import.meta.url).href;   // same origin as the app
export { MAX_ITER, MIN_ITER } from '../../js/feedcrypto.js';

const cfgStore = () => storage.config('todo');
const store = () => storage.section('todo');
let inFlight = null;

export function getConfig() {
  const c = cfgStore().get();
  const cfg = (c && typeof c === 'object') ? { ...c } : {};
  const p = feedcrypto.getPassphrase();   // the passphrase is shared with Finances (aitor:cfg:feed)
  if (p) cfg.passphrase = p; else delete cfg.passphrase;
  return cfg;
}
export function isConfigured() { return feedcrypto.hasPassphrase(); }
export function saveConfig({ passphrase }) { feedcrypto.setPassphrase(passphrase); }
export function clearConfig() { feedcrypto.clearPassphrase(); cfgStore().clear(); }
export const checkConfig = ({ passphrase }) => feedcrypto.checkPassphrase(passphrase);

/** Decrypt the envelope object (already JSON-parsed) -> plaintext string. Throws FeedError(kind: 'format' | 'passphrase' | 'nocrypto'). */
export const decryptEnvelope = (env, passphrase) => feedcrypto.decryptEnvelope(env, passphrase, 'task');

export function describeHttp(status) {
  if (status === 404) return 'No task feed found yet (404). Your assistant has not published the encrypted list, or AI-TOR is not up to date. Try again later.';
  if (status === 429) return 'The server is busy (429). Try again later.';
  if (status >= 500) return `The server had a problem (${status}). Try again later.`;
  return `The task feed returned an unexpected response (${status}).`;
}

function recordAttempt(patch) { try { cfgStore().set({ ...getConfig(), ...patch }); } catch { /* ignore */ } }

/** Fetch the feed and merge it into the local list. Never throws. Resolves { ok, added, updated, removed, skipped, error }. */
export function syncNow({ auto = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const cfg = getConfig();
    if (!isConfigured()) return { ok: false, error: 'Enter your passphrase in the sync settings first.' };
    const attemptAt = new Date().toISOString();
    const fail = (error) => { recordAttempt({ lastAttemptAt: attemptAt, lastError: error }); return { ok: false, error }; };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('You are offline. Sync will work when you are back online.');
    let env;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      let res;
      try {
        res = await fetch(FEED_URL, { method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal: ctl.signal });
      } finally { clearTimeout(timer); }
      if (!res.ok) return fail(describeHttp(res.status));
      const text = await res.text();
      if (text.length > 6 * 1024 * 1024) return fail('The encrypted task file is too large.');
      try { env = JSON.parse(text); } catch { return fail('The encrypted task file is not valid JSON (it may still be uploading). Try again in a minute.'); }
    } catch (e) {
      return fail(e && e.name === 'AbortError' ? 'The task feed took too long to answer. Try again.' : 'Could not load the task feed. Check your connection and try again.');
    }
    let text;
    try { text = await decryptEnvelope(env, cfg.passphrase); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not read the encrypted task file.'); }
    const parsed = parseFeed(text);
    if (!parsed.ok) return fail(parsed.error);
    // read-merge-write synchronously so a concurrent edit in the UI cannot be lost
    const raw = store().get();
    let doc = emptyDoc();
    if (raw) { const v = validate(raw); if (!v.ok) return fail('Saved To-Do data looks damaged, so sync did not change it. Restore a backup or reset the To-Do section.'); doc = v.doc; }
    const stats = mergeFeed(doc, parsed.feed);
    try { store().set(doc); } catch { return fail('Could not save: storage is full or blocked.'); }
    recordAttempt({ lastAttemptAt: attemptAt, lastSyncAt: new Date().toISOString(), lastError: null, feedUpdated: parsed.feed.updated || (env && env.updated) || null, lastStats: { added: stats.added, updated: stats.updated, removed: stats.removed, skipped: stats.skipped }, lastAuto: auto });
    try { window.dispatchEvent(new CustomEvent('aitor:todo-synced', { detail: stats })); } catch { /* ignore */ }
    return { ok: true, ...stats };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function shouldAutoSync(now = Date.now()) {
  const c = getConfig();
  if (!isConfigured()) return false;
  const last = Date.parse(c.lastSyncAt || '') || 0;
  const attempt = Date.parse(c.lastAttemptAt || '') || 0;
  return now - last >= AUTO_SYNC_MS && now - attempt >= RETRY_MS;
}
export function maybeAutoSync() { return shouldAutoSync() ? syncNow({ auto: true }) : Promise.resolve(null); }

export const timeAgo = feedcrypto.timeAgo;
