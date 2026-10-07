// v42: tiny EXIF reader for the Architecture photo button: GPS position + original date of a JPEG, read from the ORIGINAL file before it is
// re-encoded (re-encoding drops all metadata, so the copy that leaves the phone carries none; the position travels as plain numbers in the
// encrypted request instead). Pure function over an ArrayBuffer; returns { lat, lon, takenAt } with nulls for anything missing. Never throws.
export function readExif(buf) {
  const out = { lat: null, lon: null, takenAt: null };
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) return out;
      const marker = v.getUint8(off + 1), len = v.getUint16(off + 2);
      if (marker === 0xda || marker === 0xd9) return out;                  // start of scan: no EXIF before the image data
      if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) return parseTiff(v, off + 10, Math.min(v.byteLength, off + 2 + len), out);
      off += 2 + len;
    }
  } catch { /* damaged file: no metadata */ }
  return out;
}

function parseTiff(v, t0, end, out) {
  const le = v.getUint16(t0) === 0x4949;
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  const ok = (o, n) => o >= t0 && o + n <= end;
  if (u16(t0 + 2) !== 42) return out;
  const ifd = (o, want) => {                                              // returns { tag: entryOffset }
    const tags = {};
    if (!ok(o, 2)) return tags;
    const n = u16(o);
    for (let i = 0; i < n && i < 400; i++) { const e = o + 2 + i * 12; if (!ok(e, 12)) break; const tag = u16(e); if (!want || want.includes(tag)) tags[tag] = e; }
    return tags;
  };
  const rationals = (e, count) => {                                       // GPS degrees / minutes / seconds
    const p = t0 + u32(e + 8), r = [];
    for (let i = 0; i < count; i++) { if (!ok(p + i * 8, 8)) return null; const a = u32(p + i * 8), b = u32(p + i * 8 + 4); r.push(b ? a / b : 0); }
    return r;
  };
  const ascii = (e) => { const n = u32(e + 4); const p = n <= 4 ? e + 8 : t0 + u32(e + 8); if (!ok(p, n)) return ''; let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const ref = (e) => String.fromCharCode(v.getUint8(e + 8));
  const ifd0 = ifd(t0 + u32(t0 + 4), [0x8825, 0x8769]);
  if (ifd0[0x8769]) {
    const ex = ifd(t0 + u32(ifd0[0x8769] + 8), [0x9003]);
    if (ex[0x9003]) { const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(ex[0x9003])); if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`; }
  }
  if (ifd0[0x8825]) {
    const g = ifd(t0 + u32(ifd0[0x8825] + 8), [1, 2, 3, 4]);
    if (g[2] && g[4]) {
      const la = rationals(g[2], 3), lo = rationals(g[4], 3);
      if (la && lo) {
        let lat = la[0] + la[1] / 60 + la[2] / 3600, lon = lo[0] + lo[1] / 60 + lo[2] / 3600;
        if (g[1] && ref(g[1]) === 'S') lat = -lat;
        if (g[3] && ref(g[3]) === 'W') lon = -lon;
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) { out.lat = +lat.toFixed(6); out.lon = +lon.toFixed(6); }
      }
    }
  }
  return out;
}
