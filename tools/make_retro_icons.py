#!/usr/bin/env python3
"""v45: css/retro-icons.css = the Retro theme's TRUE 16 x 16 pixel-art icons. Every icon is a hand-drawn bitmap below (# = pixel, auto-centred on the 16 x 16 grid); the generator
turns each into a tiny inline SVG of unit squares (shape-rendering: crispEdges) used as a CSS mask on the existing <svg class="ico ico-NAME"> / <svg class="sec-glyph-ID"> elements, painted with
currentColor and sized at 16 px (1:1) or a whole multiple, ONLY under html[data-theme=retro] (the SVG children are hidden there). The other themes keep their vector icons untouched.
Run from the repo root: python3 tools/make_retro_icons.py  (writes css/retro-icons.css and, with --preview, a contact sheet PNG)."""
import sys, urllib.parse
N = 16
def grid(rows):
    w = max(len(r) for r in rows); return [r.ljust(w, '.') for r in rows]
def mirror(rows): return [r[::-1] for r in rows]
def vflip(rows): return rows[::-1]
def rot_ccw(rows):
    w = len(rows[0]); return [''.join(rows[r][w - 1 - c] for r in range(len(rows))) for c in range(w)]
def canvas(w, h): return [['.'] * w for _ in range(h)]
def tostr(c): return [''.join(r) for r in c]
def plus(n=11, t=2):
    c = canvas(n, n); m = (n - t) // 2
    for i in range(n):
        for k in range(t): c[m + k][i] = '#'; c[i][m + k] = '#'
    return tostr(c)
def cross(n=10):
    c = canvas(n + 1, n)
    for i in range(n): c[i][i] = c[i][i + 1] = '#'; c[i][n - 1 - i] = c[i][n - i] = '#'
    return tostr(c)
