// Shared by the encrypted feeds (To-Do tasks, Finances snapshot). Each feed is ONE same-origin file in ./feed/ whose contents are
// AES-GCM encrypted; it is decrypted on this device with ONE passphrase (shared by all feeds) using WebCrypto.
// No third-party requests. With no passphrase stored, nothing here ever makes a request.
//
// Envelope: {"v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"<b64>","iv":"<b64>","ct":"<b64 ciphertext+16-byte tag>","updated":"ISO"}
// Key = PBKDF2-HMAC-SHA256(NFC(passphrase) as UTF-8, salt, iter) -> 256-bit AES-GCM key; 12-byte iv; no AAD.
//
// The passphrase lives only in localStorage on this device (never exported, never sent anywhere):
//   aitor:cfg:feed  {passphrase}   = the shared place (new)
//   aitor:cfg:todo  {passphrase,…} = mirrored copy, kept so older code paths / earlier installs keep working
import * as storage from './storage.js';

export const MAX_ITER = 2000000, MIN_ITER = 100000;
export class FeedError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }

const b64 = (s) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

// ---- shared passphrase ----
export function getPassphrase() {
  const a = obj(storage.config('feed').get()).passphrase;
  if (typeof a === 'string' && a) return a;
  const b = obj(storage.config('todo').get()).passphrase;   // an earlier install only stored it with To-Do
  return (typeof b === 'string' && b) ? b : '';
}
export function hasPassphrase() { return getPassphrase().length > 0; }
export function setPassphrase(p) {
  storage.config('feed').set({ ...obj(storage.config('feed').get()), passphrase: p });
  const t = obj(storage.config('todo').get());
  const { repo, path, token, ...rest } = t;   // drop obsolete GitHub settings if an older version stored them
  storage.config('todo').set({ ...rest, passphrase: p });
}
export function clearPassphrase() {
  storage.config('feed').clear();
  const { passphrase, ...rest } = obj(storage.config('todo').get());
  storage.config('todo').set(rest);
}
export function checkPassphrase(passphrase) {
  const errors = [];
  if (!passphrase) errors.push('Enter the passphrase.');
  else if (passphrase.length < 8) errors.push('The passphrase must be at least 8 characters.');
  else if (passphrase.length > 200) errors.push('That passphrase is too long (max 200 characters).');
  return errors;
}

/** Decrypt the envelope object (already JSON-parsed) -> plaintext string. `noun` is only used in messages ('task' / 'finance').
 *  Throws FeedError(kind: 'format' | 'passphrase' | 'nocrypto'). */
export async function decryptEnvelope(env, passphrase, noun = 'task') {
  const bad = (m) => new FeedError('format', m || `The encrypted ${noun} file is in an unexpected format.`);
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw bad();
  if (env.v !== 1) throw bad(env.v > 1 ? `The encrypted ${noun} file is a newer format than this app understands (update AI-TOR).` : null);
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
  } catch { throw new FeedError('passphrase', `Wrong passphrase. It must match the one used to encrypt the ${noun} data exactly (check capital letters and spaces).`); }
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}

/** GET a same-origin encrypted feed (never cached by the browser; the service worker is network-first for /feed/).
 *  Resolves the parsed envelope; throws FeedError(kind: 'offline' | 'http' | 'network' | 'timeout' | 'format') with a user-facing message. */
// ---- v40: fetching + auto-refresh timing shared by the three feeds ----
// Root cause of "new destinations never show up" (v39 and earlier): on a phone the app's single auto-refresh fired the instant it came back to
// the foreground, when the network is often not up yet. In the service worker that failed fetch silently fell back to the LAST CACHED copy, so
// the app "succeeded" with yesterday's feed, stamped "Updated just now", and did not look again for 15 minutes. Now:
//  * every feed request is cache-busted (?t=) and no-store, and gets one quick retry (phones often drop the first request after waking);
//  * a copy the service worker serves from its offline cache is marked (X-Aitor-Feed-Cache) and treated as a network failure, never as fresh;
//  * a network-type failure is retried soon (20 s, 1 min, 3 min, 10 min) while the app is open, instead of blocking for 15 minutes.
export const AUTO_MS = 15 * 60 * 1000;                  // a successful (or non-network) attempt: next auto refresh after 15 minutes
export const RETRY_BACKOFF_MS = [20e3, 60e3, 180e3, 600e3];
export const TRANSIENT_KINDS = ['offline', 'network', 'timeout', 'cache'];
export const CACHE_HEADER = 'X-Aitor-Feed-Cache';      // set by sw.js on a response it served from its offline copy
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** GET a feed file: cache-busting query + no-store, one quick retry on a network failure or a service-worker offline copy.
 *  Resolves the Response; rejects with an AbortError (timeout) or a TypeError('network') like fetch(). */
export async function feedFetch(url, signal) {
  const opts = { method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal };
  for (let i = 0; ; i++) {
    let res = null, err = null;
    try { res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now().toString(36), opts); } catch (e) { err = e; }
    if (err && err.name === 'AbortError') throw err;
    if (res && !res.headers.get(CACHE_HEADER)) return res;
    if (i >= 1) throw err || new TypeError('network (the service worker served its offline copy)');
    await sleep(1500);
    if (signal && signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
  }
}
/** Milliseconds until the next auto refresh is due (0 = now), from a feed's device state {lastAttemptAt, lastErrorKind, failStreak}. */
export function autoDueIn(st, now = Date.now(), everyMs = AUTO_MS) {
  const last = Date.parse((st && st.lastAttemptAt) || '') || 0;
  const transient = st && st.lastError && TRANSIENT_KINDS.includes(st.lastErrorKind);
  const wait = transient ? RETRY_BACKOFF_MS[Math.min(Math.max(1, st.failStreak || 1), RETRY_BACKOFF_MS.length) - 1] : everyMs;
  return Math.max(0, last + wait - now);
}
/** The failure-streak value to store after an attempt that failed with `kind` (0 for a success / a non-network failure). */
export const nextFailStreak = (st, kind) => (TRANSIENT_KINDS.includes(kind) ? Math.min(((st && st.failStreak) || 0) + 1, 99) : 0);

export async function fetchEnvelope(url, noun, notFoundMsg) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new FeedError('offline', 'You are offline. Refresh will work when you are back online.');
  let text;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let res;
    try { res = await feedFetch(url, ctl.signal); }
    finally { clearTimeout(timer); }
    if (!res.ok) {
      const s = res.status;
      throw new FeedError('http', s === 404 ? notFoundMsg : s === 429 ? 'The server is busy (429). Try again later.' : s >= 500 ? `The server had a problem (${s}). Try again later.` : `The ${noun} feed returned an unexpected response (${s}).`);
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof FeedError) throw e;
    throw e && e.name === 'AbortError' ? new FeedError('timeout', `The ${noun} feed took too long to answer. Try again.`) : new FeedError('network', `Could not load the ${noun} feed. Check your connection and try again.`);
  }
  if (text.length > 6 * 1024 * 1024) throw new FeedError('format', `The encrypted ${noun} file is too large.`);
  try { return JSON.parse(text); } catch { throw new FeedError('format', `The encrypted ${noun} file is not valid JSON (it may still be uploading). Try again in a minute.`); }
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || ''); if (!t) return 'never';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
