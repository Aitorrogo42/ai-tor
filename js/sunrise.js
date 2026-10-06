// AI-TOR "Dynamic sunrise" renderer (v21). One full-screen quad + one fragment shader (WebGL1, no libraries, same-origin only):
//   a lit Mars sphere textured from assets/mars-map.webp (NASA/JPL/USGS Viking MDIM 2.1, public domain, see README) with Lambert light + a
//   soft dusty terminator, relief shading from the texture + procedural craters, limb haze, a thin scattering rim, a sun with bloom and an
//   anamorphic streak, twilight sky bands and a star field that fades as the sun rises.
// The sun is driven by ONE number, the "sol angle" (radians, 0 = midnight, PI/2 = sunrise at the limb, PI = noon, 3PI/2 = sunset), which
// bg.js derives linearly from the wheel angle (one full wheel turn = one sol). Everything here is a pure function of (sol, time).
const DEG = Math.PI / 180;
export const TEX_LON_CENTER = -65, TEX_SPAN = 120;     // the map patch covers lon -125..-5 and lat -60..60 (equirectangular, 2048x2048)
const TILT = 0.80, ROLL = -0.30;                       // planet orientation: pole tilted towards the viewer and rolled a little
// v27: ONE small city on the night side (v31: plus two variants of it, see CITIES). Fixed planet coordinates (degrees, same lon/lat frame as the surface texture lookup below, so it turns with the planet drift):
// chosen so that at the rest layout (apex .60 H, R = 1.5 min(W, .7 H)) it sits at about (.53 W, .72 H): inside the visible disc, below the wheel, above the greeting, and
// the +-13 degree drift keeps it on screen. The shader draws it only where the surface is on the night side (see cityLights).
export const CITY = { lat: 7.9, lon: 15.2 };
// v31: the v27 city (back to its v27 size and look after the v30 ring-road cluster was dropped) plus TWO more variants of it at the same scale, placed asymmetrically on the night side:
// offsets in degrees east / north of CITY in its local plane, a rotation (radians) and a size factor, so they are not clones. Exported for the tests and tools/make_city_svg.py.
export const CITIES = [
  { dx: 0, dy: 0, rot: 0, s: 1, seed: 0 },             // the v27 city
  { dx: 12.5, dy: 2.0, rot: 1.9, s: 0.86, seed: 17 },   // east, a bit north, farther away
  { dx: -7.5, dy: -7.0, rot: -0.8, s: 0.78, seed: 41 }, // south-west, closer
];

/** Where the city is on screen (CSS px) for a viewport, plus its facing (nz > 0 = on the visible side). drift = the shader's planet drift in degrees (0 when still).
 *  v31: off = an offset {dx, dy} in degrees east / north of CITY (e.g. one of CITIES) to locate the other cities. Pure + testable. */
export function cityScreenPos(W, H, drift = 0, off = null) {
  const R = 1.5 * Math.min(W, 0.7 * H), cx = W / 2, cy = 0.6 * H + R;
  const dx = off ? off.dx : 0, dy = off ? off.dy : 0;
  const la = (CITY.lat + dy) * DEG, lo = (CITY.lon + dx / Math.cos(CITY.lat * DEG) - drift) * DEG;
  const a = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  const ct = Math.cos(TILT), st = Math.sin(TILT), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]];
  const M = Rx.map((row) => [0, 1, 2].map((j) => row[0] * Rz[0][j] + row[1] * Rz[1][j] + row[2] * Rz[2][j]));
  const n = [0, 1, 2].map((j) => M[0][j] * a[0] + M[1][j] * a[1] + M[2][j] * a[2]);   // M^T a
  return { x: cx + n[0] * R, y: cy - n[1] * R, nz: n[2], R };
}

