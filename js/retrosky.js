// v45 RETRO theme background: the Earth theme's composition (a big curved Earth at the bottom, its limb crossing the screen at 60 % height, Mediterranean / Sahara view)
// drawn as PIXEL ART on a LOW-RES canvas (one canvas pixel = PX CSS px, 3..6) that CSS upscales with image-rendering: pixelated, so every edge is a hard square pixel.
// Same renderer interface as js/sunrise.js createSunrise (resize / draw(sol, tSec, still, frozen) / setTexture / dispose / body), so js/bg.js, the wheel-driven day cycle,
// the freeze inside sections, reduced motion and the "dynamic background" toggle all work unchanged.
//   Earth: assets/retro-earth.png is a tiny class map made from the same NASA Blue Marble textures as the Earth theme (tools/make_retro_earth.py):
//     R = surface class (deep ocean / ocean / coast / desert / dry land / green / forest / ice), G = cloud cover (4 levels), B = city lights.
//     Each class has a 4-step palette; the Sun's light picks the step per pixel through a 4x4 ordered (Bayer) dither, so continents, oceans and clouds are dithered, not smooth.
//     A pixel atmosphere: haze toward the limb, a stepped blue rim just outside it (orange where the sun grazes it), city lights on the night side.
//   Sky: warm retro grey, two palette colours mixed with the same dither, a dithered Milky Way band, twinkling stars (v46: no comet streaks).
//   Day cycle: NO smooth gradients. The sun angle (wheel) picks one of 5 sky palette steps and the Earth's lighting steps with it (sunrise: the sun sits on the limb, a dithered
//   orange-red glow; day; sunset: cyan-blue dusk glow; night: city lights). No WebGL: plain Canvas2D, ~15k shaded pixels per frame (about 1 ms).
import { solarState } from './sunrise.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hex = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const pack = (c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];          // little-endian ABGR
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
const DEG = Math.PI / 180;

// sky steps: [top, bottom] (warm-neutral retro greys; the day steps are the Starbase #2b2a2a .. #3a3837 range)
const SKY = [[hex('#141313'), hex('#1d1c1c')], [hex('#1b1a1a'), hex('#262524')], [hex('#232222'), hex('#302e2d')], [hex('#2b2a2a'), hex('#3a3837')], [hex('#302f2e'), hex('#403e3c')]];
const MW = [hex('#3f3d3c'), hex('#575452'), hex('#76736f')];
const C_DAWN = hex('#6f2e12'), C_DUSK = hex('#17566f');
const WHITE = hex('#efece6'), STAR_DIM = hex('#8a8785');
// Earth classes x 4 light steps [night, dim, mid, bright]: ocean = the cyan-blue accent family, land = warm tan / muted teal-green, ice = white
const CLS = [
  ['#0c1b27', '#0f2c40', '#16547a', '#1f7db0'],   // 0 deep ocean
  ['#0d1d2a', '#123a55', '#1b6a96', '#2b95cc'],   // 1 ocean shelf
  ['#0e1f2a', '#18506f', '#2780a8', '#4cb6e0'],   // 2 coast / shallow
  ['#27221a', '#5a4930', '#9b7d4f', '#d4b074'],   // 3 desert
  ['#201b15', '#4a3a28', '#7d5f3c', '#b08550'],   // 4 dry land
  ['#10171a', '#27463f', '#43766a', '#6aa592'],   // 5 green
  ['#0d1315', '#1c3530', '#2e5249', '#46766a'],   // 6 forest
  ['#191c1f', '#6b757c', '#aab4ba', '#e8eef1'],   // 7 ice
].map((r) => r.map(hex));
const CLOUD = ['#22262a', '#7a8187', '#b9c0c5', '#eef1f2'].map(hex);
const HAZE_BLUE = ['#0d1a24', '#18435f', '#2a7aae', '#5db5e6'].map(hex), HAZE_WARM = ['#1e0f07', '#5e280e', '#b04a19', '#ee7a26'].map(hex);
const RIM = ['#143f60', '#235f8f', '#3a8fcc', '#7ccdf5', '#d6f0ff'].map(hex), RIM_WARM = ['#4a2008', '#8a3a12', '#cf6420', '#f59a3c', '#ffe0a8'].map(hex);
const LIGHTS = [hex('#ff8a2a'), hex('#ffc060')];
const TILT = 0.80, ROLL = -0.30, EARTH_DLAT = 16 * DEG;   // same camera as js/sunrise.js

