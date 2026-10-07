// v42: Architecture photo analysis, device side ("one tap" upload + encrypted results feed).
//  * Send: the photo (long edge 1600 px, re-encoded so it carries NO metadata) + the position + your note are put in one JSON request, encrypted on this
//    device with the SHARED feed passphrase (js/feedcrypto.js, same envelope as every feed) and PUT as a file to a private ntfy.sh topic (a free relay:
//    no account, no key; it only ever sees ciphertext and deletes the file after 3 hours). The topic is not in the app: it arrives inside the encrypted
//    results feed ("inbox"), so nobody without the passphrase can even find it.
//  * Receive: ./feed/architecture.enc.json (same origin, AES-GCM) carries the suggestions for each request id. It is checked by the shared auto-refresh
//    (js/feedauto.js): every 2 minutes while a photo is waiting for its result and the app is open, otherwise every 15 minutes.
// Device state (never exported, wiped by "Erase all data"): aitor:cfg:archphoto = { inbox, pending:[…], results:{id:result}, feed sync info }.
// Photos: IndexedDB (photodb.js). Nothing is logged until you approve tags on the review page (photo-ui.js).
import * as storage from '../../js/storage.js';
import { FeedError, decryptEnvelope, fetchEnvelope, encryptEnvelope, getPassphrase, setPassphrase, hasPassphrase, checkPassphrase, toB64, AUTO_MS, autoDueIn, nextFailStreak, RETRY_BACKOFF_MS } from '../../js/feedcrypto.js';
import { getPhoto } from './photodb.js';

export const FEED_URL = new URL('../../feed/architecture.enc.json', import.meta.url).href;
export const RELAY = 'https://ntfy.sh';                 // the ONLY relay the app will talk to (also pinned in the CSP connect-src)
export const PENDING_POLL_MS = 2 * 60 * 1000;           // while a sent photo waits for its result
export const SLOW_AFTER_MS = 2 * 60 * 60 * 1000;        // "taking longer than usual"
const TOPIC_RE = /^aitor-arch-[0-9a-f]{32}$/;
export const ID_RE = /^ap_\d{8}_[a-z0-9]{4,16}$/;
const MAX_PENDING = 20;
export { hasPassphrase, checkPassphrase };

const cfg = () => storage.config('archphoto');
export function getState() { const c = cfg().get(); return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {}; }
function record(patch) { try { cfg().set({ ...getState(), ...patch }); return true; } catch { return false; } }
function emit(detail = {}) { try { window.dispatchEvent(new CustomEvent('aitor:arch-updated', { detail })); } catch { /* ignore */ } }

export function newRequestId(d = new Date()) {
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const r = crypto.getRandomValues(new Uint8Array(8)); let s = '';
  for (const b of r) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36];
  return `ap_${ymd}_${s}`;
}

// ---------------------------------------------------------------- pending requests
export const pending = () => (Array.isArray(getState().pending) ? getState().pending.filter((p) => p && ID_RE.test(p.id)) : []);
export const pendingById = (id) => pending().find((p) => p.id === id) || null;
export const resultFor = (id) => { const r = getState().results; return r && typeof r === 'object' ? r[id] || null : null; };
export const readyCount = () => pending().filter((p) => p.status === 'ready').length;
export function addPending(p) {
  const list = pending();
  if (list.length >= MAX_PENDING) return false;
  const ok = record({ pending: [...list, { status: 'queued', tries: 0, ...p }] });
  emit({ added: p.id });
  return ok;
}
export function updatePending(id, patch) { record({ pending: pending().map((p) => (p.id === id ? { ...p, ...patch } : p)) }); }
/** Forget a request (after Save to log / Discard / Cancel). Its result is dropped too. */
export function removePending(id) {
  const res = { ...(getState().results || {}) }; delete res[id];
  record({ pending: pending().filter((p) => p.id !== id), results: res });
  emit({ removed: id });
}

