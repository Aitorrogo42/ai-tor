// Optional task feed. AI-TOR fetches ONE same-origin file, ./feed/tasks.enc.json (an AES-GCM encrypted copy of the task list,
// published next to the app), and decrypts it on this device with a passphrase using WebCrypto. No third-party requests, no tokens.
// The passphrase lives only in localStorage ("aitor:cfg:todo") on this device; it is never exported or sent anywhere.
// With no passphrase set this module makes zero requests.
//
// File format: {"v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"<b64>","iv":"<b64>","ct":"<b64 ciphertext+16-byte tag>","updated":"ISO"}
// Key = PBKDF2-HMAC-SHA256(NFC(passphrase) as UTF-8, salt, iter) -> 256-bit AES-GCM key; 12-byte iv; no AAD.
import * as storage from '../../js/storage.js';
import { validate, emptyDoc, parseFeed, mergeFeed } from './model.js';

export const AUTO_SYNC_MS = 4 * 60 * 60 * 1000;   // auto-sync on open at most every 4 hours after a success
export const RETRY_MS = 30 * 60 * 1000;           // ...and not more than every 30 min after a failed attempt
export const FEED_URL = new URL('../../feed/tasks.enc.json', import.meta.url).href;   // same origin as the app
export const MAX_ITER = 2000000, MIN_ITER = 100000;

const cfgStore = () => storage.config('todo');
const store = () => storage.section('todo');
let inFlight = null;

export function getConfig() {
  const c = cfgStore().get();
  return (c && typeof c === 'object') ? c : {};
}
export function isConfigured() { const c = getConfig(); return typeof c.passphrase === 'string' && c.passphrase.length > 0; }
export function saveConfig({ passphrase }) {
  const prev = getConfig();
  const { repo, path, token, ...rest } = prev;   // drop obsolete GitHub settings if an older version stored them
  cfgStore().set({ ...rest, passphrase });
}
export function clearConfig() { cfgStore().clear(); }
export function checkConfig({ passphrase }) {
  const errors = [];
  if (!passphrase) errors.push('Enter the passphrase.');
  else if (passphrase.length < 8) errors.push('The passphrase must be at least 8 characters.');
  else if (passphrase.length > 200) errors.push('That passphrase is too long (max 200 characters).');
  return errors;
}

const b64 = (s) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
export class FeedError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }

/** Decrypt the envelope object (already JSON-parsed) -> plaintext string. Throws FeedError(kind: 'format' | 'passphrase' | 'nocrypto'). */
export async function decryptEnvelope(env, passphrase) {
  const bad = (m) => new FeedError('format', m || 'The encrypted task file is in an unexpected format.');
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw bad();
  if (env.v !== 1) throw bad(env.v > 1 ? 'The encrypted task file is a newer format than this app understands (update AI-TOR).' : null);
  if (env.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(env.iter) || env.iter < MIN_ITER || env.iter > MAX_ITER) throw bad();
  if (typeof env.salt !== 'string' || typeof env.iv !== 'string' || typeof env.ct !== 'string') throw bad();
  let salt, iv, ct;
  try { salt = b64(env.salt); iv = b64(env.iv); ct = b64(env.ct); } catch { throw bad(); }
  if (salt.length < 8 || salt.length > 64 || iv.length !== 12 || ct.length < 16 || ct.length > 4 * 1024 * 1024) throw bad();
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new FeedError('nocrypto', 'This browser cannot do encryption here (it needs HTTPS). Open AI-TOR from its normal https address.');
  const pw = new TextEncoder().encode(String(passphrase).normalize('NFC'));
  let plain;
  try {
    const base = await subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: env.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch { throw new FeedError('passphrase', 'Wrong passphrase. It must match the one used to encrypt the task list exactly (check capital letters and spaces). Open sync settings to re-enter it.'); }
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}

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

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || ''); if (!t) return 'never';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
