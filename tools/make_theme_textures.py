#!/usr/bin/env python3
"""v38 themes: build the Earth / Moon textures from public-domain NASA sources (see DELIVERY.md / README credits).
Inputs (download with curl into /workspace/scratch/tex, or pass a dir as argv[1]):
  world.200407.3x5400x2700.jpg   NASA Blue Marble Next Generation (July 2004) - https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x5400x2700.jpg
  cloud_combined_2048.jpg        NASA Blue Marble clouds             - https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
  BlackMarble_2016_3km.jpg       NASA Black Marble 2016 (3 km)       - https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
  lroc_color_poles_2k.tif        NASA SVS CGI Moon Kit (LROC color)  - https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif
  ldem_3_8bit.jpg                NASA SVS CGI Moon Kit (LOLA DEM)    - https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg
Outputs (assets/): earth-day.webp (2048x2048 crop: RGB = Blue Marble, A = Black Marble lights), earth-globe.webp (1024x512 global RGB+A lights), earth-clouds.webp (2048x1024 L),
earth-disc.webp (small Earth map for the Earthrise disc on the Moon theme)."""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/scratch/tex'
out = os.path.join(os.path.dirname(__file__), '..', 'assets')
S = (2048, 1024)
def L(n, mode='RGB', size=S): return Image.open(os.path.join(src, n)).convert(mode).resize(size, Image.LANCZOS)
def save(im, n, q): p = os.path.join(out, n); im.save(p, 'WEBP', quality=q, method=6, exact=True); print(n, im.size, os.path.getsize(p))
# NOTE (pass 3): every RGBA webp is saved with exact=True. Without it libwebp rewrites the RGB under fully transparent alpha (no lights / no cloud / height 0)
# to compress better, which caused the blocky Sahara coast (pass 1-2) and horizontal smears.
# ---- EARTH (pass 3) ----
# earth-day.webp   2048x2048 RGBA: a CROP of Blue Marble NG 21600x10800 covering the region the phone camera can see incl. the +-13 deg drift
#                  (texture lon CROP[0]..CROP[1], lat CROP[2]..CROP[3]: ~20 px/deg in lon, ~26 in lat = ~1:1 on phones), A = Black Marble 3 km lights, same crop
# earth-globe.webp 1024x512 RGBA: the whole globe (RGB day, A lights), only used outside the crop (tablets in landscape / desktop edges)
# earth-clouds.webp 2048x1024 L: global clouds, sampled with a slow drift
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x21600x10800.jpg
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
CROP = (-28, 72, -14, 64)          # must match EARTH_CROP in js/sunrise.js
Image.MAX_IMAGE_PIXELS = None
def lights(img, box, size):          # Black Marble: drop the moonlit-ground base (~.204), linear light, energy-preserving box resize, gamma
    # pass 4: map the FULL source range (.215..1 -> 0..1). Pass 3 used (a - .215) / .65 and a 99.7th-percentile normalise, which flattened every source value
    # >= 221/255 (about 20 % of the lit pixels, all the metro cores) to 255. Now only the source's own saturated pixels (575 in the crop) reach 255; the shader
    # gain (js/sunrise.js FRAG_EARTH, 3.0) compensates the (.65 / .785) ** 2.2 = .66 lower level, and its soft knee rolls the cores off instead of clipping.
    a = np.asarray(img.crop(box) if box else img, np.float32) / 255.
    lin = np.clip((a - .215) / .785, 0, 1) ** 2.2
    l = np.asarray(Image.fromarray(lin, 'F').resize(size, Image.BOX))
    return Image.fromarray((np.clip(l, 0, 1) ** (1 / 2.2) * 255 + .5).astype(np.uint8), 'L')
bm = Image.open(os.path.join(src, 'world.200407.3x21600x10800.jpg')).convert('RGB')                   # 60 px / deg
bk = Image.open(os.path.join(src, 'BlackMarble_2016_3km.jpg')).convert('L')                            # 37.5 px / deg
box = lambda ppd: ((CROP[0] + 180) * ppd, (90 - CROP[3]) * ppd, (CROP[1] + 180) * ppd, (90 - CROP[2]) * ppd)
day = bm.crop(box(60)).resize((2048, 2048), Image.LANCZOS); day.putalpha(lights(bk, box(37.5), (2048, 2048)))
day.save(os.path.join(out, 'earth-day.webp'), 'WEBP', quality=84, alpha_quality=90, method=6, use_sharp_yuv=True, exact=True); print('earth-day.webp', os.path.getsize(os.path.join(out, 'earth-day.webp')))
g = bm.resize((1024, 512), Image.LANCZOS); g.putalpha(lights(bk, None, (1024, 512)))
g.save(os.path.join(out, 'earth-globe.webp'), 'WEBP', quality=80, alpha_quality=90, method=6, use_sharp_yuv=True, exact=True); print('earth-globe.webp', os.path.getsize(os.path.join(out, 'earth-globe.webp')))
save(L('cloud_combined_2048.jpg', 'L'), 'earth-clouds.webp', 72)
# (pass 4: the old moon-map.webp output is gone; the Moon textures come from tools/make_moon_textures.py)
save(L('world.200407.3x5400x2700.jpg', size=(1024, 512)), 'earth-disc.webp', 84)   # pass 2: 1024 wide, the Earthrise disc is ~70 px wide at 2x DPR