/** Sun / light state for a sol angle (radians). W,H = viewport in CSS px; cx,cy,R = planet centre + radius (CSS px). Pure + testable. */
export function solarState(sol, W, H, cx, cy, R) {
  const E = -(Math.PI / 2) * Math.cos(sol);                  // sun elevation above the local horizon (rad): -90deg at midnight, 0 at sunrise/sunset, +90deg at noon
  const sinE = Math.sin(E), cosE = Math.cos(E);
  const sunX = W * (0.5 - 0.20 * Math.sin(sol));            // rises on the left, sets on the right
  const dx = Math.min(Math.abs(sunX - cx), R - 1);
  const limbY = cy - Math.sqrt(R * R - dx * dx);
  const sunY = limbY - 0.9 * H * sinE;                       // on the limb at sunrise/sunset, above the frame when high, behind the planet at night
  let s = [-0.30 * Math.sin(sol) * cosE, sinE, -cosE * 0.96 + 0.55 * Math.max(sinE, 0) ** 2];
  const l = Math.hypot(s[0], s[1], s[2]); s = s.map((v) => v / l);
  const day = Math.min(1, Math.max(0, (sinE + 0.12) / 0.57));  // 0 night .. 1 day
  const night = 1 - Math.min(1, Math.max(0, (sinE + 0.25) / 0.33)); // star visibility
  const ct = Math.min(1, Math.max(0, (sinE + 0.30) / 0.28)), city = 1 - ct * ct * (3 - 2 * ct);   // v27: city-lights strength (= the shader's 1 - smoothstep(-.30, -.02, sinE)): 0 by day and at sunset, 1 deep in the night
  return { sol, E: E / DEG, sinE, sunX, sunY, s, day, night, city, limbY };
}

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform vec2 uC; uniform float uR; uniform float uPx;
uniform vec3 uS; uniform float uSinE; uniform float uSol; uniform vec2 uSun;
uniform float uTime; uniform float uDrift; uniform float uStill;
uniform mat3 uM; uniform vec3 uAxis;
uniform sampler2D uTex; uniform float uHasTex;
const float PI = 3.14159265;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(7.1, 3.7); a *= .5; } return s; }
float crater(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = h21(i), b = h21(i + 3.7), c = h21(i + 9.1);
  if (c < .42) return 0.;
  float rad = .12 + .36 * c * c;
  vec2 ctr = .5 + (vec2(a, b) * 2. - 1.) * (.5 - rad) ;
  float d = length(f - ctr) / rad;
  float bowl = d < 1. ? -(1. - d * d) : 0.;
  float rim = exp(-pow((d - 1.05) * 4.5, 2.));
  return (bowl * .55 + rim * .42) * (.35 + rad);
}
float terrain(vec2 s2){ return crater(s2 * .62) * 1.0 + crater(s2 * 1.9 + 11.) * .55 + (fbm(s2 * 5.) - .5) * .09; }
float lum(vec3 c){ return dot(c, vec3(.3, .55, .15)); }

// v27: night lights of one small city: a bright small core with a soft amber falloff, scattered dots thinning out with distance, a few thin streets (dotted lamps) radiating
// from it and a partial ring road. Analytic, no texture. g = (lonD, latD) in degrees; pd = degrees per canvas pixel at this point (keeps the lines >= ~1 px).
const float CITY_LON = ${CITY.lon.toFixed(2)}, CITY_LAT = ${CITY.lat.toFixed(2)};
vec3 oneCity(vec2 d, float pd, float sd){
  float r = length(d);
  if (r > 7.) return vec3(0.);
  float core = exp(-r * r / .08);                                       // sigma .2 deg
  float halo = .26 * exp(-r / 1.0) + .40 * exp(-r * r / .6);
  float w = max(.03, pd * .5);
  // suburban dots
  vec2 cell = floor(d / .30), f = fract(d / .30);
  float hp = h21(cell + 3.3 + sd), dots = 0.;
  if (hp < .62 * exp(-r / 1.7)) { vec2 dp = vec2(.2 + .6 * h21(cell + 8.1 + sd), .2 + .6 * h21(cell + 1.9 + sd)); float dr = max(.075, pd * .8); dots = exp(-pow(length((f - dp) * .30) / dr, 2.)) * (.45 + .55 * h21(cell + 5.5 + sd)); }
  // streets radiating from the core, slightly bent, with a dotted lamp pattern
  float roads = 0.;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float ang = fk * .93 + .5 * h21(vec2(fk, 2.7 + sd));
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(d, dir), len = 1.9 + 3.6 * h21(vec2(fk, 7.1 + sd));
    float perp = d.x * dir.y - d.y * dir.x + .09 * sin(along * 2.3 + fk * 1.7) * smoothstep(0., 1.2, along);
    float line = exp(-perp * perp / (2. * w * w)) * smoothstep(len, len * .30, along) * smoothstep(.12, .4, along);
    float lamp = .35 + .65 * step(.40, fract(along * 7. + fk * .37));
    roads += line * lamp;
  }
  // partial ring road
  float ang2 = atan(d.y, d.x), ring = exp(-pow((r - 1.15) / w, 2.) * .5) * step(.42, vn(vec2(ang2 * 1.7 + 4. + sd, 1.7))) * .6;
  vec3 amber = vec3(1., .55, .17);
  return amber * (halo * .65 + dots * .75 + (roads + ring) * .45) + vec3(1., .80, .48) * core * 1.5;
}

