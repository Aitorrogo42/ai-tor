#!/usr/bin/env python3
"""v28: generates the CSS fallback of the Mars night-side city cluster (the .sol-city rule in css/motion.css), used only when WebGL is unavailable.
Same layout as the shader (js/sunrise.js: CITY, TOWN, VILLAGE, RINGS): one large city with two ring roads + 8 radial avenues, a medium town (east) and a small
village (south-west) joined to it by two highways, all projected onto the planet exactly like the shader does at a 390x844 reference phone (so the ellipses are
foreshortened the same way). Output: an inline SVG data URI (no network), opacity driven by --sol-city.   Re-run:  python3 tools/make_city_svg.py
"""
import math, pathlib, random, re, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'js/sunrise.js').read_text()
num = lambda pat: [float(x) for x in re.search(pat, src).groups()]
CLAT, CLON = num(r"CITY = \{ lat: ([-\d.]+), lon: ([-\d.]+) \}")
TDX, TDY = num(r"TOWN = \{ dx: ([-\d.]+), dy: ([-\d.]+) \}")
VDX, VDY = num(r"VILLAGE = \{ dx: ([-\d.]+), dy: ([-\d.]+) \}")
R1, R2 = num(r"RINGS = \[([-\d.]+), ([-\d.]+)\]")
DEG = math.pi / 180; TILT, ROLL = 0.80, -0.30
W, H = 390, 844; RP = 1.5 * min(W, 0.7 * H)