// ---------------------------------------------------------------- results feed
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** Parse the decrypted feed text. Returns { ok, inbox, results, updated, error }. */
export function parseFeed(text) {
  let d; try { d = JSON.parse(text); } catch { return { ok: false, error: 'The architecture feed is not valid JSON.' }; }
  if (!isObj(d)) return { ok: false, error: 'The architecture feed is in an unexpected format.' };
  if (d.version !== 1) return { ok: false, error: d.version > 1 ? 'The architecture feed is a newer format than this app understands (update AI-TOR).' : 'The architecture feed is in an unexpected format.' };
  const inbox = isObj(d.inbox) && d.inbox.relay === RELAY && TOPIC_RE.test(d.inbox.topic || '') ? { relay: RELAY, topic: d.inbox.topic } : null;
  const results = {};
  for (const r of Array.isArray(d.results) ? d.results.slice(0, 200) : []) {
    if (!isObj(r) || !ID_RE.test(r.id || '') || !['ok', 'unclear', 'failed'].includes(r.status)) continue;
    results[r.id] = { id: r.id, status: r.status, analyzedAt: typeof r.analyzedAt === 'string' ? r.analyzedAt.slice(0, 40) : '',
      subject: { summary: isObj(r.subject) && typeof r.subject.summary === 'string' ? r.subject.summary.slice(0, 120) : '', name: isObj(r.subject) && typeof r.subject.name === 'string' ? r.subject.name.slice(0, 120) : '' },
      place: isObj(r.place) ? r.place : null, tags: Array.isArray(r.tags) ? r.tags.slice(0, 10).filter(isObj) : [] };
  }
  return { ok: true, inbox, results, updated: typeof d.updated === 'string' ? d.updated : null };
}

