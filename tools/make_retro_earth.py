#!/usr/bin/env python3
"""v45 (prototype): assets/retro-earth.png = the Retro theme's Earth, reduced to a tiny class map (equirectangular, 720 x 360 = 2 px per degree).
  R = surface class 0..7 (0 deep ocean, 1 ocean, 2 shallow / coast, 3 desert, 4 dry land, 5 green, 6 forest, 7 ice)
  G = cloud cover 0 / 85 / 170 / 255 (from assets/earth-clouds.webp)
  B = city lights 0..255 (the alpha channel of the sharp crop assets/earth-day.webp / the globe)
js/retrosky.js turns the classes into a fixed pixel palette and shades them with an ordered dither, so the picture is pixel art, not a downsized photo.
Source: the same public-domain NASA Blue Marble textures the Earth theme uses. Run from the repo root: python3 tools/make_retro_earth.py"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
W, H = 720, 360
G = Image.open('assets/earth-globe.webp').convert('RGBA')   # resize RGB and A separately: PIL premultiplies RGBA, which would blacken everything where the lights alpha is 0
rgb = np.asarray(G.convert('RGB').resize((W, H), Image.LANCZOS)).astype(float) / 255; lights = np.asarray(G.getchannel('A').resize((W, H), Image.BOX)).astype(float) / 255
# sharp crop (lon -28..72, lat -14..64, 20 px / deg) replaces the globe where it exists
crop = Image.open('assets/earth-day.webp').convert('RGBA')
lon = -180 + (np.arange(W) + .5) / 2; lat = 90 - (np.arange(H) + .5) / 2
LON, LAT = np.meshgrid(lon, lat); inC = (LON >= -28) & (LON <= 72) & (LAT >= -14) & (LAT <= 64)
cw, ch = crop.size; small = np.dstack([np.asarray(crop.convert('RGB').resize((cw // 10, ch // 10), Image.BOX)), np.asarray(crop.getchannel('A').resize((cw // 10, ch // 10), Image.BOX))]).astype(float) / 255   # 200 x 200 = 2 px / deg
x = np.clip(((LON + 28) / 100 * small.shape[1]).astype(int), 0, small.shape[1] - 1); y = np.clip(((64 - LAT) / 78 * small.shape[0]).astype(int), 0, small.shape[0] - 1)
rgb = np.where(inC[..., None], small[y, x, :3], rgb); lights = np.where(inC, small[y, x, 3], lights)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]; mx = rgb.max(-1); mn = rgb.min(-1); lum = .3 * r + .55 * g + .15 * b
water = (b > r + .03) & (b >= g * .95)
cls = np.zeros((H, W), np.uint8)
land = ~water | (lum > .3)          # very bright 'water' = ice shelves
ice = land & (mn > .55) & ((mx - mn) < .16)
desert = land & ~ice & (r > g * 1.04) & (g > b * 1.12) & (lum > .38)
dry = land & ~ice & ~desert & (r >= g * .98)
green = land & ~ice & ~desert & ~dry & (lum >= .17)
forest = land & ~ice & ~desert & ~dry & ~green
cls[desert] = 3; cls[dry] = 4; cls[green] = 5; cls[forest] = 6; cls[ice] = 7
# smooth speckle: majority filter 3 x 3 (keeps coast lines, removes single-pixel noise)
def mode3(a):
    out = a.copy(); cnt = np.stack([ndi.uniform_filter((a == k).astype(float), 3) for k in range(8)]); out = cnt.argmax(0).astype(np.uint8); return out
cls = mode3(cls)
# ocean depth classes from the distance to land: 2 coast (<= 3 px), 1 shelf (<= 8 px), 0 deep
d = ndi.distance_transform_edt(cls <= 2)
cls[(cls <= 2) & (d <= 8)] = 1; cls[(cls <= 2) & (d <= 3)] = 2
cl = np.asarray(Image.open('assets/earth-clouds.webp').convert('L').resize((W, H), Image.BOX)).astype(float) / 255
c = np.clip((cl - .12) / .73, 0, 1); c = c * c * (3 - 2 * c); cq = (np.round(c * 3) * 85).astype(np.uint8)
lq = np.clip(lights * 255, 0, 255).astype(np.uint8)
out = np.dstack([cls, cq, lq]); Image.fromarray(out, 'RGB').save('assets/retro-earth.png', optimize=True)
import os; print('retro-earth.png', os.path.getsize('assets/retro-earth.png'), 'bytes; class shares', np.bincount(cls.ravel(), minlength=8) / cls.size)