// v31: three variants of the v27 city (CITIES in JS): each one is the same city drawn in its own rotated / scaled local frame with its own hash seed
${CITIES.map((c, i) => `const vec4 CITY${i} = vec4(${c.dx.toFixed(2)}, ${c.dy.toFixed(2)}, ${c.rot.toFixed(3)}, ${c.s.toFixed(3)});`).join('\n')}
vec3 cityAt(vec2 d, vec4 c, float pd, float sd){
  vec2 q = d - c.xy;
  if (dot(q, q) > 49. * c.w * c.w) return vec3(0.);
  float cr = cos(c.z), sr = sin(c.z);
  q = vec2(cr * q.x + sr * q.y, -sr * q.x + cr * q.y) / c.w;
  return oneCity(q, pd / c.w, sd);
}
vec3 cityLights(vec2 g, float pd){
  vec2 d = (g - vec2(CITY_LON, CITY_LAT)) * vec2(.9906, 1.);
  if (d.x < -14. || d.x > 20. || d.y < -14. || d.y > 9.) return vec3(0.);
  return cityAt(d, CITY0, pd, ${CITIES[0].seed.toFixed(1)}) + cityAt(d, CITY1, pd, ${CITIES[1].seed.toFixed(1)}) + cityAt(d, CITY2, pd, ${CITIES[2].seed.toFixed(1)});
}

