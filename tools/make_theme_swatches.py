#!/usr/bin/env python3
"""v38: the Settings > Background > Theme picker swatches (assets/swatch-{mars,earth,moon}.webp, 72x72 = 36 CSS px at 2x).
Small lit globes rendered from the app's own textures (orthographic, soft light from the upper left, transparent outside the disc):
  Mars  = assets/game-mars.webp (already a globe, resized)
  Earth = assets/earth-globe.webp (whole globe, Blue Marble; RGB only, the alpha night lights are ignored), centred on lon 15 E, lat 20 N
  Moon  = the whole-globe LROC gray albedo inside assets/moon-relief.webp (pass-4 atlas: cols 1024..2047, rows 1280..1791), near side (lon 0, lat 0)
Run from the repo root: python3 tools/make_theme_swatches.py"""
import numpy as np
from PIL import Image
N = 72; SS = 4; M = N * SS
def globe(eq, lon0, lat0, ocean=None):
    eq = np.asarray(eq.convert('RGB')).astype(float) / 255
    if ocean is not None:   # Blue Marble oceans are ~rgb(3,5,20): too dark for a 36 px swatch, so tint the dark-blue texels toward an ocean blue
        k = np.clip((eq[..., 2] - eq[..., 0]) * 8, 0, 1) * np.clip(1 - eq.max(-1) * 4, 0, 1); eq = eq * (1 - k[..., None]) + np.array(ocean) * k[..., None]
    H, W = eq.shape[:2]
    y, x = np.mgrid[0:M, 0:M]; u = (x + .5) / M * 2 - 1; v = 1 - (y + .5) / M * 2; r2 = u * u + v * v; inside = r2 <= 1
    z = np.sqrt(np.clip(1 - r2, 0, 1)); la0, lo0 = np.radians(lat0), np.radians(lon0)
    # rotate view vector (u, v, z) back to the globe frame
    yy = v * np.cos(la0) + z * np.sin(la0); zz = -v * np.sin(la0) + z * np.cos(la0)
    lat = np.arcsin(np.clip(yy, -1, 1)); lon = lo0 + np.arctan2(u, zz)
    px = ((lon / (2 * np.pi) + .5) % 1) * (W - 1); py = (.5 - lat / np.pi) * (H - 1)
    col = eq[py.astype(int), px.astype(int)]
    L = np.array([-.45, .45, .77]); L /= np.linalg.norm(L); sh = np.clip(u * L[0] + v * L[1] + z * L[2], 0, 1)
    col = col * (.18 + .82 * sh[..., None] ** .8)
    a = inside.astype(float)
    return Image.fromarray(np.dstack([col * 255, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA').resize((N, N), Image.LANCZOS)
def save(im, name): im.save('assets/' + name, 'WEBP', quality=86, method=6, exact=True); print(name)
save(Image.open('assets/game-mars.webp').convert('RGBA').resize((N, N), Image.LANCZOS), 'swatch-mars.webp')
save(globe(Image.open('assets/earth-globe.webp'), 15, 20, ocean=(.09, .27, .55)), 'swatch-earth.webp')
rel = Image.open('assets/moon-relief.webp')
save(globe(rel.crop((1024, 1280, 2048, 1792)), 0, 0), 'swatch-moon.webp')   # must match the atlas layout in tools/make_moon_textures.py
