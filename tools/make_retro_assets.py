#!/usr/bin/env python3
"""v44 (prototype): Retro theme assets. assets/swatch-retro.webp (Settings picker, 18 x 18 pixel art scaled x4 with nearest neighbour = 72 px)
and assets/retro-photo.webp (static scene for 'Dynamic background: off': js/retrosky.js (Earth + class map) drawn once at sol 130 deg on a 480 x 864 screen = 96 x 173 pixels, lossless).
Run from the repo root (needs playwright + google-chrome):  python3 tools/make_retro_assets.py"""
import base64, io, os, socket, subprocess, sys, time
from PIL import Image, ImageDraw
# ---- swatch
G = 18; im = Image.new('RGBA', (G, G), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
BG, RIM1, RIM2, OC1, OC2, LAND, LAND2, WH, ST = (43, 42, 42, 255), (35, 95, 143, 255), (124, 205, 245, 255), (22, 84, 122, 255), (43, 149, 204, 255), (212, 176, 116, 255), (125, 95, 60, 255), (232, 238, 241, 255), (140, 137, 133, 255)
d.rectangle([0, 0, G - 1, G - 1], fill=BG)
import math
cx, cy, Rr = 8.5, 26.0, 16.2            # a big Earth rising from the bottom: limb apex ~ 60 % of the height, like the Earth theme
for y in range(G):
    for x in range(G):
        r = math.hypot(x - cx, y - cy)
        if r <= Rr - 1.4:
            lit = (x - 4) * .5 + (cy - y) * .12; c = OC2 if ((x + y) & 1 and lit > 3) or lit > 6 else OC1
            if (x * 7 + y * 13) % 11 < 3 and y > 12: c = LAND if x < 12 else LAND2
            if 12 < y < 16 and 3 < x < 9: c = LAND
            if (x + 2 * y) % 9 == 0 and y > 11: c = WH
            im.putpixel((x, y), c)
        elif r <= Rr - 0.2: im.putpixel((x, y), RIM2)
        elif r <= Rr + 1.6 and (x + y) % 2 == 0: im.putpixel((x, y), RIM1)
for (x, y) in [(2, 2), (15, 3), (6, 1), (11, 4), (16, 8), (1, 7)]: im.putpixel((x, y), ST)
im.putpixel((13, 2), WH)
im.resize((72, 72), Image.NEAREST).save('assets/swatch-retro.webp', 'WEBP', lossless=True, method=6); print('swatch-retro.webp')
# ---- static photo
from playwright.sync_api import sync_playwright
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); pg = b.new_page(viewport={'width': 480, 'height': 864})
        pg.goto(f'http://127.0.0.1:{port}/index.html')
        url = pg.evaluate("""async()=>{const m=await import('/js/retrosky.js');const c=document.createElement('canvas');const r=m.createRetro(c);const im=new Image();im.src='/assets/retro-earth.png';await im.decode();r.setTexture(im);r.resize(480,864);r.draw(130*Math.PI/180,0,true,false);return c.toDataURL('image/png')}""")
        Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB').save('assets/retro-photo.webp', 'WEBP', lossless=True, method=6)
        b.close()
finally: srv.terminate()
print('retro-photo.webp', os.path.getsize('assets/retro-photo.webp'))
