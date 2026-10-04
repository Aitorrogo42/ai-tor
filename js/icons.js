// AI-TOR line icons: thin white outline SVGs (1.25px stroke, round caps), same family as the section icons. Replaces every emoji / system glyph.
// Colour = currentColor, size = 1.1em by default (CSS .ico). Paths follow Feather (MIT) geometry on a 24 grid; stroke is non-scaling so it stays 1.25px at any size.
const NS = 'http://www.w3.org/2000/svg';
const P = {
  lock: ['M5 11h14v9H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  chevR: ['M9 5l7 7-7 7'],
  triangleDown: ['M3.5 6.5h17L12 19z'],   // v18: bold solid down-pointing triangle (a '>' play-triangle turned to face down); filled via opts.filled
  chevL: ['M15 5l-7 7 7 7'],
  download: ['M12 4v11', 'M7.5 11l4.5 4.5 4.5-4.5', 'M5 20h14'],
  upload: ['M12 15V4', 'M7.5 8L12 3.5 16.5 8', 'M5 20h14'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  refresh: ['M21 4v6h-6', 'M3 20v-6h6', 'M3.5 9.5A8.5 8.5 0 0 1 18.4 6.1L21 10', 'M3 14l2.6 3.9A8.5 8.5 0 0 0 20.5 14.5'],
  gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'],
  calendar: ['M4 5.5h16V20H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5'],
  comment: ['M4 5h16v11H9.5L4 20z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  external: ['M7 17L17 7', 'M8.5 7H17v8.5'],
};
// v18: section glyphs = the approved "Set A (Solid)" from the Graphic Designer (flat, straight-edged, solid, transparent). Inline SVG filled with currentColor (white),
// original 1024 geometry untouched; the viewBox is cropped to the mark (160 160 704 704) so it reads larger at 24-32px. Replaces icons/sections/*.png in the UI.
const SECTION_GLYPHS = {
  finances: 'M243.81 647.51 L571.57 319.75 L780.19 319.75 L780.19 223.75 L531.81 223.75 L243.81 511.75 Z M243.81 800.25 L576.54 467.51 L644.43 535.4 L780.19 399.63 L712.31 331.75 L644.43 399.63 L576.54 331.75 L243.81 664.49 Z',
  travels: 'M196 506 L506 506 L506 196 Z M828 506 L518 196 L518 506 Z M822 518 L202 518 L512 828 Z',
  todo: 'M832.32 341.05 L764.44 273.17 L422.54 615.07 L422.54 750.83 Z M259.56 464.09 L191.68 531.97 L410.54 750.83 L410.54 615.07 Z',
};
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
  svg.setAttribute('stroke-width', '1.25');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of P[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(p);
  }
  return svg;
}
