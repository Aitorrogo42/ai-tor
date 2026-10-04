// Liquid-glass refraction, Chromium only. Safari/iOS ignore backdrop-filter:url(), so there the glass is blur + saturate + specular rim only
// (css/glass.css) and this module does nothing. On Chromium it adds an SVG feDisplacementMap that bends whatever is behind the home cards
// toward the card centre near its edges, like the lens edge of Apple's Liquid Glass. Everything is same-origin / generated (no external files).
export function initGlass() {
  try {
    const ua = navigator.userAgent;
    if (!/Chrome\/\d+/.test(ua) || /CriOS|EdgiOS|FxiOS|iPhone|iPad|iPod/.test(ua)) return;
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 64;
    const g = cv.getContext('2d'); if (!g) return;
    const im = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const u = (x + 0.5) / cv.width * 2 - 1, v = (y + 0.5) / cv.height * 2 - 1;
      // squircle distance: 0 in the middle, 1 at the border; only the outer ~25% bends
      const e = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
      const k = Math.pow(Math.max(0, (e - 0.72) / 0.28), 2);
      const dx = -u * k, dy = -v * k;              // pull the backdrop toward the centre
      const i = (y * cv.width + x) * 4;
      im.data[i] = Math.round(128 + 127 * dx); im.data[i + 1] = Math.round(128 + 127 * dy); im.data[i + 2] = 128; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('id', 'lg-defs'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><filter id="lg-bend" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">' +
      '<feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" href="' + cv.toDataURL('image/png') + '"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="0.16" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
    document.body.appendChild(svg);
    document.documentElement.classList.add('lg-refract');
  } catch (e) { /* purely cosmetic */ }
}
