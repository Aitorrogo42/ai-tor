// To-Do "Paste a list" parser (v20). Pure functions, no DOM, no storage: turns a pasted blob of bullets / numbered lines / messy notes
// into clean task titles. Used by sections/todo/index.js; unit-tested in ai-tor-test-paste.py (fake text only).
//
// Rules:
//  - line breaks (CRLF, CR, LF, U+2028/2029, vertical tab) separate tasks; tabs / NBSP / zero-width chars are whitespace; indentation is ignored,
//    so indented sub-bullets become their own tasks, in paste order
//  - leading list markers are stripped, repeatedly (so "- [ ] 1) foo" -> "foo"): - * • · – — ▪ ◦ ● ○ ■ □ ☐ ☑ ☒ ✓ ✔ ✗ ✘ ‣ ⁃ ▸ ▶ ► >, [ ] [x] ( ),
    // 1. 1) (1) a) (a) iv.
//  - a line that itself holds several bullet glyphs ("• a • b") is split on them
//  - no line break at all: split on bullet glyphs, then on " - " style dashes after a leading bullet, then on numbered "1. a 2. b",
//    then on ";", then on sentence boundaries (". " / "! " / "? " followed by a capital letter or digit)
//  - then per title: collapse whitespace, drop a trailing lone "." (or "," ";"), capitalise the first letter, keep the rest as typed,
//    truncate to MAX_TITLE characters; skip lines without a letter or digit ("---", "•"); drop duplicates (case-insensitive)
//  - at most MAX_TASKS per paste
export const MAX_TASKS = 100;
export const MAX_TITLE = 200;

const GLYPHS = '•·▪◦●○■□☐☑☒✓✔✗✘‣⁃▫▸▶►∙⦿';
const GLYPH_CLASS = `[${GLYPHS}]`;
const WS = /[\t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const ZW = /[\u200b-\u200d\u2060\ufeff]/g;
// one leading marker; applied in a loop
const MARKER = new RegExp(
  '^(?:' +
  `${GLYPH_CLASS}+` +                              // • · ▪ ☐ ...
  '|[–—]+' +                                       // en / em dash
  '|[-*>]+(?=\\s)' +                               // - * >  (ASCII ones need a space after)
  '|\\[\\s*[xX✓✔]?\\s*\\](?!\\()' +                 // [ ] [x]  (not a markdown link)
  '|\\(\\s*[xX✓✔]?\\s*\\)' +                        // ( ) (x)
  '|\\(\\d{1,3}\\)|\\(?[a-zA-Z]\\)(?=\\s)' +        // (1) (a) a)
  '|\\d{1,3}[.)](?=\\s)' +                          // 1.  2)
  '|[ivxIVX]{1,5}[.)](?=\\s)' +                     // iv.  (roman)
  ')\\s*');

export function normalize(text) {
  return String(text == null ? '' : text).replace(/\r\n?|[\u2028\u2029\u000b\u000c\u0085]/g, '\n').replace(ZW, '').replace(WS, ' ');
}

/** Strip every leading list marker from one line. */
export function stripMarkers(line) {
  let s = line.replace(/^\s+/, '');
  for (let i = 0; i < 8; i++) {
    const m = MARKER.exec(s);
    if (!m || !m[0]) break;
    const next = s.slice(m[0].length);
    // a bare number like "2024." or a lone letter "a)" with nothing after it is not a marker
    if (!next.trim()) break;
    s = next;
  }
  return s;
}

/** Split a block of text with no line breaks. */
function splitInline(s) {
  const t = s.trim();
  if (!t) return [];
  const glyphCount = (t.match(new RegExp(GLYPH_CLASS, 'g')) || []).length;
  if (glyphCount >= 1 && (glyphCount >= 2 || new RegExp(`^\\s*${GLYPH_CLASS}`).test(t))) return t.split(new RegExp(GLYPH_CLASS + '+'));
  // "- a - b - c" / "– a – b": dashes used as bullets with spaces around them, only when the text starts with one
  if (/^[-–—*]\s/.test(t) && /\s[-–—]\s/.test(t)) return t.split(/(?:^|\s)[-–—*]\s+/);
  // "1. a 2. b 3. c"
  if (/^\(?\d{1,3}[.)]\s/.test(t) && (t.match(/(?:^|\s)\(?\d{1,3}[.)]\s/g) || []).length >= 2) return t.split(/(?:^|\s)\(?\d{1,3}[.)]\s+/);
  if (t.includes(';')) return t.split(/;+/);
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return sentences.length > 1 ? sentences : [t];
}

/** Clean one title. Returns '' when nothing useful is left. */
export function cleanTitle(raw) {
  let s = stripMarkers(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s–—*•·:]+/, '').trim();
  // trailing lone ".", "," or ";" (an ellipsis "..." is kept)
  s = s.replace(/(?<!\.)\.$/, '').replace(/[,;]+$/, '').trim();
  if (!/[\p{L}\p{N}]/u.test(s)) return '';
  const chars = Array.from(s);
  if (chars.length > MAX_TITLE) s = chars.slice(0, MAX_TITLE).join('').trim();
  const [first, ...rest] = Array.from(s);
  return first.toLocaleUpperCase() + rest.join('');
}

/**
 * Parse pasted text. `existing` = titles of the OPEN tasks already in the target list (duplicates of those are skipped).
 * `room` = how many more tasks the list can hold (default MAX_TASKS).
 * Returns { tasks:[title], duplicates:n, existing:n, capped:n, truncated:n }.
 */
export function parsePaste(text, existing = [], room = MAX_TASKS) {
  const norm = normalize(text);
  const pieces = [];
  if (norm.includes('\n')) {
    for (const line of norm.split('\n')) {
      if (!line.trim()) continue;
      // a line like "• a • b" holds several items; a normal line is one item
      const body = stripMarkers(line);
      const glyphs = (body.match(new RegExp(GLYPH_CLASS, 'g')) || []).length;
      if (glyphs >= 1 && /\S\s+[•▪◦●‣⁃]\s*\S/.test(body)) pieces.push(...body.split(new RegExp(`\\s*[•▪◦●‣⁃]+\\s*`)));
      else pieces.push(line);
    }
  } else pieces.push(...splitInline(norm));

  const have = new Set((existing || []).map((x) => String(x).replace(/\s+/g, ' ').trim().toLowerCase()));
  const seen = new Set();
  const out = { tasks: [], duplicates: 0, existing: 0, capped: 0, truncated: 0 };
  const limit = Math.max(0, Math.min(MAX_TASKS, room));
  for (const p of pieces) {
    const before = stripMarkers(p).replace(/\s+/g, ' ').trim();
    const title = cleanTitle(p);
    if (!title) continue;
    if (Array.from(before).length > MAX_TITLE) out.truncated++;
    const key = title.toLowerCase();
    if (seen.has(key)) { out.duplicates++; continue; }
    seen.add(key);
    if (have.has(key)) { out.existing++; continue; }
    if (out.tasks.length >= limit) { out.capped++; continue; }
    out.tasks.push(title);
  }
  return out;
}
