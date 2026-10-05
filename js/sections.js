// SECTION REGISTRY: the single source of truth for everything that is a "section". One entry here automatically gives a section:
//   - a place on the home wheel (evenly spaced around 360 degrees; the tick count, snap points, keyboard order and the sun-angle mapping all follow the entry count),
//   - its glyph in the wheel centre and in its page header (inline SVG, currentColor),
//   - a frozen sunrise/sunset scene behind it (`sunAngle`, or by default derived from its wheel position),
//   - the shared-element view transition (nothing section-specific in nav.js), its own storage key and its place in export / import.
// To add a section (e.g. Health):
//   1. create sections/<id>/index.js exporting `render(container, ctx)` plus, for data portability, `validate(doc) -> {ok, errors, doc}` and `summary(doc, formatMoney)`; link its CSS in index.html and add the files to sw.js PRECACHE;
//   2. add ONE entry below: { id, title, subtitle, route, glyph, sunAngle?, loader }
//        glyph    = SVG path data on a 1024 grid, solid, straight edges (like the Set A glyphs below); it is cropped to the viewBox 160 160 704 704 and filled with currentColor
//        sunAngle = optional degrees (0 midnight, 90 sunrise, 180 noon, 270 sunset) shown behind the section; leave it out for an even spread around the day
//   3. bump sw.js VERSION. js/wheel.js, js/sunrise.js, js/bg.js and js/nav.js need no change.
// Storage is namespaced per section id automatically: ctx.store reads/writes "aitor:sec:<id>" only.
import { registerSectionGlyph } from './icons.js';
import { buildAnchors, anchorOf } from './sol.js';

export const sections = [
  {
    id: 'finances',
    title: 'Finances',
    subtitle: 'Net worth & accounts',
    route: '#/finances',
    sunAngle: 90,    // v25: the 5 sections are spread over the LIT part of the day (sunrise -> sunset, 45 degrees apart: 90 / 135 / 180 / 225 / 270), none of them is night
    glyph: 'M243.81 647.51 L571.57 319.75 L780.19 319.75 L780.19 223.75 L531.81 223.75 L243.81 511.75 Z M243.81 800.25 L576.54 467.51 L644.43 535.4 L780.19 399.63 L712.31 331.75 L644.43 399.63 L576.54 331.75 L243.81 664.49 Z',
    loader: () => import('../sections/finances/index.js'),
  },
  {
    id: 'travels',
    title: 'Travels',
    subtitle: 'Countries you have visited',
    route: '#/travels',
    sunAngle: 135,   // morning
    glyph: 'M196 506 L506 506 L506 196 Z M828 506 L518 196 L518 506 Z M822 518 L202 518 L512 828 Z',
    loader: () => import('../sections/travels/index.js'),
  },
  {
    id: 'todo',
    title: 'To-Do',
    subtitle: 'Your daily task list',
    route: '#/todo',
    sunAngle: 180,   // midday
    glyph: 'M832.32 341.05 L764.44 273.17 L422.54 615.07 L422.54 750.83 Z M259.56 464.09 L191.68 531.97 L410.54 750.83 L410.54 615.07 Z',
    loader: () => import('../sections/todo/index.js'),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    subtitle: 'Materials, buildings & consultants',
    route: '#/architecture',
    sunAngle: 225,   // afternoon
    // FINAL icon (Graphic Designer, icons-v2/set-a/architecture.svg, concept 3 'Perspective'): same 1024 geometry, viewBox is cropped to 160 160 704 704 by js/icons.js like the others.
    glyph: 'M424 832 L600 832 L600 293.61 L424 192 Z M412 832 L412 391.61 L236 290 L236 832 Z M788 832 L788 501.61 L612 400 L612 832 Z',
    loader: () => import('../sections/architecture/index.js'),
  },
];

/** Settings is not a data section (no storage, no export) but it is always the last stop on the wheel and has its own header, glyph and frozen scene. */
export const settingsEntry = {
  id: 'settings',
  title: 'Settings',
  route: '#/settings',
  sunAngle: 270,   // v25: sunset / dusk glow at the limb (the last section; the loop back to Finances passes through the night, which no section shows)
  glyph: 'M326.215 240.337 L422.215 240.337 L422.215 463.332 L326.215 463.332 Z M608.56 197.369 L668.415 272.425 L494.07 411.46 L434.215 336.404 Z M818.193 391.324 L796.831 484.917 L579.427 435.296 L600.789 341.703 Z M797.256 676.151 L710.763 717.804 L614.009 516.892 L700.502 475.24 Z M561.516 837.369 L475.023 795.716 L571.777 594.804 L658.27 636.457 Z M288.489 753.577 L267.127 659.984 L484.531 610.363 L505.893 703.956 Z M183.771 487.873 L243.626 412.817 L417.97 551.852 L358.115 626.908 Z',
};

for (const s of [...sections, settingsEntry]) registerSectionGlyph(s.id, s.glyph);

/** Add a section at run time (used by tests; the app itself just lists its sections above). `index` = position among the data sections (default: the end, before Settings). */
export function registerSection(entry, index = sections.length) {
  if (!entry || !/^[a-z][a-z0-9-]*$/.test(entry.id || '') || entry.id === 'home' || entry.id === 'settings') throw new Error('invalid section id');
  if (sections.some((s) => s.id === entry.id)) throw new Error('duplicate section id');
  const e = { title: entry.id, subtitle: '', route: '#/' + entry.id, loader: async () => ({ render() {} }), ...entry };
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, e);
  registerSectionGlyph(e.id, e.glyph);
  return e;
}
export function unregisterSection(id) { const i = sections.findIndex((s) => s.id === id); if (i >= 0) sections.splice(i, 1); }

/** Everything the home wheel shows, in order: the data sections, then Settings. */
export const wheelEntries = () => [...sections, settingsEntry];

/** home | settings | <section id> for a location hash. */
export function sectionIdOf(hash) {
  if (!hash || hash === '#/') return 'home';
  if (hash === '#/settings') return 'settings';
  const s = sections.find((x) => hash === x.route || hash.startsWith(x.route + '/'));
  return s ? s.id : 'home';
}

/** Sun anchors (K + 1 numbers, see js/sol.js) for the current wheel entries. */
export const sunAnchors = () => buildAnchors(wheelEntries().map((s) => s.sunAngle));
/** Sun angle (0..360) frozen behind a section, = where the wheel shows it. null for home / unknown ids. */
export function sectionSunAngle(id) {
  const i = wheelEntries().findIndex((s) => s.id === id);
  return i < 0 ? null : anchorOf(sunAnchors(), i);
}