let inFlight = null;
/** Fetch + decrypt the results feed. Never throws. Resolves { ok, ready, error, kind }. `passphrase` (optional) is stored only after it decrypts. */
export function refresh({ auto = false, passphrase = null } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const pass = passphrase != null ? passphrase : getPassphrase();
    if (!pass) return { ok: false, kind: 'nopass', error: 'Enter your passphrase to use photo analysis.' };
    if (passphrase != null) { const errs = checkPassphrase(passphrase); if (errs.length) return { ok: false, kind: 'nopass', error: errs[0] }; }
    const attemptAt = new Date().toISOString();
    const fail = (error, kind) => { record({ lastAttemptAt: attemptAt, lastError: error, lastErrorKind: kind, failStreak: nextFailStreak(getState(), kind) }); return { ok: false, error, kind }; };
    let env, text;
    try { env = await fetchEnvelope(FEED_URL, 'architecture', 'Photo analysis is not switched on yet (no results feed published). Your photos are kept and sent once it is.'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not load the architecture feed.', e instanceof FeedError ? e.kind : 'network'); }
    const sig = env && typeof env.ct === 'string' ? `${env.updated || ''}|${env.ct.length}|${env.ct.slice(-32)}` : null;
    const st0 = getState();
    if (passphrase == null && sig && st0.feedSig === sig && st0.inbox) {     // same ciphertext as last time: nothing new (skips the slow key derivation)
      record({ lastAttemptAt: attemptAt, lastRefreshAt: attemptAt, lastError: null, lastErrorKind: null, failStreak: 0 });
      return { ok: true, ready: 0, unchanged: true };
    }
    try { text = await decryptEnvelope(env, pass, 'architecture'); }
    catch (e) { return fail(e instanceof FeedError ? e.message : 'Could not read the encrypted architecture file.', e instanceof FeedError ? e.kind : 'format'); }
    const parsed = parseFeed(text);
    if (!parsed.ok) return fail(parsed.error, 'format');
    if (passphrase != null) { try { setPassphrase(passphrase); } catch { /* ignore */ } }
    // keep only results for photos this device is waiting for; mark them ready
    const list = pending(); const results = { ...(getState().results || {}) }; let ready = 0;
    const next = list.map((p) => {
      const r = parsed.results[p.id];
      if (!r) return p;
      results[p.id] = r;
      if (p.status !== 'ready') { ready++; return { ...p, status: 'ready', readyAt: new Date().toISOString(), lastError: null }; }
      return p;
    });
    for (const k of Object.keys(results)) if (!next.some((p) => p.id === k)) delete results[k];
    record({ inbox: parsed.inbox || st0.inbox || null, pending: next, results, lastAttemptAt: attemptAt, lastRefreshAt: new Date().toISOString(), feedUpdated: parsed.updated, feedSig: sig, lastError: null, lastErrorKind: null, failStreak: 0, lastAuto: auto });
    emit({ refreshed: true, ready });
    return { ok: true, ready, inbox: !!(parsed.inbox || st0.inbox) };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** ms until the next feed check: 2 min while a sent photo waits for its result (or a queued one waits to be sent), else 15 min; null without a passphrase. */
export function autoRefreshIn(now = Date.now()) {
  if (!hasPassphrase()) return null;
  const list = pending();
  const waiting = list.some((p) => p.status === 'sent' || (p.status === 'queued' && !getState().inbox));
  const feedIn = autoDueIn(getState(), now, waiting ? PENDING_POLL_MS : AUTO_MS);
  const queued = list.filter((p) => p.status === 'queued' && getState().inbox).map((p) => Math.max(0, (Date.parse(p.nextTryAt || '') || 0) - now));
  return Math.min(feedIn, ...queued);
}
/** Used by js/feedauto.js on open / foreground / online and on its timer. */
export async function maybeAutoRefresh() {
  let r = null;
  if (autoDueIn(getState(), Date.now(), pending().some((p) => p.status === 'sent' || p.status === 'queued') ? PENDING_POLL_MS : AUTO_MS) === 0) r = await refresh({ auto: true });
  await sendQueued();
  return r;
}

// ---------------------------------------------------------------- send (encrypt + upload to the relay)
const sending = new Set();
export async function sendQueued({ force = false } = {}) {
  const now = Date.now();
  for (const p of pending()) {
    if (p.status !== 'queued' || sending.has(p.id)) continue;
    if (!force && (Date.parse(p.nextTryAt || '') || 0) > now) continue;
    await send(p.id);
  }
}
/** Encrypt + upload one queued request. Never throws. Resolves { ok, error, kind }. */
export async function send(id) {
  if (sending.has(id)) return { ok: false, kind: 'busy' };
  sending.add(id);
  emit({ sending: id });
  try {
    const p = pendingById(id);
    if (!p || p.status !== 'queued') return { ok: false, kind: 'gone' };
    const tries = (p.tries || 0) + 1;
    const later = (error, kind, retry = true) => {
      updatePending(id, { lastError: error, lastErrorKind: kind, tries, nextTryAt: retry ? new Date(Date.now() + RETRY_BACKOFF_MS[Math.min(tries, RETRY_BACKOFF_MS.length) - 1]).toISOString() : null });
      return { ok: false, error, kind };
    };
    const pass = getPassphrase();
    if (!pass) return later('Enter your passphrase to send photos for analysis.', 'nopass', false);
    if (!getState().inbox) await refresh({ auto: true });
    const inbox = getState().inbox;
    if (!inbox) return later(getState().lastError || 'Photo analysis is not switched on yet. Your photo is kept and will be sent once it is.', 'noinbox');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return later('You are offline. The photo is sent when you are back online.', 'offline');
    let rec;
    try { rec = await getPhoto(p.photoId); } catch { rec = null; }
    if (!rec || !rec.full) { updatePending(id, { status: 'failed', lastError: 'The photo is no longer on this device.', lastErrorKind: 'photo' }); return { ok: false, kind: 'photo' }; }
    const req = { kind: 'arch-photo-request', v: 1, id: p.id, createdAt: p.takenAt || p.createdAt, image: { mime: 'image/jpeg', w: rec.w, h: rec.h, b64: toB64(new Uint8Array(rec.full)) }, location: p.location || null };
    if (p.note) req.note = p.note;
    let body;
    try { body = JSON.stringify(await encryptEnvelope(JSON.stringify(req), pass)); }
    catch (e) { return later(e instanceof FeedError ? e.message : 'Could not encrypt the photo.', 'crypto', false); }
    let res;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 90000);
    try {
      res = await fetch(`${RELAY}/${inbox.topic}`, { method: 'PUT', body: new Blob([body], { type: 'application/octet-stream' }), headers: { Filename: `${p.id}.aitor`, Firebase: 'no' },
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors', signal: ctl.signal });
    } catch (e) { return later(e && e.name === 'AbortError' ? 'Sending took too long. It is tried again soon.' : 'Could not reach the relay. It is tried again soon.', e && e.name === 'AbortError' ? 'timeout' : 'network'); }
    finally { clearTimeout(timer); }
    if (!res.ok) {
      const s = res.status;
      return later(s === 413 ? 'The photo is too large for the relay.' : s === 429 ? 'The relay is busy (429). It is tried again soon.' : `The relay answered ${s}. It is tried again soon.`, s === 413 ? 'toolarge' : 'http', s !== 413);
    }
    let j = {}; try { j = await res.json(); } catch { /* ignore */ }
    updatePending(id, { status: 'sent', sentAt: new Date().toISOString(), msgId: typeof j.id === 'string' ? j.id.slice(0, 40) : '', lastError: null, lastErrorKind: null, tries, nextTryAt: null });
    // look for the result 2 minutes from now (not immediately: the analysis takes minutes)
    record({ lastAttemptAt: new Date().toISOString(), lastError: null, lastErrorKind: null, failStreak: 0 });
    try { const fa = await import('../../js/feedauto.js'); fa.kick(PENDING_POLL_MS + 500); } catch { /* ignore */ }
    return { ok: true };
  } finally { sending.delete(id); emit({ sent: id }); }
}
export const isSending = (id) => sending.has(id);
