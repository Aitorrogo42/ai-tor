// Travels data model (document version 1). Stored at "aitor:sec:travels".
// { version:1, updatedAt, visited: [ { code:'FR', years:'2019, 2022', note:'…' } ] }
import { COUNTRIES } from './countries.js';

export const VERSION = 1;
export const LIMITS = { years: 40, note: 500 };
export const TOTAL = COUNTRIES.length;
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryByCode = (code) => BY_CODE.get(code);

export const emptyDoc = () => ({ version: VERSION, updatedAt: null, visited: [] });
export const isEmptyDoc = (d) => !d || d.visited.length === 0;

/** Validate + sanitize a travels document. Returns { ok, errors, doc }. Never throws. */
export function validate(raw) {
  const errors = [];
  const err = (m) => { if (errors.length < 12) errors.push(m); };
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Travels data must be an object.'], doc };
  if (!Number.isInteger(raw.version)) err('Travels: missing "version".');
  else if (raw.version > VERSION) err(`Travels: data is from a newer version of AI-TOR (schema ${raw.version}; this app supports up to ${VERSION}).`);
  else if (raw.version < 1) err('Travels: invalid "version".');
  doc.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : null;
  if (raw.visited != null && !Array.isArray(raw.visited)) err('Travels: "visited" must be a list.');
  else {
    const seen = new Set();
    (raw.visited || []).forEach((v, i) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return err(`Travels: visited #${i + 1} must be an object.`);
      if (typeof v.code !== 'string' || !BY_CODE.has(v.code)) return err(`Travels: visited #${i + 1} has an unknown country code.`);
      if (seen.has(v.code)) return err(`Travels: ${BY_CODE.get(v.code).name} is listed twice.`);
      if (v.years != null && (typeof v.years !== 'string' || v.years.length > LIMITS.years)) return err(`Travels: years for ${BY_CODE.get(v.code).name} must be text up to ${LIMITS.years} characters.`);
      if (v.note != null && (typeof v.note !== 'string' || v.note.length > LIMITS.note)) return err(`Travels: note for ${BY_CODE.get(v.code).name} must be text up to ${LIMITS.note} characters.`);
      seen.add(v.code);
      doc.visited.push({ code: v.code, years: (v.years || '').trim(), note: (v.note || '').trim() });
    });
  }
  return { ok: errors.length === 0, errors, doc };
}

export function summary(doc) {
  const n = doc.visited.length;
  return `${n} of ${TOTAL} countries visited`;
}

/** lowercase, accent-free text for searching */
export const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
