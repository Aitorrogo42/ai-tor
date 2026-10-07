// AI-TOR small UI icons (v19): sharp, straight-edged line glyphs, 2px non-scaling stroke, SQUARE caps + MITER joins (no rounded ends), so they sit next to the heavy solid Set A section glyphs.
// Colour = currentColor, size = 1.25em by default (CSS .ico). 24 grid; every path is made of straight segments only. Replaces every emoji / system glyph.
const NS = 'http://www.w3.org/2000/svg';
const P = {
  lock: ['M5 11h14v9H5z', 'M8 11V7h8v4'],
  chevR: ['M9 5l7 7-7 7'],
  triangleDown: ['M3.5 6.5h17L12 19z'],   // v18: bold solid down-pointing triangle (a '>' play-triangle turned to face down); filled via opts.filled. Stays as is in v19.
  chevL: ['M15 5l-7 7 7 7'],
  chevD: ['M5 9l7 7 7-7'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  upload: ['M12 16V5', 'M7 9l5-5 5 5', 'M5 20h14'],
  arrowR: ['M4 12h15', 'M13 6l6 6-6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  refresh: ['M5 11V8l3-3h8l3 3', 'M19 4v4h-4', 'M19 13v3l-3 3H8l-3-3', 'M5 20v-4h4'],   // two octagonal half-loops with square arrowheads (no curves)
  calendar: ['M4 5.5h16V20H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5'],
  comment: ['M4 5h16v11H9.5L4 20z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  external: ['M7 17L17 7', 'M8.5 7H17v8.5'],
  // v42 (Graphic Designer, Architecture photo log): same 24 grid, straight segments only, square caps + miter joins
  camera: ['M3 8h4.5l2-3h5l2 3H21v11H3z', 'M10 10h4l2 2v2l-2 2h-4l-2-2v-2z'],            // body with a raised viewfinder + octagonal lens
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 2.5-2.5L20 17', 'M15 8h2v2h-2z'],              // import from library: frame, mountains, square sun
  pin: ['M12 21l-6-8V7l3-3h6l3 3v6z', 'M10.5 8.5h3v3h-3z'],                                // location: faceted map pin
  clock: ['M7 3h10', 'M7 21h10', 'M8 3v4l4 5-4 5v4', 'M16 3v4l-4 5 4 5v4'],                // pending: hourglass
  material: ['M4 5h16v4.5H4z', 'M4 9.5h16V14H4z', 'M4 14h16v4.5H4z', 'M10 5v4.5', 'M15 9.5V14', 'M9 14v4.5'],   // MATERIAL chip: coursed stone / brick bond
  style: ['M5 20V11l7-7 7 7v9', 'M9 20v-6l3-3 3 3v6', 'M3 20h18'],                         // STYLE chip: pointed (Gothic) arch
  trash: ['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13', 'M10.5 11v5.5', 'M13.5 11v5.5'],
};
// v18/v19: section glyphs = the approved "Set A (Solid)" from the Graphic Designer (flat, straight-edged, solid, transparent). Inline SVG filled with currentColor (white),
// original 1024 geometry untouched; the viewBox is cropped to the mark (160 160 704 704) so it reads larger at 24-32px. Replaces icons/sections/*.png in the UI.
// The glyph paths live in the section registry (js/sections.js); a section registers its glyph with registerSectionGlyph(id, pathData) (1024 grid, straight edges, evenodd).
const SECTION_GLYPHS = {};
export function registerSectionGlyph(id, d) { if (id && typeof d === 'string' && d) SECTION_GLYPHS[id] = d; }
export const hasSectionGlyph = (id) => Object.prototype.hasOwnProperty.call(SECTION_GLYPHS, id);
/** sectionGlyph('finances', 40) -> <svg class="sec-ico"> (solid, currentColor). size omitted = sized by CSS. */
export function sectionGlyph(id, size) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '160 160 704 704');
  svg.setAttribute('class', 'sec-ico sec-glyph sec-glyph-' + id);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  if (size) { svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', SECTION_GLYPHS[id] || '');
  p.setAttribute('fill-rule', 'evenodd');
  svg.append(p);
  return svg;
}
/** icon('lock') -> <svg class="ico"> ; opts.filled fills the shape (used for a set favourite star). */
export function icon(name, cls = 'ico', opts = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls + ' ico-' + name);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', opts.filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'triangleDown' ? '1.25' : '2');   // the Mars-red wheel triangle keeps its v18 weight
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('stroke-linejoin', 'miter');
  svg.setAttribute('stroke-miterlimit', '10');
  for (const d of P[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(p);
  }
  return svg;
}