def proj(dx, dy):
    """local east/north offset (degrees) from the city -> screen px (relative to the city centre)."""
    def p(lat, lon):
        la, lo = lat * DEG, lon * DEG
        a = [math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo)]
        ct, st, cr, sr = math.cos(TILT), math.sin(TILT), math.cos(ROLL), math.sin(ROLL)
        Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]; Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]]
        M = [[sum(Rx[i][k] * Rz[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
        n = [sum(M[i][j] * a[i] for i in range(3)) for j in range(3)]
        return n[0] * RP, -n[1] * RP
    x0, y0 = p(CLAT, CLON); x, y = p(CLAT + dy, CLON + dx / math.cos(CLAT * DEG))
    return x - x0, y - y0

h21 = lambda a, b: (math.sin(a * 127.1 + b * 311.7) * 43758.5453) % 1.0
OX, OY = 0, 0   # filled in below (city centre inside the SVG box)
f = lambda v: f"{v:.1f}".rstrip('0').rstrip('.')
def pt(dx, dy): x, y = proj(dx, dy); return f(x + OX) + ' ' + f(y + OY)
def poly(pts): return 'M' + 'L'.join(pt(*q) for q in pts)

# bounding box of the whole cluster
ext = [proj(dx, dy) for dx in (-2.4, 0, 4.0) for dy in (-2.4, 0, 2.4)]
x0 = min(e[0] for e in ext); x1 = max(e[0] for e in ext); y0 = min(e[1] for e in ext); y1 = max(e[1] for e in ext)
OX, OY = -x0 + 4, -y0 + 4; BW, BH = math.ceil(x1 - x0 + 8), math.ceil(y1 - y0 + 8)

AMB, LAMP, CORE = '%23ff9b3d', '%23ffb25a', '%23ffe2ad'
parts = []
def glow(i, dx, dy, rx_deg, op):
    cx, cy = proj(dx, dy); ex = proj(dx + rx_deg, dy)[0] - cx; ey = proj(dx, dy + rx_deg)[1] - cy
    parts.append(f"<ellipse cx='{f(cx + OX)}' cy='{f(cy + OY)}' rx='{f(abs(ex))}' ry='{f(abs(ey))}' fill='url(%23g)' opacity='{op}'/>")
glow(0, 0, 0, .55, '.8'); glow(1, TDX, TDY, .3, '.55'); glow(2, VDX, VDY, .18, '.45')
road = lambda d, op, sw='.45': parts.append(f"<path d='{d}' stroke='{AMB}' stroke-width='{sw}' stroke-opacity='{op}' fill='none'/>")
# rings (slightly irregular like the shader)
for R, op in ((R1, '.75'), (R2, '.55')):
    pts = []
    for i in range(73):
        a = i / 72 * 2 * math.pi; rr = R / (1 + .035 * math.sin(3 * a + 1.1) + .02 * math.sin(5 * a + 2.3))
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    road(poly(pts) + 'Z', op)
# 8 radial avenues
for k in range(7):
    a = k * .8976 + .55 * (h21(k, 2.7) - .5); L = R2 * (1.15 + 1.1 * h21(k, 7.1))
    pts = [((t) * math.cos(a) - .02 * math.sin(t * 2.1 + k * 1.7) * min(1, t / 1.2) * math.sin(a), (t) * math.sin(a) + .02 * math.sin(t * 2.1 + k * 1.7) * min(1, t / 1.2) * math.cos(a)) for t in [0.15 + i * (L - .15) / 8 for i in range(9)]]
    road(poly(pts), '.55')
# highways to the town and the village (bent)
for (tx, ty), seed, op in (((TDX, TDY), 1.7, '.35'), ((VDX, VDY), 4.2, '.3')):
    Lt = math.hypot(tx, ty); ux, uy = tx / Lt, ty / Lt
    pts = []
    for i in range(13):
        t = R2 + (Lt - R2 - .12) * i / 12; b = -.10 * Lt * math.sin((t) / Lt * math.pi) * math.sin(seed * 3.1)
        pts.append((ux * t - uy * b, uy * t + ux * b))
    road(poly(pts), op)
# settlement streets
for (cx, cy), s, n, seed in (((TDX, TDY), .30, 4, 11), ((VDX, VDY), .17, 3, 23)):
    for k in range(n):
        a = k * 2 * math.pi / n + 1.3 * h21(k, seed); L = s * (1.1 + 1.4 * h21(k, seed + 7.1))
        road(poly([(cx, cy), (cx + L * math.cos(a), cy + L * math.sin(a))]), '.45', '.35')
# lamp dots (deterministic), three brightness buckets
rnd = random.Random(28); buckets = {'.9': [], '.65': [], '.4': []}
def dots(cx, cy, rmax, n, dens):
    for _ in range(n):
        a = rnd.random() * 2 * math.pi; r = rmax * math.sqrt(rnd.random())
        if rnd.random() > dens(r): continue
        x, y = proj(cx + r * math.cos(a), cy + r * math.sin(a))
        buckets[rnd.choice(list(buckets))].append(f"M{f(x + OX - .3)} {f(y + OY - .3)}h.6v.6h-.6z")
dots(0, 0, 1.0, 260, lambda r: min(.95, 1.05 * math.exp(-r / .3)))
dots(TDX, TDY, .5, 40, lambda r: .8 * math.exp(-r / .17))
dots(VDX, VDY, .3, 20, lambda r: .8 * math.exp(-r / .1))
for op, ds in buckets.items(): parts.append(f"<path d='{''.join(ds)}' fill='{LAMP}' fill-opacity='{op}'/>")
# cores
for (cx, cy), r1, r2 in (((0, 0), 1.8, .8), ((TDX, TDY), 1.0, .45), ((VDX, VDY), .7, .35)):
    x, y = proj(cx, cy); parts.append(f"<circle cx='{f(x + OX)}' cy='{f(y + OY)}' r='{r1}' fill='{AMB}' fill-opacity='.45'/><circle cx='{f(x + OX)}' cy='{f(y + OY)}' r='{r2}' fill='{CORE}'/>")

svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {BW} {BH}'><defs><radialGradient id='g'><stop offset='0' stop-color='%23ffb35a' stop-opacity='.5'/>"
       f"<stop offset='.4' stop-color='%23ff8a2a' stop-opacity='.18'/><stop offset='1' stop-color='%23ff7a1a' stop-opacity='0'/></radialGradient></defs>{''.join(parts)}</svg>")
svg = svg.replace('<', '%3C').replace('>', '%3E').replace('#', '%23').replace('"', "'")
rule = (f'.sol-city{{display:none;position:absolute;left:53%;top:72%;width:{BW}px;height:{BH}px;margin:{-round(OY)}px 0 0 {-round(OX)}px;pointer-events:none;opacity:0;'
        f'background:url("data:image/svg+xml,{svg}") center/100% 100% no-repeat}}')
css = ROOT / 'css/motion.css'; txt = css.read_text()
txt2 = re.sub(r'^\.sol-city\{display:none;.*$', lambda m: rule, txt, count=1, flags=re.M)
assert txt2 != txt or rule in txt, 'sol-city rule not found'
css.write_text(txt2)
print(f'wrote .sol-city: box {BW}x{BH}px, city centre at ({OX:.0f},{OY:.0f}), {len(rule)} bytes')
