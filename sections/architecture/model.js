// Architecture data model (v24 / 2.8.0): a personal reference library in five categories. Pure functions (no DOM, no storage).
// Document (aitor:sec:architecture):  { version:1, example:false, updatedAt, entries:[ Entry ] }
// Entry: { id, cat, name, fav, notes, link, createdAt, updatedAt, + category fields }
//   materials   : type, supplier
//   buildings   : architect, city, year          (Famous Buildings)
//   architects  : firm, city
//   designers   : firm, city
//   consultants : discipline (one of DISCIPLINES, required), firm, contact
import { uid } from '../../js/util.js';

export const SECTION_ID = 'architecture';
export const VERSION = 1;
export const LIMITS = { name: 120, field: 120, contact: 200, notes: 2000, link: 400, items: 2000 };

/** The consultant sub-disciplines (also the filter chips on the Consultants page). */
export const DISCIPLINES = ['MEP', 'Structural', 'Security', 'IT', 'AV', 'Fire & Life Safety', 'Civil & Traffic', 'Facade', 'Lighting', 'Acoustics', 'Sustainability'];

/** Category definitions. `slug` is the route segment, `cat` the stored key. `fields` = extra text fields in the add / edit form, in order. */
export const CATEGORIES = [
  { cat: 'materials', slug: 'materials', many: 'materials', title: 'Materials', one: 'material', blurb: 'Finishes, products and suppliers',
    empty: 'Keep the materials you want to remember: concrete mixes, timber, glass, stone, metals, finishes.',
    fields: [{ key: 'type', label: 'Type', ph: 'e.g. Timber' }, { key: 'supplier', label: 'Supplier', ph: 'Who sells it' }] },
  { cat: 'buildings', slug: 'famous-buildings', many: 'buildings', title: 'Famous Buildings', one: 'building', blurb: 'Buildings worth studying',
    empty: 'Save the buildings that inspire you, with who designed them, where they are and when they were built.',
    fields: [{ key: 'architect', label: 'Architect', ph: 'Who designed it' }, { key: 'city', label: 'City', ph: 'Where it is' }, { key: 'year', label: 'Year', ph: 'e.g. 1951', max: 12 }] },
  { cat: 'architects', slug: 'architects', many: 'architects', title: 'Architects', one: 'architect', blurb: 'People and practices',
    empty: 'Add architects and practices you admire or work with.',
    fields: [{ key: 'firm', label: 'Firm', ph: 'Practice or office' }, { key: 'city', label: 'City', ph: 'Where they are based' }] },
  { cat: 'designers', slug: 'designers', many: 'designers', title: 'Designers', one: 'designer', blurb: 'Interior, furniture and product',
    empty: 'Add interior, furniture, product and graphic designers you want to keep track of.',
    fields: [{ key: 'firm', label: 'Studio or firm', ph: 'Studio name' }, { key: 'city', label: 'City', ph: 'Where they are based' }] },
  { cat: 'consultants', slug: 'consultants', many: 'consultants', title: 'Consultants', one: 'consultant', blurb: 'MEP, structural, security, IT, AV and more',
    empty: 'Add engineers and specialist consultants, then filter them by discipline.',
    fields: [{ key: 'discipline', label: 'Discipline', select: DISCIPLINES, required: true }, { key: 'firm', label: 'Firm', ph: 'Company' }, { key: 'contact', label: 'Contact', ph: 'Name, email or phone', max: 200 }] },
];
export const catBySlug = (slug) => CATEGORIES.find((c) => c.slug === slug) || null;
export const catByKey = (cat) => CATEGORIES.find((c) => c.cat === cat) || null;

export const emptyDoc = () => ({ version: VERSION, example: false, updatedAt: null, entries: [] });
export const isEmptyDoc = (d) => !d || !d.entries.length;

const isStr = (v) => typeof v === 'string';

/** Only https:// links are kept (no javascript:, data:, http:). Returns the normalised URL or '' (invalid / empty). */
export function cleanLink(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t;
  if (t.length > LIMITS.link) return null;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return u.href;
  } catch { return null; }
}

/** Validate / sanitise ONE entry coming from the form. Returns { ok, errors, entry }. */
export function cleanEntry(raw, cat) {
  const def = catByKey(cat);
  const errors = [];
  const e = { id: isStr(raw.id) && raw.id ? raw.id.slice(0, 40) : uid(), cat, name: '', fav: raw.fav === true, notes: '', link: '', createdAt: isStr(raw.createdAt) ? raw.createdAt.slice(0, 40) : new Date().toISOString(), updatedAt: new Date().toISOString() };
  const name = isStr(raw.name) ? raw.name.trim() : '';
  if (!name) errors.push('Name is required.'); else if (name.length > LIMITS.name) errors.push(`Name is too long (max ${LIMITS.name}).`); else e.name = name;
  for (const f of def.fields) {
    const v = isStr(raw[f.key]) ? raw[f.key].trim() : '';
    const max = f.max || LIMITS.field;
    if (f.select) {
      if (!v) { if (f.required) errors.push(`${f.label} is required.`); e[f.key] = ''; }
      else if (!f.select.includes(v)) errors.push(`${f.label} must be one of the listed disciplines.`);
      else e[f.key] = v;
    } else if (v.length > max) errors.push(`${f.label} is too long (max ${max}).`);
    else e[f.key] = v;
  }
  const notes = isStr(raw.notes) ? raw.notes.trim() : '';
  if (notes.length > LIMITS.notes) errors.push(`Notes are too long (max ${LIMITS.notes}).`); else e.notes = notes;
  const link = cleanLink(raw.link);
  if (link === null) errors.push('The link must be a secure web address (https://…).'); else e.link = link;
  return { ok: errors.length === 0, errors, entry: e };
}

