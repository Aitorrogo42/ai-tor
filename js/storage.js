// Local-first storage. Everything lives in this browser's localStorage; nothing is ever sent anywhere.
// Namespacing: every key starts with "aitor:". The app core uses "aitor:core"; each section gets its own
// key "aitor:sec:<sectionId>", so future sections (e.g. travel) can never collide with each other.
const PREFIX = 'aitor:';
export const CORE_KEY = PREFIX + 'core';
export const CORE_VERSION = 1;

function read(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); } // may throw (quota/private mode)

export const defaultCore = () => ({ version: CORE_VERSION, profile: { name: '', currency: 'USD' } });

export function getCore() {
  const c = read(CORE_KEY);
  const d = defaultCore();
  if (!c || typeof c !== 'object' || !c.profile) return d;
  return { version: CORE_VERSION, profile: { name: String(c.profile.name ?? '').slice(0, 60), currency: String(c.profile.currency || 'USD') } };
}
export function setCore(core) { write(CORE_KEY, core); }

/** Per-section store. `id` must be a lowercase slug. */
export function section(id) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Bad section id: ' + id);
  const key = `${PREFIX}sec:${id}`;
  return { key, get: () => read(key), set: (doc) => write(key, doc), clear: () => localStorage.removeItem(key) };
}

/** Per-section device settings (e.g. the To-Do sync repo/token). Stored under "aitor:cfg:<id>"; NEVER part of export files,
 *  kept across Import, and wiped by "Erase all data". */
export function config(id) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Bad section id: ' + id);
  const key = `${PREFIX}cfg:${id}`;
  return { key, get: () => read(key), set: (v) => write(key, v), clear: () => localStorage.removeItem(key) };
}

export function listKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } } catch { /* ignore */ }
  return out;
}
export function eraseAll() { listKeys().forEach((k) => localStorage.removeItem(k)); }
/** Wipe profile + section documents but keep device settings (aitor:cfg:*), used by Import. */
export function eraseDocuments() { listKeys().filter((k) => !k.startsWith(PREFIX + 'cfg:')).forEach((k) => localStorage.removeItem(k)); }

/** Ask the browser not to evict our data (best effort; no network involved). */
export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}