vec3 tonemap(vec3 x){ x *= .85; return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (p - uC) / uR; float r2 = dot(q, q), r = sqrt(r2);
  float hr = (r - 1.) * uR;                                   // signed height above the limb (canvas px)
  float H = uRes.y;
  float sinE = uSinE;
  float dayF = clamp((sinE + .12) / .57, 0., 1.); dayF = dayF * dayF * (3. - 2. * dayF);
  float tw = exp(-pow((sinE - .03) / .2, 2.));                // twilight strength: peaks when the sun is at the horizon
  vec2 m = r > 0. ? q / r : vec2(0., -1.);                    // outward direction on screen (y down)
  vec3 nl = vec3(m.x, -m.y, 0.);                              // surface normal of the limb point in this direction
  vec2 sunD = uSun - uC; float sunDist = length(sunD);
  vec2 sunDir = sunD / max(sunDist, 1.);
  float sd = sunDist - uR;                                    // sun height above the limb (px); <0 = hidden behind the planet
  float fwd = pow(max(dot(m, sunDir), 0.), 18.);              // forward scattering lobe around the limb, toward the sun
  float litA = smoothstep(-.35, .5, dot(nl, uS));             // how sunlit the atmosphere column at this limb point is
  float horizon = smoothstep(-.4, .3, sinE);
  float sunAmp = sinE < 0. ? exp(sinE * 3.4) : 1. - .78 * smoothstep(.04, .75, sinE);

  // ---------- sky ----------
  float hs = max(hr, 0.) / H;
  vec3 skyNight = mix(vec3(.030, .007, .012), vec3(.0015, .0005, .003), smoothstep(0., .5, hs));
  vec3 skyDay = mix(vec3(.30, .125, .065), vec3(.055, .018, .02), smoothstep(0., .8, pow(hs, .5)));
  vec3 sky = mix(skyNight, skyDay, dayF);
  float dxs = (p.x - uSun.x) / H;
  float band = exp(-hs * 4.2) * (.55 + .45 * exp(-dxs * dxs * 5.));
  vec3 twCol = mix(vec3(.50, .06, .05), vec3(1., .46, .17), exp(-hs * 7.5));
  sky += twCol * tw * band * (.55 + .5 * litA);
  // stars
  float starVis = (1. - smoothstep(-.26, .06, sinE)) * smoothstep(0., .10, hs + .01);
  vec3 stars = vec3(0.);
  if (starVis > .003 && hr > -2.) {
    for (int L = 0; L < 2; L++) {
      float cell = (L == 0 ? 23. : 83.) * uPx;
      vec2 id = floor(p / cell), f = fract(p / cell);
      float a = h21(id + float(L) * 17.3), b = h21(id + 5.1 + float(L)), c = h21(id + 9.7);
      if (c > (L == 0 ? .38 : .30)) continue;
      vec2 sp = vec2(.15 + .7 * a, .15 + .7 * b);
      float d = length((f - sp) * cell) / uPx;
      float rad = L == 0 ? .75 + .6 * a : 1.2 + .8 * b;
      float tl = 1. - .30 * (1. - uStill) * sin(uTime * (1.2 + 2.6 * b) + a * 40.);
      float s = smoothstep(rad, rad * .15, d) * (L == 0 ? .35 + .65 * c * 2.6 : 1.) * tl;
      stars += vec3(1., .92 + .06 * b, .86 + .1 * a) * s * (L == 0 ? .8 : 1.15);
    }
    vec2 bn = vec2(.62, .78); float bd = dot(p / H - vec2(.5, .3), bn);
    float mw = exp(-pow(bd / .16, 2.)) * (.35 + .9 * fbm(p / H * 7.)) * .05;
    stars += vec3(.9, .55, .45) * mw;
  }
  vec3 col = sky + stars * starVis;

  // ---------- sun: halos, disc, streak (sky only; faint over the planet like lens bloom) ----------
  vec2 dv = p - uSun;
  float ds = length(dv) / H;
  float dsH = length(vec2(dv.x * .42, dv.y)) / H;
  float skyM = smoothstep(-2., 2., hr);
  float vis = smoothstep(-1., 3., sd);
  float core = 1. / (1. + pow(ds / .028, 2.));
  vec3 sunHalo = vec3(1., .50, .22) * exp(-ds * 9.) * 1.0 + vec3(.85, .24, .13) * exp(-dsH * 4.6) * .62 + vec3(.55, .09, .08) * exp(-dsH * 1.7) * .14;
  sunHalo += vec3(.55, .72, 1.) * exp(-ds * 20.) * .25 * tw;      // bluish-white tint right next to the sun (Mars dusk is blue near the sun)
  vec3 sunCore = mix(vec3(1., .66, .38), vec3(1., .95, .90), exp(-ds * 60.)) * core * 1.25;
  float disc = smoothstep(.0105, .0075, ds) ;
  float streak = exp(-abs(dv.y) / (2.4 * uPx)) * exp(-abs(dv.x) / (.30 * uRes.x)) * .85;
  vec3 sunLight = (sunHalo * (.45 + .55 * vis) + sunCore * vis * 1.2 + vec3(1., .97, .93) * disc * vis * 3. + vec3(.7, .85, 1.) * streak * vis * .75 + vec3(1., .5, .25) * streak * (1. - vis) * .12) * sunAmp;
  col += sunLight * mix(.16, 1., skyM);

  // ---------- planet ----------
  if (r < 1.0035) {
    float nz = sqrt(max(1. - r2, 0.));
    vec3 n = vec3(q.x, -q.y, nz);
    vec3 a = uM * n;
    float lat = asin(clamp(a.y, -1., 1.)), lonr = atan(a.x, a.z);
    float lonD = lonr / PI * 180. + uDrift, latD = lat / PI * 180.;
    vec2 uv = vec2(.5 + lonD / ${TEX_SPAN}., .5 - latD / ${TEX_SPAN}.);
    float valid = uHasTex * smoothstep(0., .035, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
    vec2 s2 = vec2(lonD * cos(lat), latD);
    float nzx = max(nz, .06);
    float fine = fbm(s2 * 3.5);
    vec3 albT = pow(texture2D(uTex, uv).rgb, vec3(2.2));
    vec3 albP = vec3(.46, .20, .105) * (.55 + .9 * fbm(s2 * .35)) ;
    vec3 alb = mix(albP, albT, valid);
    alb *= .74 + .5 * fine;
    alb = mix(vec3(lum(alb)), alb, 1.18) * vec3(1.06, .96, .88);
    // relief: texture luminance + procedural craters as a height field, gradient taken along east / north
    float e = 1.6 / 2048.;
    float h0 = lum(albT) * valid, hE = lum(pow(texture2D(uTex, uv + vec2(e, 0.)).rgb, vec3(2.2))) * valid, hN = lum(pow(texture2D(uTex, uv - vec2(0., e)).rgb, vec3(2.2))) * valid;
    float t0 = terrain(s2), tE = terrain(s2 + vec2(.045, 0.)), tN = terrain(s2 + vec2(0., .045));
    vec3 east = normalize(cross(uAxis, n) + vec3(0., 1e-4, 0.)); vec3 north = cross(n, east);
    float gE = (hE - h0) * 20. + (tE - t0) * 9., gN = (hN - h0) * 20. + (tN - t0) * 9.;
    vec3 nb = normalize(n - (east * gE + north * gN) * .55 * mix(.45, 1., nz));
    float ndl = dot(nb, uS), ndl0 = dot(n, uS);
    float core2 = clamp((ndl + .14) / .50, 0., 1.);
    float L = core2 * core2 * (3. - 2. * core2);
    L = mix(L, max(ndl, 0.), .45) ;
    L *= 1.05;
    float gl = clamp((ndl0 + .3) / .5, 0., 1.);
    vec3 sunCol = mix(vec3(1., .36, .15), vec3(1., .88, .74), smoothstep(.0, .55, ndl0));
    vec3 lit = alb * sunCol * L * 0.95;
    vec3 amb = alb * vec3(.95, .55, .45) * (.020 + .06 * dayF) ;
    float skyfill = smoothstep(-.5, .1, ndl0) * .06;
    vec3 surf = lit + amb + alb * vec3(.9, .4, .25) * skyfill * tw;
    // dust haze towards the limb (longer path through the atmosphere), lit like the sky
    float fog = 1. - exp(-.045 / (nzx * nzx));
    float hl = mix(smoothstep(-.5, .4, ndl0), litA, 1. - nz);
    fog = clamp(fog * (.35 + .65 * hl), 0., .92);
    vec3 hazeCol = mix(vec3(.30, .09, .06), vec3(.95, .50, .28), clamp(hl * .9 + dayF * .4, 0., 1.)) * (.07 + .75 * hl * horizon + .10 * dayF);
    surf = mix(surf, hazeCol, fog);
    // city lights: only on the night side (fully off by day and at sunset, fading in through dusk; sinE < -.30 = full), softened by the limb haze
    float cityK = (1. - smoothstep(-.30, -.02, sinE)) * (1. - smoothstep(-.10, .20, ndl0));
    if (cityK > .004) surf += cityLights(vec2(lonD, latD), 180. / (PI * uR * max(nz, .25))) * cityK * (1. - .6 * fog);
    float edge = smoothstep(-1., 1., -hr);
    col = mix(col, surf, edge);
  }
  // ---------- thin scattering rim (both sides of the limb) ----------
  float t1 = max(.0075 * uR, 2.2 * uPx);
  float prof = exp(-abs(hr) / (hr > 0. ? t1 : t1 * 2.4));
  float broad = exp(-max(hr, 0.) / (.05 * uR)) * (hr > 0. ? 1. : exp(hr / (.05 * uR)));
  vec3 rimCol = mix(vec3(1., .42, .18), vec3(.82, .90, 1.), clamp(fwd * 1.1 * tw + fwd * .3, 0., 1.) * horizon);
  float prox = exp(-pow(sinE / .30, 2.));                        // how close the sun is to the horizon
  float rimAmt = .07 + .30 * litA * litA * dayF + 1.5 * litA * prox * (.30 + 2.2 * fwd);
  col += rimCol * prof * rimAmt + vec3(.95, .34, .15) * broad * (.02 + .16 * litA * litA * (prox + .3 * dayF) + .55 * fwd * prox) * .5;

  // ---------- grade ----------
  col = tonemap(col * (1.0 + .0 * dayF));
  col = pow(col, vec3(1. / 2.2));
  float vg = length((p / uRes - .5) * vec2(1., 1.15));
  col *= 1. - .35 * smoothstep(.45, 1., vg);
  col *= 1. - .48 * smoothstep(.80, 1., p.y / H);              // keep the bottom greeting readable
  col *= 1. - .76 * (1. - smoothstep(0., .27, p.y / H));       // and the lockup at the top (a sun passing high in the frame must not wash it out)
  col += (h21(p + fract(uTime)) - .5) / 255.;                  // dither: no banding in the dark gradients
  gl_FragColor = vec4(col, 1.);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('shader: ' + log); }
  return sh;
}

