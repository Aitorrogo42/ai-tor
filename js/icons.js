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
};
// v18/v19: section glyphs = the approved "Set A (Solid)" from the Graphic Designer (flat, straight-edged, solid, transparent). Inline SVG filled with currentColor (white),
// original 1024 geometry untouched; the viewBox is cropped to the mark (160 160 704 704) so it reads larger at 24-32px. Replaces icons/sections/*.png in the UI.
const SECTION_GLYPHS = {
  finances: 'M243.81 647.51 L571.57 319.75 L780.19 319.75 L780.19 223.75 L531.81 223.75 L243.81 511.75 Z M243.81 800.25 L576.54 467.51 L644.43 535.4 L780.19 399.63 L712.31 331.75 L644.43 399.63 L576.54 331.75 L243.81 664.49 Z',
  travels: 'M196 506 L506 506 L506 196 Z M828 506 L518 196 L518 506 Z M822 518 L202 518 L512 828 Z',
  settings: 'M326.215 240.337 L422.215 240.337 L422.215 463.332 L326.215 463.332 Z M608.56 197.369 L668.415 272.425 L494.07 411.46 L434.215 336.404 Z M818.193 391.324 L796.831 484.917 L579.427 435.296 L600.789 341.703 Z M797.256 676.151 L710.763 717.804 L614.009 516.892 L700.502 475.24 Z M561.516 837.369 L475.023 795.716 L571.777 594.804 L658.27 636.457 Z M288.489 753.577 L267.127 659.984 L484.531 610.363 L505.893 703.956 Z M183.771 487.873 L243.626 412.817 L417.97 551.852 L358.115 626.908 Z',   // v19: Aitor's 7-bar pinwheel (icons-v2/set-a/settings.svg), same 160 160 704 704 crop; its rotation centre is 512,512
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
