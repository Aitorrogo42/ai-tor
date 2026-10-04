// Export / import of all app data in one versioned JSON file.
// Format: { app:'ai-tor', schema:4, exportedAt, profile:{name,currency}, sections:{ <sectionId>: <section document> } }
import { sections } from './sections.js';
import * as storage from './storage.js';
import { CURRENCIES, formatMoney } from './util.js';

// schema 2 added Travels, schema 3 adds To-Do, schema 4 adds Travels destinations. Older files (finances only, finances+travels) still import; every section is optional.
// Sync settings (passphrase) are device settings and are never exported.
export const SCHEMA = 4;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function buildExport() {
  const core = storage.getCore();
  const out = { app: 'ai-tor', schema: SCHEMA, exportedAt: new Date().toISOString(), profile: { ...core.profile }, sections: {} };
  for (const s of sections) { const d = storage.section(s.id).get(); if (d) out.sections[s.id] = d; }
  return out;
}

/** Validate a parsed import file. Returns { ok, errors, warnings, result, lines }. Writes nothing. */
export async function validateImport(obj) {
  const errors = [], warnings = [], lines = [];
  const result = { profile: { name: '', currency: 'USD' }, sections: {} };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['This file is not an AI-TOR export (expected a JSON object).'], warnings, result, lines };
  if (obj.app !== 'ai-tor') errors.push('This file is not an AI-TOR export (missing "app": "ai-tor").');
  if (!Number.isInteger(obj.schema)) errors.push('Missing "schema" version.');
  else if (obj.schema > SCHEMA) errors.push(`This file is from a newer version of AI-TOR (schema ${obj.schema}). This app supports schema ${SCHEMA}.`);
  else if (obj.schema < 1) errors.push('Invalid "schema" version.');
  if (errors.length) return { ok: false, errors, warnings, result, lines };

  const p = obj.profile;
  if (p != null) {
    if (typeof p !== 'object' || Array.isArray(p)) errors.push('"profile" must be an object.');
    else {
      if (p.name != null && (typeof p.name !== 'string' || p.name.length > 60)) errors.push('Profile name must be text up to 60 characters.');
      else result.profile.name = (p.name || '').trim();
      if (p.currency != null && !CURRENCIES.includes(p.currency)) errors.push(`Unsupported currency "${String(p.currency).slice(0, 10)}".`);
      else result.profile.currency = p.currency || 'USD';
    }
  }
  const secs = obj.sections;
  if (secs != null && (typeof secs !== 'object' || Array.isArray(secs))) errors.push('"sections" must be an object.');
  else {
    const known = new Set(sections.map((s) => s.id));
    for (const id of Object.keys(secs || {})) if (!known.has(id)) warnings.push(`Ignored unknown section "${id.slice(0, 30)}".`);
    for (const s of sections) {
      if (!secs || secs[s.id] == null) continue;
      const mod = await s.loader();
      if (typeof mod.validate !== 'function') { result.sections[s.id] = secs[s.id]; lines.push(`${s.title}: imported as is`); continue; }   // v22: a new section without validate() still round-trips
      const v = mod.validate(secs[s.id]);
      if (!v.ok) errors.push(...v.errors);
      else { result.sections[s.id] = v.doc; lines.push(`${s.title}: ${typeof mod.summary === 'function' ? mod.summary(v.doc, (n) => formatMoney(n, result.profile.currency)) : 'imported'}`); }
    }
  }
  return { ok: errors.length === 0, errors, warnings, result, lines };
}

/** Replace everything on this device with a validated import result. */
export function applyImport(result) {
  storage.eraseDocuments(); // device settings (sync passphrase) are not part of exports and are kept
  storage.setCore({ version: storage.CORE_VERSION, profile: result.profile });
  for (const [id, doc] of Object.entries(result.sections)) storage.section(id).set(doc);
}

/** Replace a single section's data (used by "Load example data"). */
export function writeSection(id, doc) { storage.section(id).set(doc); }
