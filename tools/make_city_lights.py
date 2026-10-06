#!/usr/bin/env python3
"""Photoreal night-side city lights (rework after v32) for the Mars scene (replaces the v27/v31 analytic amber cities and tools/make_city_svg.py).

Builds, deterministically (fixed seed), a prebaked EMISSIVE texture of one metro + satellite towns, the way a night photo from orbit looks:
  * a density field: bright compact core, lopsided suburbs (domain-warped fbm), voids (parks / terrain), corridors along the highways;
  * a road network: meandering radial arterials that branch recursively (L-system-like random walk), several wobbly, broken concentric
    ring roads + two very large faint arcs, highways to the satellite towns (each a small metro of its own with radials / a ring);
  * ~0.5 M point lights sampled from the density, many snapped onto per-district street grids (gives the fine streaky street texture),
    log-normal brightness, sodium white-gold colour (whiter in the core) with ~12 % cooler LED blue-white points;
  * bright knots at junctions / centres, then a multi-scale gaussian bloom baked in.
Supersampled 4x and box-filtered. Stored HDR as Reinhard x/(1+x) in sRGB 8-bit (the shader decodes it), lossy WebP.

Outputs (both from the same field):
  assets/city-lights.webp      1024x512 texture in the city's local east/north plane (degrees from CITY, window BOX below), sampled by js/sunrise.js
  assets/city-lights-css.webp  the same lights projected like the shader onto a 390x844 reference phone (2x, with alpha) for the .sol-city CSS fallback
and rewrites the .sol-city rule in css/motion.css (box size / offset).

Re-run after changing anything here or CITY / CITIES / CITY_BOX in js/sunrise.js:  python3 tools/make_city_lights.py
Needs numpy, scipy, Pillow (with WebP).
"""
import math, pathlib, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'js/sunrise.js').read_text()
CLAT, CLON = [float(x) for x in re.search(r"CITY = \{ lat: ([-\d.]+), lon: ([-\d.]+) \}", SRC).groups()]
CITIES = [tuple(float(v) for v in m) for m in re.findall(r"\{ dx: ([-\d.]+), dy: ([-\d.]+), rot: ([-\d.]+), s: ([-\d.]+), seed: [-\d.]+ \}", SRC)]
BOX = [float(v) for v in re.search(r"CITY_BOX = \[([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)\]", SRC).groups()]   # x0, y0, x1, y1 (degrees east / north of CITY)
X0, Y0, X1, Y1 = BOX
TW, TH = 1024, 512                 # texture size (power of two: mipmaps on WebGL1)
SS = 4                             # supersampling
W, H = TW * SS, TH * SS
PPD = W / (X1 - X0)                # supersampled pixels per degree (east)
PPDY = H / (Y1 - Y0)
rng = np.random.default_rng(20261005)

def to_px(x, y):                   # degrees -> supersampled pixel coords
    return (np.asarray(x) - X0) * PPD, (Y1 - np.asarray(y)) * PPDY

# ---------------------------------------------------------------- noise helpers
def value_noise(shape, cells, seed):
    r = np.random.default_rng(seed); g = r.random((cells[1] + 3, cells[0] + 3)).astype(np.float32)
    return ndimage.zoom(g, (shape[0] / (cells[1] + 3) * 1.0, shape[1] / (cells[0] + 3) * 1.0), order=3)[:shape[0], :shape[1]]