/** Validate + sanitise the whole stored / imported document. Returns { ok, errors, doc }. Never throws. Bad single entries are an error (so an import never silently drops data). */
export function validate(raw) {
  const errors = [];
  const err = (m) => { if (errors.length < 12) errors.push(m); };
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Architecture data must be an object.'], doc };
  if (!Number.isInteger(raw.version)) err('Architecture: missing "version".');
  else if (raw.version > VERSION) err(`Architecture: data is from a newer version of AI-TOR (schema ${raw.version}; this app supports up to ${VERSION}).`);
  else if (raw.version < 1) err('Architecture: invalid "version".');
  doc.example = raw.example === true;
  doc.updatedAt = isStr(raw.updatedAt) ? raw.updatedAt.slice(0, 40) : null;
  if (raw.entries != null && !Array.isArray(raw.entries)) err('Architecture: "entries" must be a list.');
  else if ((raw.entries || []).length > LIMITS.items) err(`Architecture: too many entries (max ${LIMITS.items}).`);
  else {
    const ids = new Set();
    (raw.entries || []).forEach((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return err(`Architecture entry #${i + 1} must be an object.`);
      if (!catByKey(r.cat)) return err(`Architecture entry #${i + 1}: unknown category.`);
      const c = cleanEntry(r, r.cat);
      if (!c.ok) return err(`Architecture entry #${i + 1} (${isStr(r.name) ? r.name.slice(0, 30) : '?'}): ${c.errors[0]}`);
      if (ids.has(c.entry.id)) c.entry.id = uid();
      ids.add(c.entry.id);
      c.entry.updatedAt = isStr(r.updatedAt) ? r.updatedAt.slice(0, 40) : c.entry.createdAt;   // keep the stored time (cleanEntry stamps "now" for form saves)
      doc.entries.push(c.entry);
    });
  }
  return { ok: errors.length === 0, errors, doc };
}

export const countBy = (doc, cat) => doc.entries.filter((e) => e.cat === cat).length;
export const favCount = (doc) => doc.entries.filter((e) => e.fav).length;

/** One-line description for the import dialog. */
export function summary(doc) {
  const n = doc.entries.length;
  return n ? `${n} ${n === 1 ? 'entry' : 'entries'} (${CATEGORIES.map((c) => countBy(doc, c.cat) ? `${countBy(doc, c.cat)} ${c.title.toLowerCase()}` : '').filter(Boolean).join(', ')})` : 'empty';
}

/** Sorted for display: favourites first, then A-Z. */
export const sortEntries = (list) => [...list].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matches(e, q) {
  const t = norm(q).trim();
  if (!t) return true;
  return norm([e.name, e.notes, e.type, e.supplier, e.architect, e.city, e.year, e.firm, e.contact, e.discipline].filter(Boolean).join(' ')).includes(t);
}

/** FAKE sample data for previewing (Load example data) and for tests. */
export function exampleDoc() {
  const now = new Date().toISOString();
  const mk = (cat, name, o = {}) => ({ id: uid(), cat, name, fav: false, notes: '', link: '', createdAt: now, updatedAt: now, ...o });
  return { version: VERSION, example: true, updatedAt: now, entries: [
    mk('materials', 'Board-formed concrete', { type: 'Concrete', supplier: 'Sample Ready-Mix Co.', notes: 'Rough timber-grain texture. Needs a sealer outdoors.', fav: true }),
    mk('materials', 'Charred cedar siding', { type: 'Timber', supplier: 'Sample Timber Supply', notes: 'Shou sugi ban finish.' }),
    mk('buildings', 'Farnsworth House', { architect: 'Mies van der Rohe', city: 'Plano, Illinois', year: '1951', notes: 'Glass box floating over a flood plain.', fav: true }),
    mk('buildings', 'Seagram Building', { architect: 'Mies van der Rohe', city: 'New York', year: '1958' }),
    mk('architects', 'Example Architect', { firm: 'Sample Studio Architects', city: 'Austin', notes: 'Fake entry for previewing.' }),
    mk('designers', 'Example Designer', { firm: 'Sample Interiors', city: 'Dallas' }),
    mk('consultants', 'Sample MEP Engineers', { discipline: 'MEP', firm: 'Sample MEP LLC', contact: 'Fake Person, 555-0100' }),
    mk('consultants', 'Sample Structural Group', { discipline: 'Structural', firm: 'Sample Structural Inc.' }),
    mk('consultants', 'Sample Acoustics Lab', { discipline: 'Acoustics', firm: 'Sample Acoustics' }),
  ] };
}
