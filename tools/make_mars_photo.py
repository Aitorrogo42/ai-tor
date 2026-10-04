#!/usr/bin/env python3
"""Build assets/mars-photo.webp for AI-TOR from the user's Mars reference photo.

  source : /workspace/ai-tor-design/mars-photo-source.jpg   (588x330, has the words "MARS" / "RED PLANET")
  steps  : 1) find the lettering by its deviation from a heavily median-filtered copy (+ the two text boxes), dilate
           2) in-paint it by solving Laplace's equation inside the mask (smooth haze continues from the surroundings)
              and add grain with the same statistics as the neighbouring sky, so no ghost / flat patch remains
           3) save the cleaned source (lossless PNG) next to the original
           4) light de-noise, 3.5x Lanczos upscale, mild unsharp, subtle film grain (hides the softness), WebP
  output : /workspace/ai-tor/assets/mars-photo.webp (+ prints geometry used by css/motion.css)
Run: python3 tools/make_mars_photo.py
"""
import numpy as np, json
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = '/workspace/ai-tor-design/mars-photo-source.jpg'
CLEAN = '/workspace/ai-tor-design/mars-photo-clean.png'
OUT = '/workspace/ai-tor/assets/mars-photo.webp'
SCALE = 3.5
rng = np.random.default_rng(20261004)

src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
H, W, _ = src.shape

# ---- 1) text mask -------------------------------------------------------------
box = np.zeros((H, W), bool); box[24:100, 205:392] = True             # where the words live (nothing else is there)
bg = np.stack([ndi.median_filter(src[:, :, c], size=13) for c in range(3)], 2)
dev = np.abs(src - bg).max(2)
txt = (dev > 22) & box
txt |= (src.min(2) > 150) & box                                       # the off-white letters
mask = ndi.binary_dilation(txt, iterations=4)
mask = ndi.binary_closing(mask, iterations=2)
# the small 'RED PLANET' line is pale pink and thin; take its whole row band inside its x-range as well
sub = np.zeros_like(mask); sub[77:98, 232:332] = True
mask |= (ndi.binary_dilation((dev > 12) & sub, iterations=4))
print('text pixels masked:', int(mask.sum()))

# ---- 2) in-paint: harmonic (Laplace) fill + matching grain -----------------------
ys, xs = np.nonzero(mask); y0, y1, x0, x1 = ys.min() - 6, ys.max() + 7, xs.min() - 6, xs.max() + 7
m = mask[y0:y1, x0:x1]
filled = src.copy()
for c in range(3):
    ch = src[y0:y1, x0:x1, c].copy()
    # start from a linear blend of the 4 edges (Coons patch) to converge fast
    h, w = ch.shape
    top, bot, lef, rig = ch[0, :], ch[-1, :], ch[:, 0], ch[:, -1]
    u = np.linspace(0, 1, w)[None, :]; v = np.linspace(0, 1, h)[:, None]
    coons = (1 - v) * top[None, :] + v * bot[None, :] + (1 - u) * lef[:, None] + u * rig[:, None] \
        - ((1 - u) * (1 - v) * top[0] + u * (1 - v) * top[-1] + (1 - u) * v * bot[0] + u * v * bot[-1])
    ch[m] = coons[m]
    k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], float) / 4
    for it in range(6000):                                            # Jacobi relaxation of the Laplace equation
        nb = ndi.convolve(ch, k, mode='nearest')
        ch[m] = nb[m]
    filled[y0:y1, x0:x1, c] = ch
# grain: take the high-pass of the untouched sky just left/right/above and re-synthesise it inside the hole
hp = src - ndi.gaussian_filter(src, (1.6, 1.6, 0))
ring = ndi.binary_dilation(mask, iterations=14) & ~ndi.binary_dilation(mask, iterations=5) & ~(src.min(2) > 150)
sig = np.array([hp[:, :, c][ring].std() for c in range(3)])
print('grain std per channel', sig.round(2))
noise = ndi.gaussian_filter(rng.normal(size=(H, W, 3)), (0.7, 0.7, 0)) * 1.9
# soften the in-painted area very slightly so it carries the same micro-structure as its surroundings
soft = ndi.gaussian_filter(mask.astype(float), 1.2)[..., None]
filled = filled + soft * noise * sig
clean = np.clip(filled, 0, 255)
Image.fromarray(clean.round().astype('uint8')).save(CLEAN)

# ---- 3) analysis helpers for CSS: where is the limb? ---------------------------------
lum = clean @ np.array([.2126, .7152, .0722])
colmean = ndi.uniform_filter1d(lum, 25, axis=1)
limb = []
for x in range(0, W, 49):
    col = colmean[104:, x]; d = np.gradient(ndi.gaussian_filter1d(col, 2))
    limb.append((x, int(104 + np.argmax(d))))
print('limb (x, y of steepest brightening):', limb)
json.dump({'limb': limb, 'size': [W, H]}, open('/workspace/ai-tor-design/mars-photo-limb.json', 'w'))

# ---- 4) upscale + grain + webp ----------------------------------------------------
im = Image.fromarray(clean.round().astype('uint8')).filter(ImageFilter.GaussianBlur(0.55))   # tame JPEG blocking first
big = im.resize((round(W * SCALE), round(H * SCALE)), Image.LANCZOS)
big = big.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))
a = np.asarray(big).astype(np.float64)
gl = ndi.gaussian_filter(rng.normal(size=a.shape[:2]), 0.8) * 4.2                        # luma grain
gc = ndi.gaussian_filter(rng.normal(size=a.shape), (1.2, 1.2, 0)) * 1.2                 # a hint of chroma grain
lumw = np.clip((a @ np.array([.2126, .7152, .0722])) / 90, 0.45, 1.25)[..., None]        # a bit less grain in the very dark sky
a = np.clip(a + (gl[..., None] + gc) * lumw, 0, 255)
out = Image.fromarray(a.round().astype('uint8'))
import sys
q = int(sys.argv[1]) if len(sys.argv) > 1 else 90
out.save(OUT, 'WEBP', quality=q, method=6)
import os
print(out.size, os.path.getsize(OUT) // 1024, 'KB at q', q)
