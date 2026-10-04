// AI-TOR line icons: thin white outline SVGs (1.25px stroke, round caps), same family as the section icons. Replaces every emoji / system glyph.
// Colour = currentColor, size = 1.1em by default (CSS .ico). Paths follow Feather (MIT) geometry on a 24 grid; stroke is non-scaling so it stays 1.25px at any size.
const NS = 'http://www.w3.org/2000/svg';
const P = {
  lock: ['M5 11h14v9H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  chevR: ['M9 5l7 7-7 7'],
  arrowDown: ['M12 5v13', 'M7 13.5l5 5 5-5'],
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
