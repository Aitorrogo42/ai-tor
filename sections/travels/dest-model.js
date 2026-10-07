// Travels → Destinations: data model for places proposed by the Travel Guide bot (arrive through the encrypted feed
// ./feed/destinations.enc.json) plus the user's own local state. Stored inside the Travels document (aitor:sec:travels, `destinations`).
//
// Feed plaintext (version 1):
//   { "version":1, "updated":"ISO", "places":[ { "id":"stable-slug", "name", "kind":"country|state|city|activity|museum", "region",
//       "summary", "recommended_on":"YYYY-MM-DD", "best_window", "things_to_do":[{ "title","details","url"? }], "logistics":[text],
//       "downsides":[text], "links":[{ "label","url" }], "favorite":bool?, "removed":bool? } ] }
// Stored place = the feed fields (feed wins on every refresh) + local state that a refresh NEVER overwrites:
//   favorite (bool; the feed's value is only used when the place first arrives), note (text), seen (bool, false = shows NEW), arrivedAt (ISO).
// All text is rendered with textContent only; only https:// URLs are ever turned into links.
import { isValidISODate } from '../../js/util.js';

export const KINDS = ['country', 'state', 'city', 'activity', 'museum'];
export const KIND_LABEL = { country: 'Country', state: 'State', city: 'City', activity: 'Activity', museum: 'Museum', other: 'Other' };
export const LIMITS = { places: 1000, id: 80, name: 120, region: 120, summary: 400, window: 300, todos: 60, title: 150, details: 2000, lines: 40, line: 600, links: 30, label: 120, url: 500, note: 2000 };

const isStr = (v) => typeof v === 'string';
const txt = (v, max) => (isStr(v) ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Returns the normalized URL string if `u` is a plain https:// URL, else null (javascript:, http:, data:, relative… are all rejected). */
export function safeUrl(u) {
  if (!isStr(u)) return null;
  const s = u.trim();
  if (!s || s.length > LIMITS.url || !/^https:\/\//i.test(s) || /[\u0000-\u0020\u007f]/.test(s)) return null;
  try {
    const x = new URL(s);
    if (x.protocol !== 'https:' || !x.hostname || x.username || x.password) return null;
    return x.href;
  } catch { return null; }
}

const lines = (v) => (Array.isArray(v) ? v.map((x) => txt(x, LIMITS.line)).filter(Boolean).slice(0, LIMITS.lines) : []);

/** Sanitize ONE place (feed item or stored item). Returns null if it has no usable id/name. Never throws. */
export function cleanPlace(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const id = isStr(o.id) ? o.id.trim() : '';
  const name = txt(o.name, LIMITS.name);
  if (!id || id.length > LIMITS.id || !ID_RE.test(id) || !name) return null;
  const todos = (Array.isArray(o.things_to_do) ? o.things_to_do : []).map((t) => {
    if (!t || typeof t !== 'object') return null;
    const title = txt(t.title, LIMITS.title);
    if (!title) return null;
    const url = safeUrl(t.url);
    return { title, details: txt(t.details, LIMITS.details), ...(url ? { url } : {}) };
  }).filter(Boolean).slice(0, LIMITS.todos);
  const links = (Array.isArray(o.links) ? o.links : []).map((l) => {
    if (!l || typeof l !== 'object') return null;
    const url = safeUrl(l.url);
    if (!url) return null;
    return { label: txt(l.label, LIMITS.label) || new URL(url).hostname, url };
  }).filter(Boolean).slice(0, LIMITS.links);
  return {
    id, name,
    kind: KINDS.includes(o.kind) ? o.kind : 'other',
    region: txt(o.region, LIMITS.region),
    summary: txt(o.summary, LIMITS.summary),
    recommended_on: isValidISODate(o.recommended_on) ? o.recommended_on : null,
    best_window: txt(o.best_window, LIMITS.window),
    things_to_do: todos, logistics: lines(o.logistics), downsides: lines(o.downsides), links,
  };
}

/** Parse the decrypted feed text. Returns { ok, error, places, removed:Set<id>, updated, skipped }. */
export function parseFeed(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'The destinations feed is not valid data.' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'The destinations feed is not valid data.' };
  if (raw.version !== 1) return { ok: false, error: raw.version > 1 ? 'The destinations feed is a newer format than this app understands. Update AI-TOR.' : 'The destinations feed has an unknown version.' };
  if (!Array.isArray(raw.places)) return { ok: false, error: 'The destinations feed has no list of places.' };
  if (raw.places.length > LIMITS.places) return { ok: false, error: 'The destinations feed is too large.' };
  const places = [], removed = new Set(), seen = new Set();
  let skipped = 0;
  for (const o of raw.places) {
    if (o && o.removed === true && isStr(o.id) && o.id.trim() && ID_RE.test(o.id.trim()) && o.id.trim().length <= LIMITS.id) {   // a removal only needs the id
      removed.add(o.id.trim()); seen.add(o.id.trim()); continue;
    }
    const p = cleanPlace(o);
    if (!p || seen.has(p.id)) { skipped++; continue; }
    seen.add(p.id);
    if (o.removed === true) { removed.add(p.id); continue; }
    p.feedFavorite = o.favorite === true;
    places.push(p);
  }
  return { ok: true, places, removed, skipped, updated: isStr(raw.updated) ? raw.updated.slice(0, 40) : null };
}

/** Merge parsed feed places into `places` (the stored array, mutated in place). Feed fields overwrite; favorite/note/seen/arrivedAt
 *  are local and kept; places missing from the feed stay; `removed:true` deletes. Returns { added, updated, removed }. */
export function mergePlaces(places, parsed, now = new Date().toISOString()) {
  const st = { added: 0, updated: 0, removed: 0 };
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const id of parsed.removed) { if (byId.has(id)) { places.splice(places.indexOf(byId.get(id)), 1); byId.delete(id); st.removed++; } }
  for (const f of parsed.places) {
    const { feedFavorite, ...fields } = f;
    const cur = byId.get(f.id);
    if (cur) {
      const before = JSON.stringify(FEED_FIELDS.map((k) => cur[k]));
      FEED_FIELDS.forEach((k) => { cur[k] = fields[k]; });
      if (JSON.stringify(FEED_FIELDS.map((k) => cur[k])) !== before) st.updated++;
    } else {
      const p = { ...fields, favorite: feedFavorite === true, note: '', seen: false, arrivedAt: now };
      places.push(p); byId.set(p.id, p); st.added++;
    }
  }
  return st;
}
const FEED_FIELDS = ['name', 'kind', 'region', 'summary', 'recommended_on', 'best_window', 'things_to_do', 'logistics', 'downsides', 'links'];

