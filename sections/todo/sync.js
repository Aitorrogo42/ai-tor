// Optional daily task feed. The ONLY network request AI-TOR can make: GET https://api.github.com/repos/{repo}/contents/{path}
// (read-only, Authorization: Bearer <fine-grained token>, Accept: application/vnd.github.raw, cache: 'no-store').
// With no sync configured this module makes zero requests. Settings (repo, path, token) live in localStorage
// ("aitor:cfg:todo") on this device only; they are never exported.
import * as storage from '../../js/storage.js';
import { validate, emptyDoc, parseFeed, mergeFeed, LIMITS } from './model.js';

export const AUTO_SYNC_MS = 4 * 60 * 60 * 1000;   // auto-sync on open at most every 4 hours after a success
export const RETRY_MS = 30 * 60 * 1000;           // ...and not more than every 30 min after a failed attempt
export const DEFAULT_PATH = 'tasks.json';
const API = 'https://api.github.com';

const cfgStore = () => storage.config('todo');
const store = () => storage.section('todo');
let inFlight = null;

export function getConfig() {
  const c = cfgStore().get();
  return (c && typeof c === 'object') ? c : {};
}
export function isConfigured() { const c = getConfig(); return !!(c.repo && c.token); }
export function saveConfig({ repo, path, token }) {
  const prev = getConfig();
  cfgStore().set({ ...prev, repo: repo.trim(), path: (path || DEFAULT_PATH).trim(), token: token.trim() });
}
export function clearConfig() { cfgStore().clear(); }

export function checkConfig({ repo, path, token }) {
  const errors = [];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test((repo || '').trim())) errors.push('Repository must look like owner/name (for example yourname/ai-tor-tasks).');
  const p = (path || DEFAULT_PATH).trim().replace(/^\/+/, '');
  if (!p || p.length > 200 || p.split('/').some((s) => s === '' || s === '.' || s === '..') || /[\\?#\u0000-\u001f]/.test(p)) errors.push('File path looks invalid (example: tasks.json).');
  if (!(token || '').trim()) errors.push('Paste your read-only GitHub token.');
  else if (!/^[\x21-\x7e]+$/.test(token.trim()) || token.trim().length > 255) errors.push('The token has unexpected characters. Paste it again without spaces or line breaks.');
  return errors;
}

export function contentsUrl(repo, path) {
  const p = (path || DEFAULT_PATH).trim().replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${repo.trim()}/contents/${p}`;
}

export function describeHttp(status) {
  if (status === 401) return 'GitHub rejected the token (401). It may be wrong, expired or revoked. Create a new token and paste it in the sync settings.';
  if (status === 403) return 'GitHub refused the request (403). The token may lack read access to this repository, or the rate limit was hit. Try again later.';
  if (status === 404) return 'File not found (404). Check the repository name and file path, and that the token has access to that private repository (Contents: Read-only).';
  if (status === 429) return 'GitHub rate limit reached (429). Try again later.';
  if (status >= 500) return `GitHub had a problem (${status}). Try again later.`;
  return `GitHub returned an unexpected response (${status}).`;
}

function recordAttempt(patch) { try { cfgStore().set({ ...getConfig(), ...patch }); } catch { /* ignore */ } }

/** Fetch the feed and merge it into the local list. Never throws. Resolves { ok, added, updated, removed, skipped, error }. */
export function syncNow({ auto = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const cfg = getConfig();
    if (!cfg.repo || !cfg.token) return { ok: false, error: 'Sync is not set up yet.' };
    const attemptAt = new Date().toISOString();
    const fail = (error) => { recordAttempt({ lastAttemptAt: attemptAt, lastError: error }); return { ok: false, error }; };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return fail('You are offline. Sync will work when you are back online.');
    let text;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      let res;
      try {
        res = await fetch(contentsUrl(cfg.repo, cfg.path), {
          method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal: ctl.signal,
          headers: { Accept: 'application/vnd.github.raw', Authorization: 'Bearer ' + cfg.token },
        });
      } finally { clearTimeout(timer); }
      if (!res.ok) return fail(describeHttp(res.status));
      text = await res.text();
    } catch (e) {
      return fail(e && e.name === 'AbortError' ? 'GitHub took too long to answer. Try again.' : 'Could not reach GitHub. Check your connection and try again.');
    }
    const parsed = parseFeed(text);
    if (!parsed.ok) return fail(parsed.error);
    // read-merge-write synchronously so a concurrent edit in the UI cannot be lost
    const raw = store().get();
    let doc = emptyDoc();
    if (raw) { const v = validate(raw); if (!v.ok) return fail('Saved To-Do data looks damaged, so sync did not change it. Restore a backup or reset the To-Do section.'); doc = v.doc; }
    const stats = mergeFeed(doc, parsed.feed);
    try { store().set(doc); } catch { return fail('Could not save: storage is full or blocked.'); }
    recordAttempt({ lastAttemptAt: attemptAt, lastSyncAt: new Date().toISOString(), lastError: null, feedUpdated: parsed.feed.updated, lastStats: { added: stats.added, updated: stats.updated, removed: stats.removed, skipped: stats.skipped }, lastAuto: auto });
    try { window.dispatchEvent(new CustomEvent('aitor:todo-synced', { detail: stats })); } catch { /* ignore */ }
    return { ok: true, ...stats };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function shouldAutoSync(now = Date.now()) {
  const c = getConfig();
  if (!c.repo || !c.token) return false;
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