def outline(rows):
    h, w = len(rows), len(rows[0]); on = lambda x, y: 0 <= x < w and 0 <= y < h and rows[y][x] == '#'
    return [''.join('#' if on(x, y) and not all(on(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) else '.' for x in range(w)) for y in range(h)]
def external():
    c = canvas(11, 11)
    for r in (0, 1):
        for x in range(4, 11): c[r][x] = '#'
    for r in range(0, 7):
        for x in (9, 10): c[r][x] = '#'
    for i in range(9): c[10 - i][i] = c[10 - i][i + 1] = '#'
    return tostr(c)
def refresh():
    import math
    c = canvas(14, 14)
    for y in range(14):
        for x in range(14):
            dx, dy = x - 6.5, y - 6.5; r = math.hypot(dx, dy); a = math.degrees(math.atan2(dy, dx)) % 360
            if 4.4 <= r <= 6.4 and not (272 <= a <= 345): c[y][x] = '#'
    for x, rows in ((5, (0, 1, 2, 3, 4)), (6, (1, 2, 3)), (7, (2,))):                 # solid arrowhead pointing right at the open end (top)
        for y in rows: c[y][x + 1] = '#'
    return tostr(c)
def tri_down():
    return [('#' * k).center(15, '.') for k in (15, 13, 11, 9, 7, 5, 3, 1)]
chevL = ['....##', '...##.', '..##..', '.##...', '##....', '.##...', '..##..', '...##.', '....##']
eye = ['....######....', '..###....###..', '.##..####..##.', '##..######..##', '##..######..##', '.##..####..##.', '..###....###..', '....######....']
def eye_off():
    c = canvas(14, 12)
    for y, r in enumerate(eye):
        for x, ch in enumerate(r): c[y + 2][x] = ch
    for i in range(12): c[11 - i][1 + i] = '#'; 
    for i in range(11): c[11 - i][2 + i] = '#'
    return tostr(c)
star = ['......##......', '......##......', '.....####.....', '.....####.....', '.############.', '..##########..', '...########...', '...########...', '..####..####..', '..###....###..', '.###......###.', '.##........##.']
upload = ['....##....', '...####...', '..######..', '.########.', '....##....', '....##....', '....##....', '..........', '##########']
UI = {
    'chevL': chevL, 'chevR': mirror(chevL), 'chevD': rot_ccw(chevL),
    'plus': plus(), 'close': cross(), 'external': external(), 'triangleDown': tri_down(),
    'check': ['........##', '.......###', '......###.', '##...###..', '###.###...', '.#####....', '..###.....', '...#......'],
    'lock': ['...######...', '..##....##..', '..##....##..', '..##....##..', '############', '############', '#####..#####', '#####..#####', '#####..#####', '############', '############'],
    'star': star, 'starOutline': outline(star),
    'eye': eye, 'eyeOff': eye_off(),
    'pin': ['..######..', '.########.', '####..####', '###....###', '###....###', '####..####', '.########.', '..######..', '...####...', '....##....'],
    'camera': ['....#####.....', '##############', '##..######..##', '##.##....##.##', '##.#......#.##', '##.#......#.##', '##.##....##.##', '##..######..##', '##############'],
    'image': ['##############', '#............#', '#.......##...#', '#.......##...#', '#...#........#', '#..###...#...#', '#.#####.###..#', '##############'],
    'calendar': ['..##....##..', '############', '############', '#..........#', '#.##.##.##.#', '#..........#', '#.##.##.##.#', '#..........#', '############'],
    'comment': ['############', '#..........#', '#..........#', '#..........#', '#..........#', '############', '..##........', '..#.........'],
    'clock': ['##########', '.########.', '..######..', '...####...', '....##....', '....##....', '...####...', '..######..', '.########.', '##########'],
    'trash': ['....####....', '############', '..########..', '..#.#..#.#..', '..#.#..#.#..', '..#.#..#.#..', '..#.#..#.#..', '..########..'],
    'edit': ['........###.', '.......#####', '......#####.', '.....#####..', '....#####...', '...#####....', '..#####.....', '.#####......', '####........', '###.........'],
    'upload': upload, 'download': vflip(upload),
    'share': ['....##....', '...####...', '..######..', '.########.', '....##....', '....##....', '....##....', '..........', '#........#', '#........#', '##########'],
    'refresh': refresh(),
}
# section glyphs (the six wheel sections), 16 x 16
def bars():
    c = canvas(16, 16)
    for x0, x1, top, slope in ((1, 4, 7, -1), (6, 9, 1, -1), (11, 14, 5, -1)):
        for x in range(x0, x1 + 1):
            t = top + (1 if x > (x0 + x1) // 2 else 0) * 0
            for y in range(t, 16): c[y][x] = '#'
        c[top][x0] = '.'                                                   # slanted tops: the first column starts one pixel lower
        if x1 - x0 >= 3: c[top][x0 + 1] = '#'
    for x0, top in ((1, 7), (6, 1), (11, 5)):
        c[top][x0] = '.'; c[top + 1][x0] = '#'
    return tostr(c)
def steps():
    c = canvas(16, 16)
    for k, hgt in enumerate((4, 7, 10, 13)):
        for x in range(4 * k, 4 * k + 3):
            for y in range(15 - hgt, 15): c[y][x + 0] = '#'
    return tostr(c)
def diamond():
    c = canvas(16, 16)
    for r in range(8):
        w = 2 + 2 * r
        for x in range(8 - w // 2, 8 + w // 2): c[r][x] = '#'
        for x in range(8 - w // 2, 8 + w // 2): c[15 - r][x] = '#'
    for x in range(16): c[7][x] = '.'                                      # the thin cross lines of the Travels glyph
    for r in range(2, 7): c[r][7] = c[r][8] = '.'
    return tostr(c)
def gear():
    import math
    c = canvas(16, 16)
    for y in range(16):
        for x in range(16):
            dx, dy = x - 7.5, y - 7.5; r = math.hypot(dx, dy); a = math.atan2(dy, dx)
            tooth = (math.cos(a * 8) > 0.15)
            if 2.6 <= r <= (7.9 if tooth else 6.0): c[y][x] = '#'
    return tostr(c)
SEC = {
    'finances': steps(),
    'todo': ['..............##', '.............###', '............###.', '...........###..', '..##......###...', '..###....###....', '...###..###.....', '....######......', '.....####.......', '......##........'],
    'travels': diamond(),
    'game': ['.......##.......', '......####......', '.....######.....', '....########....', '................', '.####....####...', '.#..#...######..', '.#..#...######..', '.####...######..', '.........####...', '................', '....##....##....', '.....##..##.....', '......####......', '.....##..##.....', '....##....##....'],
    'architecture': bars(),
    'settings': gear(),
}

def svg_for(rows):
    rows = grid(rows); h, w = len(rows), len(rows[0]); ox, oy = (N - w) // 2, (N - h) // 2; d = []
    for y, r in enumerate(rows):
        x = 0
        while x < w:
            if r[x] == '#':
                x0 = x
                while x < w and r[x] == '#': x += 1
                d.append(f'M{x0 + ox} {y + oy}h{x - x0}v1h-{x - x0}z')
            else: x += 1
    return f"<svg xmlns='http://www.w3.org/2000/svg' width='{N}' height='{N}' viewBox='0 0 {N} {N}' shape-rendering='crispEdges'><path d='{''.join(d)}'/></svg>"
def url(rows): return 'url("data:image/svg+xml,' + urllib.parse.quote(svg_for(rows), safe="/:=' ").replace("'", '%27').replace(' ', '%20') + '")'

def main():
    out = ['/* v45 RETRO theme: TRUE 16 x 16 pixel-art icons (generated by tools/make_retro_icons.py; edit the bitmaps there, not here). Retro only: every rule is scoped to html[data-theme=retro].',
           '   Each icon is a CSS mask (inline SVG of unit squares, crispEdges) painted with currentColor on the existing <svg> element, whose vector children are hidden; 16 px = 1:1, section glyphs 32 / 48 px = 2x / 3x. */']
    ico = ['chevL', 'chevR', 'chevD', 'plus', 'close', 'external', 'triangleDown', 'check', 'lock', 'eye', 'eyeOff', 'pin', 'camera', 'image', 'calendar', 'comment', 'clock', 'trash', 'edit', 'upload', 'download', 'share', 'refresh']
    sel = ','.join(f'html[data-theme=retro] svg.ico-{n}' for n in ico + ['star'])
    out.append(sel + '{background:currentColor;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:16px 16px;mask-size:16px 16px;width:16px;height:16px;stroke:none;overflow:hidden}')
    out.append(','.join(f'html[data-theme=retro] svg.ico-{n}>*' for n in ico + ['star']) + '{display:none}')
    for n in ico:
        u = url(UI[n]); out.append(f'html[data-theme=retro] svg.ico-{n}{{-webkit-mask-image:{u};mask-image:{u}}}')
    u = url(UI['star']); uo = url(UI['starOutline'])
    out.append(f'html[data-theme=retro] svg.ico-star{{-webkit-mask-image:{uo};mask-image:{uo}}}')
    out.append(f'html[data-theme=retro] svg.ico-star[fill=currentColor]{{-webkit-mask-image:{u};mask-image:{u}}}')
    out.append('html[data-theme=retro] .ico-lg{width:32px;height:32px;-webkit-mask-size:32px 32px;mask-size:32px 32px}')
    out.append('html[data-theme=retro] .wheel-arrow .ico{width:16px;height:16px;fill:none;stroke:none}')
    sec = ','.join(f'html[data-theme=retro] svg.sec-glyph-{n}' for n in SEC)
    out.append(sec + '{background:currentColor;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:100% 100%;mask-size:100% 100%;fill:none}')
    out.append(','.join(f'html[data-theme=retro] svg.sec-glyph-{n}>*' for n in SEC) + '{display:none}')
    for n in SEC:
        u = url(SEC[n]); out.append(f'html[data-theme=retro] svg.sec-glyph-{n}{{-webkit-mask-image:{u};mask-image:{u}}}')
    open('css/retro-icons.css', 'w').write('\n'.join(out) + '\n')
    print('css/retro-icons.css', sum(len(x) for x in out), 'bytes')
    if '--preview' in sys.argv:
        from PIL import Image, ImageDraw
        names = [('ui', k) for k in UI] + [('sec', k) for k in SEC]; cols = 8; S = 10
        im = Image.new('RGB', (cols * (N * S + 10), ((len(names) + cols - 1) // cols) * (N * S + 24)), (43, 42, 42)); dr = ImageDraw.Draw(im)
        for i, (_, k) in enumerate(names):
            rows = grid((UI if _ == 'ui' else SEC)[k]); h, w = len(rows), len(rows[0]); ox, oy = (N - w) // 2, (N - h) // 2
            X, Y = (i % cols) * (N * S + 10), (i // cols) * (N * S + 24)
            dr.rectangle([X, Y + 14, X + N * S - 1, Y + 14 + N * S - 1], fill=(30, 30, 30)); dr.text((X, Y), k, fill=(200, 200, 200))
            for y, r in enumerate(rows):
                for x, ch in enumerate(r):
                    if ch == '#': dr.rectangle([X + (x + ox) * S, Y + 14 + (y + oy) * S, X + (x + ox + 1) * S - 2, Y + 14 + (y + oy + 1) * S - 2], fill=(235, 232, 226))
        im.save('retro-icons-sheet.png')
main()