function hash(ix, iy) { let h = (ix * 374761393 + iy * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M = (() => {   // M = Rx(TILT) * Rz(ROLL)
  const ct = Math.cos(TILT), st = Math.sin(TILT), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]];
  return Rx.map((row) => [0, 1, 2].map((j) => row[0] * Rz[0][j] + row[1] * Rz[1][j] + row[2] * Rz[2][j]));
})();

export function createRetro(canvas, { onLost, onRestored } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('no 2d context');
  canvas.classList.add('retro-canvas');
  let W = 1, H = 1, PX = 4, cw = 1, ch = 1, img = null, px = null, lost = false;
  let map = null, MW_ = 0, MH_ = 0;                                 // class map: Uint8Array RGB, MW_ x MH_ (equirectangular, lon -180..180 left to right, lat 90..-90 top to bottom)
  const stars = []; for (let i = 0; i < 120; i++) stars.push({ x: hash(i, 7), y: hash(i, 11) * 0.62, ph: hash(i, 13) * 50, sp: 0.15 + hash(i, 17) * 0.5, br: hash(i, 19) });

  function setTexture(image) {                                       // the class map (assets/retro-earth.png), read once into a byte array
    try {
      const c = document.createElement('canvas'); c.width = image.naturalWidth || image.width; c.height = image.naturalHeight || image.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(image, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; MW_ = c.width; MH_ = c.height;
      map = new Uint8Array(MW_ * MH_ * 3); for (let i = 0, j = 0; i < d.length; i += 4) { map[j++] = d[i]; map[j++] = d[i + 1]; map[j++] = d[i + 2]; }
    } catch { map = null; }
  }
  function resize(w, h) {
    W = Math.max(1, Math.round(w)); H = Math.max(1, Math.round(h));
    PX = Math.max(3, Math.min(6, Math.round(W / 100)));                      // phone 390 px -> 4 px blocks (98 x 211 canvas px); tablets / desktop get chunkier blocks
    cw = Math.ceil(W / PX); ch = Math.ceil(H / PX);
    canvas.width = cw; canvas.height = ch;
    img = ctx.createImageData(cw, ch); px = new Uint32Array(img.data.buffer);
  }
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < cw && y < ch) px[y * cw + x] = c; };
  function line(x0, y0, x1, y1, c, dash) {                                    // Bresenham: a thin stepped line, optional dash pattern
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, n = 0;
    for (let i = 0; i < 4000; i++) {
      if (!dash || n % dash < dash - 1) put(x0, y0, c);
      n++; if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  const sample = (u, v) => {                                                  // nearest class-map texel; u wraps, v clamps
    const x = Math.floor((u - Math.floor(u)) * MW_) % MW_, y = Math.min(MH_ - 1, Math.max(0, Math.floor(v * MH_))), i = (y * MW_ + x) * 3; return i;
  };

  function draw(sol, t, still, frozen) {
    if (!img) resize(window.innerWidth, Math.max(window.innerHeight, (document.getElementById('bg') || {}).clientHeight || 0));
    const R = 1.5 * Math.min(W, 0.7 * H), cxp = W / 2, cyp = 0.60 * H + R;      // exactly the Earth theme's planet: apex at 60 % of the height
    const st = solarState(sol, W, H, cxp, cyp, R);
    const e = st.sinE, step = e < -0.55 ? 0 : e < -0.22 ? 1 : e < 0.08 ? 2 : e < 0.45 ? 3 : 4;
    const [top, bot] = SKY[step];
    const tw = Math.exp(-Math.pow((e - 0.03) / 0.2, 2)), haze = Math.round(tw * 4) / 4 * 0.5;
    const dawn = Math.sin(sol) > 0, hzC = dawn ? C_DAWN : C_DUSK;
    const dayF = (() => { const x = Math.min(1, Math.max(0, (e + 0.12) / 0.57)); return x * x * (3 - 2 * x); })();
    const drift = still ? 0 : Math.floor(t * 0.7), night = st.night;
    const limbLow = (cyp - R) / PX, hzx = (st.sunX / W) * cw;                   // limb apex in canvas px
    // ---- sky: vertical Bayer-dithered 2-colour mix + twilight glow at the sun side of the limb + faint blue air band + Milky Way
    const bandY = (x) => ch * 0.36 - (x - cw / 2) * 0.16, half = ch * 0.055;
    for (let y = 0; y < ch; y++) {
      const fy = y / (ch - 1), by = (y & 3) << 2;
      for (let x = 0; x < cw; x++) {
        const bay = BAYER[by | (x & 3)];
        let c = bay < fy ? bot : top;
        const dxh = (x - hzx) / (cw * 0.75), dyh = (y - limbLow) / (ch * 0.30), dh = Math.sqrt(dxh * dxh + dyh * dyh);
        if (haze > 0 && dh < 1 && bay < haze * (1 - dh) * (1 - dh) * 1.7) c = hzC;
        const dy = (y - bandY(x)) / half;
        if (dy > -2.6 && dy < 2.6) {
          const prof = Math.exp(-dy * dy * 0.55), nx = x + drift;
          const n = 0.55 * vnoise(nx / 5, y / 5) + 0.3 * vnoise(nx / 2.4 + 9, y / 2.4 + 4) + 0.15 * vnoise(nx / 12 + 3, y / 9);
          const lane = Math.exp(-Math.pow((dy + 0.1 + 0.25 * Math.sin(x * 0.11)) / 0.16, 2));
          const d = prof * (n - 0.08) * (1 - 0.85 * lane) * (0.62 + 0.38 * night) * (1 - 0.5 * tw);
          const lv = Math.floor(d * 2.6 + bay);
          if (lv > 0) c = MW[Math.min(2, lv - 1)];
        }
        px[y * cw + x] = pack(c);
      }
    }
    // ---- stars (single pixels, stepped twinkle, fewer by day). v46: the diagonal comet streaks are gone
    const nvis = Math.round(stars.length * (0.25 + 0.75 * night));
    for (let i = 0; i < nvis; i++) { const s = stars[i]; if (still || (Math.floor(t * s.sp + s.ph) & 3) !== 0) put(s.x * cw, s.y * ch, pack(s.br > 0.9 ? WHITE : s.br > 0.5 ? STAR_DIM : mixc(bot, STAR_DIM, 0.55))); }
    // ---- the sun, only while it is near the limb (sunrise / sunset): a small pixel disc, dithered halo, thin horizontal streak. The planet is drawn over it.
    const sxp = st.sunX / PX, syp = st.sunY / PX;
    if (e > -0.14 && e < 0.62 && syp > -6 && syp < ch) {
      const k = Math.min(1, (0.62 - e) / 0.3), r0 = 2.4;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const d = Math.hypot(dx, dy), X = Math.round(sxp) + dx, Y = Math.round(syp) + dy; if (d > 7) continue;
        const bay = BAYER[((Y & 3) << 2) | (X & 3)];
        if (d <= r0) put(X, Y, pack(WHITE)); else if (bay < k * 0.6 * (1 - (d - r0) / (7 - r0)) ** 2) put(X, Y, pack(mixc(bot, dawn ? hex('#ffb35c') : hex('#ffd9a0'), 0.7)));
      }
      for (let i = 9; i < 9 + 14 * k; i++) { const c = pack(mixc(bot, WHITE, 0.55 * (1 - (i - 9) / 16))); put(sxp + i, syp, c); put(sxp - i, syp, c); }
    }
    // ---- Earth
    const ct = Math.cos(EARTH_DLAT), sd = Math.sin(EARTH_DLAT), sunDx = st.sunX - cxp, sunDy = st.sunY - cyp, sunLen = Math.hypot(sunDx, sunDy) || 1;
    const prox = Math.exp(-Math.pow(e / 0.30, 2)), cOff = still ? 0 : 0.0167 * Math.sin(t * 0.0062832), lonDrift = still ? 0 : 13 * Math.sin(t * 0.021);
    const y0 = Math.max(0, Math.floor((cyp - R) / PX - 6));
    for (let y = y0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const X = (x + 0.5) * PX, Y = (y + 0.5) * PX, qx = (X - cxp) / R, qy = (Y - cyp) / R, r2 = qx * qx + qy * qy, r = Math.sqrt(r2), bay = BAYER[((y & 3) << 2) | (x & 3)];
        const hr = (r - 1) * R / PX;                                           // height above the limb in canvas px
        const mx = r > 0 ? qx / r : 0, my = r > 0 ? qy / r : -1;
        const fwd = Math.max(0, (mx * sunDx + my * sunDy) / sunLen), nlLit = (mx * st.s[0] - my * (-st.s[1])) ;  // limb direction vs the sun
        const litA = sstep(-0.35, 0.5, mx * st.s[0] + (-my) * st.s[1]);
        if (hr > 0) {                                                          // ---- atmosphere above the limb
          if (hr < 26) {
            const prof = Math.exp(-hr / 1.7), warm = Math.pow(fwd, 40) * prox;
            const amt = (0.10 + 0.30 * tw + 0.62 * litA * litA * dayF + 0.5 * warm) * prof + 0.16 * Math.exp(-hr / 4.2) * (0.3 + dayF) * (0.4 + 0.6 * litA);
            const lv = Math.floor(amt * 4.4 + bay * 0.9 - 0.2);
            if (lv > 0 && hr < 7) px[y * cw + x] = pack((warm > 0.35 ? RIM_WARM : RIM)[Math.min(4, lv - 1 + (hr < 1.2 ? 1 : 0))]);
            else {                                                              // faint dithered blue air above the rim (day side / twilight), fading into the grey sky
              const pa = (0.40 * dayF + 0.30 * tw * (1 - dayF)) * (0.35 + 0.65 * litA) * Math.exp(-hr / 9);
              if (bay < pa) px[y * cw + x] = pack(HAZE_BLUE[pa > 0.22 ? 2 : 1]);
            }
          }
          continue;
        }
        // ---- surface
        const nz = Math.sqrt(Math.max(0, 1 - r2)), nzx = Math.max(nz, 0.06), n0 = qx, n1 = -qy, n2 = nz;
        let a0 = M[0][0] * n0 + M[0][1] * n1 + M[0][2] * n2, a1 = M[1][0] * n0 + M[1][1] * n1 + M[1][2] * n2, a2 = M[2][0] * n0 + M[2][1] * n1 + M[2][2] * n2;
        const b1 = a1 * ct + a2 * sd, b2 = a2 * ct - a1 * sd; a1 = b1; a2 = b2;
        const lat = Math.asin(Math.max(-1, Math.min(1, a1))), lonD = Math.atan2(a0, a2) / DEG + lonDrift;
        const u = 0.5 + lonD / 360, v = 0.5 - (lat / DEG) / 180;
        let cls = 0, cloud = 0, lights = 0;
        if (map) { const i = sample(u, v); cls = map[i]; cloud = map[sample(u + cOff, v) + 1] / 255; lights = map[i + 2] / 255; }
        const ndl = n0 * st.s[0] + n1 * st.s[1] + n2 * st.s[2];
        const c2 = Math.min(1, Math.max(0, (ndl + 0.06) / 0.28)); let L = c2 * c2 * (3 - 2 * c2); L = L + (Math.max(ndl, 0) - L) * 0.5; L = Math.min(1, L * 1.3 + 0.5 * tw * (1 - dayF) * sstep(-0.55, 0.25, ndl));   // twilight: the sun-facing side of the globe keeps some light (grazing sun)
        let col;
        const lvl = Math.min(3, Math.max(0, Math.floor(L * 3.0 + bay * 0.98 + 0.02)));
        if (cloud > bay * 1.05 + 0.05 && cloud > 0.2) col = CLOUD[Math.max(lvl, L > 0.04 ? 1 : 0)];
        else col = CLS[cls][lvl];
        // ocean glint (sun reflected): a few bright dithered pixels on lit water
        if (cls <= 2 && cloud < 0.2 && L > 0.5) { const hv = Math.max(0, n0 * (st.s[0] * 0.5) + n1 * (st.s[1] * 0.5) + n2 * ((st.s[2] + 1) * 0.5)); if (Math.pow(hv, 40) > bay * 1.2) col = CLS[2][3]; }
        // haze toward the limb (blue by day, orange at the terminator)
        const fog = Math.min(0.85, Math.max(0, (1 - Math.exp(-0.05 / (nzx * nzx))) - 0.08) * (0.25 + 0.75 * (litA * (1 - nz) + sstep(-0.3, 0.4, ndl) * nz)));
        if (fog > bay) {
          const hl = Math.min(3, Math.floor((0.12 + 0.55 * litA * (0.3 + 0.7 * dayF) + 0.3 * dayF) * 3.6));
          const warm = Math.pow(fwd, 60) * (1 - nz) * prox * (1 - sstep(0, 0.35, ndl)) > 0.2;
          col = (warm ? HAZE_WARM : HAZE_BLUE)[Math.max(0, hl)];
        }
        // city lights, night side only
        const cityK = 1 - sstep(-0.14, 0.06, ndl);
        if (cityK > 0.05 && lights > 0.12 && cloud < 0.45 && lights * cityK > bay * 0.55 + 0.12) col = LIGHTS[lights > 0.6 ? 1 : 0];
        px[y * cw + x] = pack(col);
      }
    }
    ctx.putImageData(img, 0, 0);
    return st;
  }
  const noop = () => {};
  return { body: 'retro', setTexture, setCityTexture: noop, setBaseTexture: noop, setAuxTexture: noop, resize, draw, layout: noop,
    dispose() { try { canvas.width = canvas.height = 1; } catch { /* ignore */ } }, hasTexture: () => !!map, isLost: () => lost, pixelSize: () => PX, size: () => [cw, ch] };
}
