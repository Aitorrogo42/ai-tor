// Game section storage (v32): one tiny document in aitor:sec:game = { version, best, played, updatedAt }. Part of export / import (validate + summary).
export const VERSION = 1;
export const emptyDoc = () => ({ version: VERSION, best: 0, played: 0, updatedAt: null });
const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

export function validate(raw) {
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Game data must be an object.'], doc };
  const errors = [];
  if (!Number.isInteger(raw.version)) errors.push('Game: missing "version".');
  else if (raw.version > VERSION) errors.push(`Game: data is from a newer version of AI-TOR (schema ${raw.version}; this app supports up to ${VERSION}).`);
  if (raw.best != null && !int(raw.best, 1e6)) errors.push('Game: "best" must be a whole number from 0 to 1000000.');
  if (raw.played != null && !int(raw.played, 1e7)) errors.push('Game: "played" must be a whole number.');
  if (raw.updatedAt != null && (typeof raw.updatedAt !== 'string' || raw.updatedAt.length > 40)) errors.push('Game: "updatedAt" must be a date string.');
  if (errors.length) return { ok: false, errors, doc };
  doc.best = raw.best || 0; doc.played = raw.played || 0; doc.updatedAt = raw.updatedAt || null;
  return { ok: true, errors: [], doc };
}
export const summary = (doc) => (doc.played ? `best ${doc.best}, ${doc.played} ${doc.played === 1 ? 'game' : 'games'}` : 'no games yet');
