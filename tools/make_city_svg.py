#!/usr/bin/env python3
"""v31: generates the CSS fallback of the Mars night-side city lights (the .sol-city rule in css/motion.css), used only when WebGL is unavailable.
Three copies of the v27 city SVG (BASE below = the v27 artwork, a 120x90 viewBox drawn at 1.1 px per unit), placed at the screen offsets of CITIES (js/sunrise.js) projected
like the shader at a 390x844 reference phone, each rotated / scaled like its shader variant. Output: an inline SVG data URI (no network), opacity driven by --sol-city.
Re-run after changing CITIES:  python3 tools/make_city_svg.py
"""
import math, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'js/sunrise.js').read_text()
CLAT, CLON = [float(x) for x in re.search(r"CITY = \{ lat: ([-\d.]+), lon: ([-\d.]+) \}", src).groups()]
CITIES = [tuple(float(v) for v in m) for m in re.findall(r"\{ dx: ([-\d.]+), dy: ([-\d.]+), rot: ([-\d.]+), s: ([-\d.]+), seed: [-\d.]+ \}", src)]
assert len(CITIES) == 3, CITIES
DEG = math.pi / 180; TILT, ROLL = 0.80, -0.30; W, H = 390, 844; RP = 1.5 * min(W, 0.7 * H)
BASE = "%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop offset='0' stop-color='%23ffb35a' stop-opacity='.55'/%3E%3Cstop offset='.35' stop-color='%23ff8a2a' stop-opacity='.22'/%3E%3Cstop offset='1' stop-color='%23ff7a1a' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Cellipse cx='60' cy='45' rx='42' ry='30' fill='url(%23g)'/%3E%3Cpath d='M60 45L77.7 47.1' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L64.9 55.9' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L47.6 59.4' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L34.2 51.2' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L39.1 34.8' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L59.6 33.2' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Cpath d='M60 45L91.3 33.0' stroke='%23ff9b3d' stroke-width='.55' stroke-opacity='.7' stroke-dasharray='1.3 1.5' fill='none'/%3E%3Ccircle cx='54.7' cy='41.1' r='.7' fill='%23ffb25a' fill-opacity='0.92'/%3E%3Ccircle cx='53.4' cy='42.5' r='.7' fill='%23ffb25a' fill-opacity='0.65'/%3E%3Ccircle cx='62.9' cy='42.4' r='.7' fill='%23ffb25a' fill-opacity='0.59'/%3E%3Ccircle cx='60.4' cy='45.4' r='.7' fill='%23ffb25a' fill-opacity='0.51'/%3E%3Ccircle cx='64.2' cy='51.5' r='.7' fill='%23ffb25a' fill-opacity='0.74'/%3E%3Ccircle cx='43.4' cy='30.8' r='.7' fill='%23ffb25a' fill-opacity='0.64'/%3E%3Ccircle cx='64.8' cy='46.4' r='.7' fill='%23ffb25a' fill-opacity='0.55'/%3E%3Ccircle cx='59.3' cy='44.0' r='.7' fill='%23ffb25a' fill-opacity='0.66'/%3E%3Ccircle cx='52.5' cy='46.6' r='.7' fill='%23ffb25a' fill-opacity='0.60'/%3E%3Ccircle cx='65.0' cy='32.3' r='.7' fill='%23ffb25a' fill-opacity='0.80'/%3E%3Ccircle cx='59.3' cy='44.9' r='.7' fill='%23ffb25a' fill-opacity='0.89'/%3E%3Ccircle cx='57.5' cy='31.0' r='.7' fill='%23ffb25a' fill-opacity='0.59'/%3E%3Ccircle cx='53.5' cy='47.6' r='.7' fill='%23ffb25a' fill-opacity='0.83'/%3E%3Ccircle cx='60.5' cy='45.5' r='.7' fill='%23ffb25a' fill-opacity='0.69'/%3E%3Ccircle cx='62.0' cy='29.5' r='.7' fill='%23ffb25a' fill-opacity='0.74'/%3E%3Ccircle cx='63.9' cy='42.2' r='.7' fill='%23ffb25a' fill-opacity='0.61'/%3E%3Ccircle cx='54.0' cy='42.6' r='.7' fill='%23ffb25a' fill-opacity='0.68'/%3E%3Ccircle cx='70.2' cy='33.5' r='.7' fill='%23ffb25a' fill-opacity='0.92'/%3E%3Ccircle cx='80.3' cy='50.9' r='.7' fill='%23ffb25a' fill-opacity='0.80'/%3E%3Ccircle cx='57.8' cy='42.9' r='.7' fill='%23ffb25a' fill-opacity='0.95'/%3E%3Ccircle cx='56.0' cy='47.5' r='.7' fill='%23ffb25a' fill-opacity='0.78'/%3E%3Ccircle cx='70.9' cy='46.1' r='.7' fill='%23ffb25a' fill-opacity='0.68'/%3E%3Ccircle cx='63.4' cy='46.0' r='.7' fill='%23ffb25a' fill-opacity='0.83'/%3E%3Ccircle cx='64.5' cy='48.4' r='.7' fill='%23ffb25a' fill-opacity='0.57'/%3E%3Ccircle cx='80.6' cy='53.2' r='.7' fill='%23ffb25a' fill-opacity='0.67'/%3E%3Ccircle cx='41.7' cy='40.8' r='.7' fill='%23ffb25a' fill-opacity='0.89'/%3E%3Ccircle cx='60' cy='45' r='3.2' fill='%23ff9a3c' fill-opacity='.5'/%3E%3Ccircle cx='60' cy='45' r='1.5' fill='%23ffe2ad'/%3E"      # inner markup of the v27 SVG (URL-encoded), viewBox 0 0 120 90, city centre (60,45)

def proj(dx, dy):
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

K = 1.1                                                   # px per v27 unit
pos = [proj(dx, dy) for dx, dy, _, _ in CITIES]
half = 60 * K * 1.05
x0 = min(p[0] for p in pos) - half; x1 = max(p[0] for p in pos) + half; y0 = min(p[1] for p in pos) - half; y1 = max(p[1] for p in pos) + half
BW, BH = math.ceil(x1 - x0), math.ceil(y1 - y0); OX, OY = -x0, -y0
groups = []
for (dx, dy, rot, s), (px, py) in zip(CITIES, pos):
    # the shader rotates the sample point by +rot in the local east/north plane; on screen (y down, foreshortened) that is roughly a -rot turn of the artwork
    groups.append(f"%3Cg transform='translate({px + OX:.1f} {py + OY:.1f}) rotate({-rot / DEG:.1f}) scale({K * s:.3f}) translate(-60 -45)'%3E{BASE}%3C/g%3E")
svg = f"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {BW} {BH}'%3E" + ''.join(groups) + "%3C/svg%3E"
rule = (f'.sol-city{{display:none;position:absolute;left:53%;top:72%;width:{BW}px;height:{BH}px;margin:{-round(OY)}px 0 0 {-round(OX)}px;pointer-events:none;opacity:0;'
        f'background:url("data:image/svg+xml,{svg}") center/100% 100% no-repeat}}')
css = ROOT / 'css/motion.css'; txt = css.read_text()
txt2 = re.sub(r'^\.sol-city\{display:none;.*$', lambda m: rule, txt, count=1, flags=re.M)
assert '.sol-city{display:none;' in txt2
css.write_text(txt2)
print(f'wrote .sol-city: box {BW}x{BH}px, main city at ({OX:.0f},{OY:.0f}), {len(rule)} bytes')