def fbm(shape, base, seed, oct=5):
    s = np.zeros(shape, np.float32); a = .5; tot = 0
    for o in range(oct):
        c = (base * 2 ** o, max(1, base * 2 ** o * shape[0] // shape[1]))
        s += a * value_noise(shape, c, seed + o * 31); tot += a; a *= .5
    return s / tot

# ---------------------------------------------------------------- coordinate grids (final texture resolution for the fields)
FS = 2                                                     # density fields at 2x the texture
fx = X0 + (np.arange(TW * FS) + .5) / (TW * FS) * (X1 - X0)
fy = Y1 - (np.arange(TH * FS) + .5) / (TH * FS) * (Y1 - Y0)
GX, GY = np.meshgrid(fx, fy)
FSHAPE = GX.shape

# ---------------------------------------------------------------- settlements: (x, y, size); the metro + the two big satellites sit on CITIES
MS = 1.65                                                  # metro scale (degrees; 1 degree = ~59 km)
SETTLE = [(0.0, 0.0, MS)]
for dx, dy, rot, s_ in CITIES[1:]:
    SETTLE.append((dx, dy, s_ * .50))
SETTLE += [(5.6, -3.4, .30), (-4.9, 3.6, .24), (8.6, -6.9, .22), (3.4, 5.3, .19), (-10.8, -2.2, .18), (15.2, -4.6, .16),
           (-2.4, -9.4, .15), (10.2, 5.4, .15), (-8.6, 4.4, .12), (6.9, 2.0, .14), (1.2, -6.6, .12), (-12.2, 3.0, .10)]

warp1 = (fbm(FSHAPE, 3, 11) - .5); warp2 = (fbm(FSHAPE, 3, 12) - .5)
def settle_density(cx, cy, s, k):
    wx = GX + warp1 * s * 1.3; wy = GY + warp2 * s * 1.3
    dx, dy = (wx - cx) / s, (wy - cy) / s
    a = rng.uniform(0, math.pi); e = rng.uniform(1.0, 1.35 if k == 0 else 1.12)
    u = dx * math.cos(a) + dy * math.sin(a); v = -dx * math.sin(a) + dy * math.cos(a)
    r = np.sqrt((u / e) ** 2 + (v * e) ** 2)
    ang = np.arctan2(v, u)
    lobes = 1 + .22 * np.sin(3 * ang + rng.uniform(0, 6.3)) + .14 * np.sin(5 * ang + rng.uniform(0, 6.3)) + .10 * np.sin(2 * ang + rng.uniform(0, 6.3))   # irregular outline (lobes)
    rl = r / np.clip(lobes, .4, None)
    if k == 0: return np.exp(-(r / .18) ** 2) * .4 + np.exp(-(rl / 1.3) ** 1.3) + np.exp(-(rl / 2.6) ** 1.2) * .30
    return np.exp(-(r / .30) ** 2) * .15 + .7 * np.exp(-(rl / 1.2) ** 1.3) + np.exp(-(rl / 2.4) ** 1.2) * .28

dens = np.zeros(FSHAPE, np.float32); coreField = np.zeros(FSHAPE, np.float32)
for k, (cx, cy, s) in enumerate(SETTLE):
    d = settle_density(cx, cy, s, k) * (1.0 if k == 0 else .8)
    dens = np.maximum(dens, d)
    coreField = np.maximum(coreField, np.exp(-(((GX - cx) ** 2 + (GY - cy) ** 2) / (s * .7) ** 2)))
patch = fbm(FSHAPE, 7, 21)
voids = np.clip((patch - .34) / .16, 0, 1) ** 1.2
fine = fbm(FSHAPE, 48, 22, 3)
dens *= voids * (.45 + 1.1 * fine)
valley = np.abs(GY - (.8 * np.sin(GX * .45 + 1.2) - 1.3))      # a dark valley (canyon / river bed) winding through the metro
dens *= np.clip(valley / .10, .08, 1)

# ---------------------------------------------------------------- roads (polylines in degrees, brightness, width)
roads = []; junctions = []; ringsL = []
def walk(x, y, ang, length, step, curl, b, depth, s, bp):
    pts = [(x, y)]; L = 0; drift = rng.normal(0, curl * .3)
    while L < length:
        ang += rng.normal(drift, curl); x += math.cos(ang) * step; y += math.sin(ang) * step; L += step
        pts.append((x, y))
        if depth > 0 and L > .15 * s and rng.random() < bp:
            na = ang + rng.choice([-1, 1]) * rng.uniform(.9, 1.6)
            junctions.append((x, y, b))
            walk(x, y, na, min(length - L, rng.uniform(.3, 1.2) * s), step, curl * 1.3, b * .7, depth - 1, s, bp * .8)
    roads.append((np.array(pts), b, 1.0))

def ring(cx, cy, r, ecc, tilt, b, gaps, wob, seed, w=1.0):
    rr = np.random.default_rng(seed)
    t = np.linspace(0, 2 * math.pi, max(120, int(r * 300)))
    ph = rr.uniform(0, 6.3, 3)
    rad = r * (1 + wob * (np.sin(3 * t + ph[0]) * .5 + np.sin(5 * t + ph[1]) * .3 + np.sin(2 * t + ph[2]) * .4))
    x = rad * np.cos(t); y = rad * np.sin(t) * ecc
    xr = cx + x * math.cos(tilt) - y * math.sin(tilt); yr = cy + x * math.sin(tilt) + y * math.cos(tilt)
    on = np.ones_like(t, bool)
    for _ in range(gaps):
        g0 = rr.uniform(0, 2 * math.pi); gl = rr.uniform(.2, .9)
        on &= ~(((t - g0) % (2 * math.pi)) < gl)
    idx = np.flatnonzero(np.diff(np.r_[0, on.astype(int), 0]))
    for a_, e_ in zip(idx[::2], idx[1::2]):
        if e_ - a_ > 2: roads.append((np.stack([xr[a_:e_], yr[a_:e_]], 1), b, w)); ringsL.append((np.stack([xr[a_:e_], yr[a_:e_]], 1), b))

def highway(p, q, b, seed, bend=.15):
    rr = np.random.default_rng(seed)
    p, q = np.array(p, float), np.array(q, float); d = q - p; L = np.hypot(*d); n = np.array([-d[1], d[0]]) / L
    t = np.linspace(0, 1, int(L * 40) + 2)
    off = bend * L * np.sin(math.pi * t) * rr.uniform(-1, 1) + np.cumsum(rr.normal(0, .006, t.size)) * np.sin(math.pi * t)
    pts = p[None] + d[None] * t[:, None] + n[None] * off[:, None]
    roads.append((pts, b, 1.0)); return pts

# metro: 16 fairly straight radial arterials with a few branches each
for i in range(16):
    a = i / 16 * 2 * math.pi + rng.normal(0, .10)
    walk(rng.normal(0, .04), rng.normal(0, .04), a, rng.uniform(2.2, 4.6) * MS, .03, .022, 1.0, 2, MS, .035)
# metro rings: concentric (slightly off-centre, wobbly, broken) + two big faint arcs far out
for j, r in enumerate([.30, .55, .85, 1.2, 1.62, 2.1, 2.7]):
    ring(.03 * j, -.025 * j, r * MS, .88, .35, 1.0 - .07 * j, j // 2, .012 + .006 * j, 100 + j)
ring(.3, -.25, 4.0 * MS, .82, .30, .55, 3, .02, 201)
ring(-.5, .15, 5.6 * MS, .80, .25, .45, 4, .018, 202)
# satellites: own radials + rings; highways to the metro and between some towns
for k, (cx, cy, s) in enumerate(SETTLE[1:], 1):
    nr = 4 + int(12 * s)
    for i in range(nr):
        a = i / nr * 2 * math.pi + rng.normal(0, .2)
        walk(cx, cy, a, rng.uniform(1.2, 2.6) * s, .025, .03, .8, 1, s, .05)
    for j, r in enumerate([.35, .7, 1.1][: 1 + int(s > .2) + int(s > .35)]):
        ring(cx, cy, r * s, .87, rng.uniform(0, 3), .75, j, .02, 300 + k * 10 + j)
for k, (cx, cy, s) in enumerate(SETTLE[1:], 1):
    highway((0, 0), (cx, cy), .65 if s > .25 else .45, 400 + k)
for a_, b_ in [(1, 3), (2, 4), (3, 6), (2, 9), (1, 12), (4, 7), (5, 10), (8, 11), (6, 8), (13, 2), (14, 7)]:
    if a_ < len(SETTLE) and b_ < len(SETTLE): highway(SETTLE[a_][:2], SETTLE[b_][:2], .4, 500 + a_ * 7 + b_, .1)
for k, (a_, L) in enumerate([(2.6, 13), (-1.2, 12), (1.25, 9), (4.2, 11), (5.5, 12)]):
    highway((0, 0), (L * math.cos(a_), L * math.sin(a_)), .35, 600 + k, .08)

roadImg = Image.new('F', (W, H), 0.0); dr = ImageDraw.Draw(roadImg)
for pts, b, w in sorted(roads, key=lambda r: r[1]):
    px, py = to_px(pts[:, 0], pts[:, 1])
    dr.line(list(zip(px.tolist(), py.tolist())), fill=float(b) * 1.4, width=max(1, int(round(w * 2))))
road = np.asarray(roadImg, np.float32); del roadImg
ringImg = Image.new('F', (W, H), 0.0); dr = ImageDraw.Draw(ringImg)
for pts, b in ringsL:
    px, py = to_px(pts[:, 0], pts[:, 1]); dr.line(list(zip(px.tolist(), py.tolist())), fill=float(b), width=2)
ringR = np.asarray(ringImg, np.float32); del ringImg
def down(a, f): return a.reshape(a.shape[0] // f, f, a.shape[1] // f, f).mean((1, 3))

# ---------------------------------------------------------------- district street grids (supersampled raster): voronoi districts, own angle / spacing, lit blocks
ND = 420
dsx = rng.normal(0, 2.6, ND) * np.where(rng.random(ND) < .7, 1, 2.2); dsy = rng.normal(0, 2.0, ND) * np.where(rng.random(ND) < .7, 1, 2.2)
for (cx, cy, s) in SETTLE[1:]:
    m = int(4 + 30 * s); dsx = np.r_[dsx, cx + rng.normal(0, s * .9, m)]; dsy = np.r_[dsy, cy + rng.normal(0, s * .9, m)]
ND = dsx.size; dang = rng.uniform(0, math.pi / 2, ND); dsp = rng.uniform(.05, .13, ND)
from scipy.spatial import cKDTree
tree = cKDTree(np.stack([dsx, dsy], 1))
sx = X0 + (np.arange(W) + .5) / PPD; grid = np.zeros((H, W), np.float32)
for r0 in range(0, H, 256):                                 # in row bands (memory)
    sy = Y1 - (np.arange(r0, r0 + 256) + .5) / PPDY
    XX, YY = np.meshgrid(sx, sy)
    _, di = tree.query(np.stack([XX.ravel(), YY.ravel()], 1)); di = di.reshape(XX.shape)
    ca, sa, sp = np.cos(dang[di]), np.sin(dang[di]), dsp[di]
    u = (XX * ca + YY * sa) / sp; v = (-XX * sa + YY * ca) / sp
    lw = .9 / (PPD * sp)                                    # ~0.9 supersampled px wide
    ru = np.round(u).astype(np.int64); rv = np.round(v).astype(np.int64)
    gu = np.clip(1 - np.abs(u - ru) / lw, 0, 1); gv = np.clip(1 - np.abs(v - rv) / lw, 0, 1)
    # each street (line) has its own brightness, and is lit only in some stretches (segments of 2..5 blocks): no regular mesh
    def hh(a, b, c): return (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) & 0xFFFF) / 65535.
    segu = np.floor(v / (2 + 3 * hh(ru, di, 7))).astype(np.int64); segv = np.floor(u / (2 + 3 * hh(rv, di, 9))).astype(np.int64)
    lu = (hh(ru, segu, di) < .45) * hh(ru, di, 3) ** 1.5; lv = (hh(rv + 7777, segv, di) < .45) * hh(rv, di, 5) ** 1.5
    grid[r0:r0 + 256] = np.maximum(gu * lu, gv * lv)
del XX, YY, u, v, gu, gv, lu, lv, segu, segv, ru, rv

# ---------------------------------------------------------------- point lights (sampled from density, many snapped onto district grids)
road_f = down(road, SS // FS)
ribbon = ndimage.gaussian_filter(road_f, .10 * PPD / (SS / FS)) * 6 * np.clip(fbm(FSHAPE, 20, 41, 3) * 2 - .55, 0, 1)
dens = dens + ribbon * np.exp(-np.hypot(GX, GY) / 6.)          # ribbon development along the roads, mostly near the metro
lampF = np.clip(fbm(FSHAPE, 160, 33, 2) * 1.8 - .35, .12, 1.3)
clump = np.clip(fbm(FSHAPE, 34, 51, 4) * 2.6 - .95, 0, 1) ** 1.5 + .05
dc = np.clip(dens - .03, 0, None); dc = dc / (1 + .9 * dc)
dens_s = (dc ** 1.25) * clump + .4 * road_f * (.1 + np.clip(dens, 0, 1))
p = dens_s.ravel(); p = p / p.sum()
N = 450_000
idx = rng.choice(p.size, N, p=p)
py_, px_ = np.divmod(idx, FSHAPE[1])
x = fx[px_] + (rng.random(N) - .5) * (fx[1] - fx[0]); y = fy[py_] + (rng.random(N) - .5) * (fy[0] - fy[1])
_, di = tree.query(np.stack([x, y], 1))
ca, sa, sp = np.cos(dang[di]), np.sin(dang[di]), dsp[di]
u = x * ca + y * sa; v = -x * sa + y * ca
snap = rng.random(N); su = snap < .32; sv = (snap >= .32) & (snap < .64)
u[su] = np.round(u[su] / sp[su]) * sp[su]; v[sv] = np.round(v[sv] / sp[sv]) * sp[sv]
x = u * ca - v * sa; y = u * sa + v * ca
bri = rng.lognormal(-.6, .9, N).astype(np.float32)
cf = ndimage.map_coordinates(coreField, [(Y1 - y) / (Y1 - Y0) * FSHAPE[0] - .5, (x - X0) / (X1 - X0) * FSHAPE[1] - .5], order=1)
cool = rng.random(N) < (.025 + .06 * (1 - cf))
SOD = np.array([1.0, .45, .11], np.float32); WHT = np.array([1.0, .78, .48], np.float32); COOL = np.array([.62, .78, 1.0], np.float32)
col = SOD[None] * (1 - cf[:, None] * .45) + WHT[None] * (cf[:, None] * .45); col[cool] = COOL * 2.2
ptx, pty = to_px(x, y)
ix = np.clip(ptx.astype(int), 0, W - 1); iy = np.clip(pty.astype(int), 0, H - 1)
pts_img = np.zeros((H, W, 3), np.float32)
for c in range(3): np.add.at(pts_img[..., c], (iy, ix), bri * col[:, c])
pts_f = np.stack([down(pts_img[..., c], SS) for c in range(3)], -1); del pts_img

# ---------------------------------------------------------------- compose at texture resolution (linear HDR)
def to_tex(a): return down(a, FS)
densT = np.clip(to_tex(dens), 0, None); coreT = to_tex(coreField)
lampT = to_tex(lampF)
roadT = down(road, SS) * (.10 + .9 * np.clip(densT, 0, 1.6) ** .7) * lampT
gridT = down(grid, SS) * np.clip(densT - .06, 0, 1.2) ** 1.3 * (.6 + .8 * lampT) * (.35 + to_tex(clump))
E = np.zeros((TH, TW, 3), np.float32)
mixc = lambda k: SOD[None, None] * (1 - coreT[..., None] * k) + WHT[None, None] * (coreT[..., None] * k)
E += pts_f * .45
E += roadT[..., None] * mixc(.45) * 2.1
E += (down(ringR, SS) * .35 * lampT)[..., None] * mixc(.3)          # ring roads stay visible across the dark gaps too
E += gridT[..., None] * mixc(.5) * 1.6
E += (densT ** 1.5 * .025)[..., None] * mixc(.3)            # unresolved diffuse light of the built-up area
knots = np.zeros((TH, TW), np.float32)
jx, jy = to_px([j[0] for j in junctions], [j[1] for j in junctions]); jb = np.array([j[2] for j in junctions], np.float32)
dj = ndimage.map_coordinates(densT, [jy / SS, jx / SS], order=1)
np.add.at(knots, (np.clip((jy / SS).astype(int), 0, TH - 1), np.clip((jx / SS).astype(int), 0, TW - 1)), jb * np.clip(dj, .1, 1.5) * rng.uniform(.3, 1.2, jb.size))
for (cx, cy, s) in SETTLE:
    for _ in range(int(4 + 22 * s)):
        r = abs(rng.normal(0, .8 * s)); a_ = rng.uniform(0, 6.283)
        kx, ky = to_px(cx + r * math.cos(a_), cy + r * math.sin(a_))
        knots[min(TH - 1, int(ky / SS)), min(TW - 1, int(kx / SS))] += rng.uniform(.3, 1.2) * (1 if s > .5 else .5)
knots = ndimage.gaussian_filter(knots, .8) * 4
E += knots[..., None] * (WHT * .7 + SOD * .3)[None, None]
E += (np.exp(-((GX[::FS, ::FS] ** 2 + GY[::FS, ::FS] ** 2) / (.08 * MS) ** 2))[..., None] * .7) * WHT[None, None]   # hot centre
B = E.copy()
for sig, w in [(2.5, .30), (7, .16), (18, .09), (45, .05)]:
    B += w * np.stack([ndimage.gaussian_filter(E[..., c], sig) for c in range(3)], -1)
bx = np.minimum(np.arange(TW), TW - 1 - np.arange(TW)) / 24.; by = np.minimum(np.arange(TH), TH - 1 - np.arange(TH)) / 24.
B *= np.clip(np.minimum(by[:, None], bx[None, :]), 0, 1)[..., None] ** 2
EXPO = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
B *= EXPO
np.save('/tmp/citylights_E.npy', B)

# ---------------------------------------------------------------- encode: Reinhard x/(1+x), sRGB-ish gamma 2.2, 8-bit WebP
def encode(E): return (np.clip(E / (1 + E), 0, 1) ** (1 / 2.2) * 255 + .5).astype(np.uint8)
tex = encode(B)
out = ROOT / 'assets/city-lights.webp'
Image.fromarray(tex, 'RGB').save(out, 'WEBP', quality=88, method=6)
print(f'wrote {out.relative_to(ROOT)} {TW}x{TH}, {out.stat().st_size} bytes, peak E {B.max():.2f}, {len(roads)} roads, {len(junctions)} junctions')

# ---------------------------------------------------------------- CSS fallback: project like the shader onto a 390x844 reference phone (2x), with alpha
DEG = math.pi / 180; TILT, ROLL = 0.80, -0.30; RW, RH = 390, 844; RP = 1.5 * min(RW, 0.7 * RH); RCX, RCY = RW / 2, 0.6 * RH + RP
ct, st, cr, sr = math.cos(TILT), math.sin(TILT), math.cos(ROLL), math.sin(ROLL)
Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]); Rx = np.array([[1, 0, 0], [0, ct, -st], [0, st, ct]]); MM = Rx @ Rz
GAIN = float(re.search(r"CITY_GAIN = ([\d.]+)", SRC).group(1))
def screen_of(dx, dy):
    la, lo = (CLAT + dy) * DEG, (CLON + dx / math.cos(CLAT * DEG)) * DEG
    a = np.array([math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo)]); n = MM.T @ a
    return RCX + n[0] * RP, RCY - n[1] * RP
corners = [screen_of(xx, yy) for xx in np.linspace(X0, X1, 9) for yy in (Y0, Y1)] + [screen_of(xx, yy) for yy in np.linspace(Y0, Y1, 9) for xx in (X0, X1)]
bx0 = max(0, math.floor(min(c[0] for c in corners))); bx1 = min(RW, math.ceil(max(c[0] for c in corners)))
by0 = max(math.floor(min(c[1] for c in corners)), int(.6 * RH)); by1 = min(RH, math.ceil(max(c[1] for c in corners)))
K = 2; SSC = 3                                              # 2x image, 3x3 supersampled
xs = bx0 + (np.arange((bx1 - bx0) * K * SSC) + .5) / (K * SSC); ys = by0 + (np.arange((by1 - by0) * K * SSC) + .5) / (K * SSC)
PX, PY = np.meshgrid(xs, ys)
qx, qy = (PX - RCX) / RP, (PY - RCY) / RP; r2 = qx * qx + qy * qy
nz = np.sqrt(np.clip(1 - r2, 0, None)); n = np.stack([qx, -qy, nz], -1)
a = n @ MM.T
lat = np.arcsin(np.clip(a[..., 1], -1, 1)) / DEG; lon = np.arctan2(a[..., 0], a[..., 2]) / DEG
ddx = (lon - CLON) * math.cos(CLAT * DEG); ddy = lat - CLAT
u = (ddx - X0) / (X1 - X0) * TW - .5; v = (Y1 - ddy) / (Y1 - Y0) * TH - .5
S = np.stack([ndimage.map_coordinates(B[..., c], [v, u], order=1, mode='constant') for c in range(3)], -1)
fog = 1 - np.exp(-.045 / np.maximum(nz, .06) ** 2)
S *= ((r2 < 1) * (1 - .6 * fog))[..., None] * GAIN
def aces(x): x = x * .85; return np.clip((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0, 1)
D = aces(S) ** (1 / 2.2)
D = D.reshape(D.shape[0] // SSC, SSC, D.shape[1] // SSC, SSC, 3).mean((1, 3))
A = D.max(-1); rgb = np.where(A[..., None] > 1e-4, D / np.maximum(A[..., None], 1e-4), 0)   # straight alpha: over a near-black night ~= additive
# trim to the lit part (alpha >= 2/255), keeping a 2 px margin
ys_, xs_ = np.nonzero(A >= 2 / 255.)
t0, t1 = max(0, ys_.min() - 4), min(A.shape[0], ys_.max() + 5); l0, l1 = max(0, xs_.min() - 4), min(A.shape[1], xs_.max() + 5)
t0 -= t0 % K; l0 -= l0 % K; t1 += (-t1) % K; l1 += (-l1) % K
A, rgb = A[t0:t1, l0:l1], rgb[t0:t1, l0:l1]; by0 += t0 // K; bx0 += l0 // K; by1 = by0 + (t1 - t0) // K; bx1 = bx0 + (l1 - l0) // K
img = np.concatenate([rgb, A[..., None]], -1)
cssOut = ROOT / 'assets/city-lights-css.webp'
Image.fromarray((np.clip(img, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA').save(cssOut, 'WEBP', quality=86, method=6)
cx0, cy0 = screen_of(0, 0); BW, BH = bx1 - bx0, by1 - by0
# placed on the fallback PHOTO's night side (its limb peaks at 100% - --rise = 75 vh, see .mars), 72 px below it, and it dips with the photo inside sections (--dip 9vh)
rule = (f'.sol-city{{display:none;position:absolute;left:53%;top:calc(75% + 72px);width:{BW}px;height:{BH}px;margin:{-round(cy0 - by0)}px 0 0 {-round(cx0 - bx0)}px;pointer-events:none;opacity:0;'
        f'background:url(../assets/city-lights-css.webp) center/100% 100% no-repeat;transition:transform 1.5s var(--ease)}}html:not([data-sec=home]) .sol-city{{transform:translate3d(0,9vh,0)}}')
css = ROOT / 'css/motion.css'; txt = css.read_text()
txt2 = re.sub(r'^\.sol-city\{display:none;.*$', lambda m: rule, txt, count=1, flags=re.M)
assert '.sol-city{display:none;' in txt2
css.write_text(txt2)
print(f'wrote {cssOut.relative_to(ROOT)} {A.shape[1]}x{A.shape[0]}, {cssOut.stat().st_size} bytes; .sol-city box {BW}x{BH}px, city at ({cx0 - bx0:.0f},{cy0 - by0:.0f})')
