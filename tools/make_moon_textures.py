#!/usr/bin/env python3
"""v38 photographic Moon textures from the NASA SVS CGI Moon Kit (public domain, https://svs.gsfc.nasa.gov/4720):
  lroc_color_poles_16k.tif  LROC WAC color mosaic, 16384x8192 (45.5 px/deg)  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_16k.tif
  ldem_64_uint.tif          LOLA DEM, 64 px/deg (23040x11520), uint16 half-metres offset 20000 m  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_64_uint.tif
                            (pass 4; pass 3 used ldem_16_uint.tif. Raw strip TIFF, read with a memmap so only the crop is touched)
  lroc_color_poles_2k.tif   (whole-globe low-res albedo, used only outside the crop, i.e. the far left / right of landscape desktops)
                            https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif
Outputs (assets/):
  moon-albedo.webp  2048x2048 RGB: CROP of the 16K mosaic over lon MOON_CROP[0]..[1], lat [2]..[3] (what phones see incl. the +-13 deg drift):
                    22.8 px/deg in lon, 27.7 in lat
  moon-relief.webp  2048x2048 grayscale atlas (pass 4 layout, must match FRAG_MOON in js/sunrise.js):
                      rows    0..1279, all 2048 cols : east slope dh/dx over the crop (22.8 px/deg lon, 17.3 lat; ~0.75 texels per device px on a 390x844 @3x phone)
                      rows 1280..2047, cols 0..1023  : north slope dh/dy over the crop (11.4 x 10.4 px/deg; the sun is east-west at sunrise / sunset, so north
                                                       slopes only matter when the sun is high, where the relief is meant to stay subtle anyway)
                      rows 1280..1791, cols 1024..2047: whole-globe gray albedo 1024x512 (outside the crop only)
                    slopes encoded .5 + slope * SLOPE_ENC, dithered +-DITHER LSB so they never band; downsampled from the 64 px/deg DEM with Lanczos
                    (no aliasing), then differentiated at the stored resolution
Usage: python3 tools/make_moon_textures.py [/dir/with/sources]"""
import sys, os
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
args = [a for a in sys.argv[1:] if not a.startswith('--')]
src = args[0] if args else '/workspace/scratch/tex'
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
CROP = (-28, 62, -27, 47)        # must match MOON_CROP in js/sunrise.js
SLOPE_ENC = 1.6                  # stored value = .5 + slope * SLOPE_ENC (slope = dh / ground distance), +-17 deg before clipping
RM = 1737400.
DITHER = .25
EH, NW, NH = 1280, 1024, 768     # atlas regions (see above)
Q_RELIEF = 88
def box(ppd): return (round((CROP[0] + 180) * ppd), round((90 - CROP[3]) * ppd), round((CROP[1] + 180) * ppd), round((90 - CROP[2]) * ppd))
if '--relief-only' not in sys.argv:
    c = Image.open(os.path.join(src, 'lroc_color_poles_16k.tif')).convert('RGB')
    alb = c.crop(box(16384 / 360)).resize((2048, 2048), Image.LANCZOS); del c
    p = os.path.join(out, 'moon-albedo.webp'); alb.save(p, 'WEBP', quality=86, method=6, use_sharp_yuv=True); print('moon-albedo.webp', os.path.getsize(p))
_t = Image.open(os.path.join(src, 'ldem_64_uint.tif')); assert _t.size == (23040, 11520) and _t.mode == 'I;16' and _t.tile[0][2] == 8 and _t.tile[1][2] == 8 + 46080, 'unexpected DEM layout'
D = np.memmap(os.path.join(src, 'ldem_64_uint.tif'), np.uint16, 'r', offset=8, shape=(11520, 23040))   # raw little-endian strips, 8-byte TIFF header
x0, y0, x1, y1 = box(64)
h = (np.asarray(D[y0:y1, x0:x1], np.float32) - 20000.) * .5                             # metres
def slopes(W, Hh):
    hF = np.asarray(Image.fromarray(h, 'F').resize((W, Hh), Image.LANCZOS), np.float64)
    lat = np.radians(CROP[3] - (np.arange(Hh) + .5) * (CROP[3] - CROP[2]) / Hh)[:, None]
    dxE = np.radians((CROP[1] - CROP[0]) / W) * RM * np.cos(lat)                        # metres per pixel east
    dyN = np.radians((CROP[3] - CROP[2]) / Hh) * RM                                     # metres per pixel north
    return np.gradient(hF, axis=1) / dxE, -np.gradient(hF, axis=0) / dyN                # rows go south
rng = np.random.default_rng(7)
def enc(s): return Image.fromarray(np.clip((.5 + s * SLOPE_ENC) * 255 + rng.uniform(-DITHER, DITHER, s.shape), 0, 255).astype(np.uint8), 'L')
sE, _ = slopes(2048, EH); _, sN = slopes(NW, NH)
atlas = Image.new('L', (2048, 2048), 128)
atlas.paste(enc(sE), (0, 0)); atlas.paste(enc(sN), (0, EH))
g = Image.open(os.path.join(src, 'lroc_color_poles_2k.tif')).convert('L').resize((1024, 512), Image.LANCZOS)
atlas.paste(g, (1024, EH))
p = os.path.join(out, 'moon-relief.webp'); atlas.save(p, 'WEBP', quality=Q_RELIEF, method=6); print('moon-relief.webp', os.path.getsize(p))
print('slope p0.5/p99.5 E', np.percentile(sE, [.5, 99.5]).round(3), 'N', np.percentile(sN, [.5, 99.5]).round(3), 'clip% E', round(float((np.abs(sE) > .5 / SLOPE_ENC).mean() * 100), 2))