/** Sanitize a stored place (feed fields + local state). */
export function cleanStored(o) {
  const p = cleanPlace(o);
  if (!p) return null;
  return { ...p, favorite: o.favorite === true, note: txt(o.note, LIMITS.note), seen: o.seen === true,
    arrivedAt: isStr(o.arrivedAt) && Number.isFinite(Date.parse(o.arrivedAt)) ? o.arrivedAt.slice(0, 40) : null };
}

/** Newest recommended first (missing date = oldest), then most recently arrived, then name. */
export function sortPlaces(list) {
  return [...list].sort((a, b) => (b.recommended_on || '').localeCompare(a.recommended_on || '')
    || (b.arrivedAt || '').localeCompare(a.arrivedAt || '') || a.name.localeCompare(b.name));
}

/** v40: is this place NEW? Not opened yet AND arrived after `boundary` (the end of your previous visit to the list, ISO).
 *  With no boundary (no history yet) only the most recent arrival batch counts as new. */
export function isNewPlace(p, boundary, list) {
  if (!p || p.seen) return false;
  const at = p.arrivedAt || '';
  if (boundary) return at > boundary;
  const newest = (list || []).reduce((m, x) => ((x.arrivedAt || '') > m ? x.arrivedAt : m), '');
  return at >= newest;
}
export const countNew = (list, boundary) => list.filter((p) => isNewPlace(p, boundary, list)).length;

/** Map a country-kind place to the bundled countries list (by name or alias, accent/case-insensitive), or null. */
export function matchCountry(place, countries, norm) {
  if (place.kind !== 'country') return null;
  const n = norm(place.name);
  return countries.find((c) => norm(c.name) === n || (c.aliases && c.aliases.split(/[,;|]/).some((a) => norm(a) === n))) || null;
}
