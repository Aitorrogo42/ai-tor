# v38: bake assets/earth-photo.webp + assets/moon-photo.webp (no-WebGL fallback) with the real shader. Needs playwright + /usr/bin/google-chrome.
import subprocess, sys, time, io
from PIL import Image
from playwright.sync_api import sync_playwright
import os; ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); PORT=8798   # app root
srv=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
GL=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=GL)
    for body in ['earth','moon']:
      pg=b.new_page(viewport={'width':2058,'height':1155}); errs=[]; pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
      pg.goto(f'http://127.0.0.1:{PORT}/tools/bake_theme_photo.html?body={body}'); pg.wait_for_function('window.done',timeout=30000); pg.wait_for_timeout(300)
      im=Image.open(io.BytesIO(pg.locator('#c').screenshot())).convert('RGB')
      import numpy as np
      a=np.asarray(im,np.float32); y=np.linspace(0,1,a.shape[0])[:,None,None]; k=1-.5*np.clip((y-.5)/.35,0,1); im=Image.fromarray((a*k).astype(np.uint8))   # keep the greeting readable (like the shader's bottom grade)
      im.save(f'{ROOT}/assets/{body}-photo.webp','WEBP',quality=72,method=6); print(body, im.size, errs)
finally: srv.terminate()