function rotMat() {   // M = Rx(TILT) * Rz(ROLL), column-major for uniformMatrix3fv
  const ct = Math.cos(TILT), st = Math.sin(TILT), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]];
  const M = Rx.map((row) => [0, 1, 2].map((j) => row[0] * Rz[0][j] + row[1] * Rz[1][j] + row[2] * Rz[2][j]));
  const axis = [M[1][0], M[1][1], M[1][2]];           // M^T * (0,1,0) = row 1 of M
  return { flat: [M[0][0], M[1][0], M[2][0], M[0][1], M[1][1], M[2][1], M[0][2], M[1][2], M[2][2]], axis };
}

/** Create the renderer on a canvas. Throws if WebGL is missing or the shader fails (the caller then keeps the CSS background). */
export function createSunrise(canvas, { onLost, onRestored } = {}) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('no webgl');
  let prog, U = {}, tex, hasTex = 0, lost = false, disposed = false, geo = { W: 1, H: 1, cx: 0, cy: 0, R: 1, k: 1 };
  const rm = rotMat();
  function setup() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'a'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const n of ['uRes', 'uC', 'uR', 'uPx', 'uS', 'uSinE', 'uSol', 'uSun', 'uTime', 'uDrift', 'uStill', 'uM', 'uAxis', 'uTex', 'uHasTex']) U[n] = gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one oversized triangle
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(U.uM, false, rm.flat); gl.uniform3fv(U.uAxis, rm.axis); gl.uniform1i(U.uTex, 0);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([110, 48, 28, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    hasTex = 0;
  }
  setup();
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; if (!disposed) onLost && onLost(); });
  canvas.addEventListener('webglcontextrestored', () => { if (disposed) return; try { setup(); lost = false; if (img) setTexture(img); onRestored && onRestored(); } catch (err) { onLost && onLost(err); } });

  let img = null;
  function setTexture(image) {
    img = image;
    if (lost) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const pot = (v) => (v & (v - 1)) === 0;
    if (pot(image.naturalWidth || image.width) && pot(image.naturalHeight || image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    hasTex = 1;
  }

  /** Layout (CSS px). scale = canvas pixels per CSS pixel (already capped by the caller). */
  function resize(W, H, scale) {
    const w = Math.max(2, Math.round(W * scale)), hh = Math.max(2, Math.round(H * scale));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const R = 1.5 * Math.min(W, 0.7 * H), apex = 0.60 * H;
    geo = { W, H, R, cx: W / 2, cy: apex + R, k: w / W };
    gl.viewport(0, 0, w, hh);
  }
  const layout = () => geo;

  function draw(sol, t, still) {
    if (lost) return null;
    const st = solarState(sol, geo.W, geo.H, geo.cx, geo.cy, geo.R), k = geo.k;
    gl.useProgram(prog);
    gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform2f(U.uC, geo.cx * k, geo.cy * k); gl.uniform1f(U.uR, geo.R * k); gl.uniform1f(U.uPx, k);
    gl.uniform3f(U.uS, st.s[0], st.s[1], st.s[2]); gl.uniform1f(U.uSinE, st.sinE); gl.uniform1f(U.uSol, sol); gl.uniform2f(U.uSun, st.sunX * k, st.sunY * k);
    gl.uniform1f(U.uTime, t % 1000); gl.uniform1f(U.uStill, still ? 1 : 0);
    gl.uniform1f(U.uDrift, still ? 0 : 13 * Math.sin(t * 0.021));
    gl.uniform1f(U.uHasTex, hasTex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return st;
  }
  const dispose = () => { disposed = true; try { const e = gl.getExtension('WEBGL_lose_context'); e && e.loseContext(); } catch { /* ignore */ } };
  return { setTexture, resize, draw, layout, dispose, hasTexture: () => !!hasTex, isLost: () => lost };
}
