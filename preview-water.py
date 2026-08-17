# -*- coding: utf-8 -*-
"""
倒水效果预览工具 v2：瓶子不改样式，内部叠加水平面指示 + 牛奶渐变对比
用法：python preview-water.py  →  输出 _preview_water.png
"""
from PIL import Image, ImageDraw
from collections import deque
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

BG = (243, 239, 228, 255)
TIERS = [
    ('牛奶',   '#FFFFFF', '#E3D5B5', 1.00),
    ('可乐',   '#40251A', '#241209', 0.90),
    ('啤酒',   '#F2B33D', '#D98E1B', 0.85),
    ('红酒',   '#8E2434', '#6B1424', 0.82),
    ('白酒',   '#EDF5FB', '#C7DCEC', 0.50),
    ('茶',     '#B4692E', '#8A4A1C', 0.85),
    ('温奶',   '#FFFFFF', '#E3D5B5', 1.00),
]

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def mix(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))

def lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255

def silhouette_mask(im):
    W, H = im.size
    px = im.load()
    ext = [[False] * W for _ in range(H)]
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if px[x, y][3] < 30 and not ext[y][x]: ext[y][x] = True; q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if px[x, y][3] < 30 and not ext[y][x]: ext[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < W and 0 <= yy < H and not ext[yy][xx] and px[xx, yy][3] < 30:
                ext[yy][xx] = True; q.append((xx, yy))
    m = Image.new('L', (W, H), 0)
    mp = m.load()
    for y in range(H):
        for x in range(W):
            if not ext[y][x]: mp[x, y] = 255
    return m

def render_bottle(path, color, deep, alpha, tilt_deg, fill_frac, tile):
    """瓶子原样 + 屏幕水平液面线 + 线下轻微液色加深"""
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getbbox())
    scale = min(180 / im.size[1], 150 / im.size[0])
    im = im.resize((round(im.size[0] * scale), round(im.size[1] * scale)), Image.LANCZOS)
    mask = silhouette_mask(im)
    irot = im.rotate(-tilt_deg, expand=True, resample=Image.BICUBIC)
    mrot = mask.rotate(-tilt_deg, expand=True, resample=Image.BICUBIC)
    W, H = irot.size
    ox = (tile.size[0] - W) // 2
    oy = (tile.size[1] - H) // 2 + 10
    mpix = mrot.load()
    ys = [y for y in range(H) for x in range(W) if mpix[x, y] > 128]
    topY, botY = min(ys) + 6, max(ys) - 5
    surfY = oy + botY - fill_frac * (botY - topY)

    c_top, c_bot = hex_rgb(color), hex_rgb(deep)
    layer = Image.new('RGBA', tile.size, (0, 0, 0, 0))
    lp = layer.load()
    # 液面线色：瓶身暗 → 亮线；瓶身亮 → 墨线
    body_lum = lum(c_top)
    line_c = (255, 253, 245) if body_lum < 0.5 else (43, 42, 38)
    for y in range(tile.size[1]):
        for x in range(tile.size[0]):
            xx, yy = x - ox, y - oy
            if not (0 <= xx < W and 0 <= yy < H and mpix[xx, yy] > 128):
                continue
            if abs(y - surfY) <= 1.6:                       # 水平面线
                lp[x, y] = line_c + (235,)
            elif y > surfY:                                 # 线下液色轻染（渐变收敛）
                t = min(1, (y - surfY) / max(1, (oy + botY) - surfY))
                cc = mix(c_top, c_bot, t * 0.6)
                lp[x, y] = cc + (round(255 * 0.38 * alpha),)
    tile.alpha_composite(irot, (ox, oy))   # 瓶子原样在下
    tile.alpha_composite(layer, (0, 0))    # 液面叠加在上
    return tile

def render_cup(color_top, color_bot, alpha, tile, label):
    d = ImageDraw.Draw(tile)
    cx, bw, bh, by = tile.size[0] // 2, 90, 170, tile.size[1] - 55
    c_top, c_bot = hex_rgb(color_top), hex_rgb(color_bot)
    surfY = by - bh + 30
    for y in range(surfY, by):
        t = (y - surfY) / (by - surfY)
        d.line([(cx - bw // 2 + 6, y), (cx + bw // 2 - 6, y)], fill=mix(c_top, c_bot, t) + (round(255 * alpha),))
    d.rounded_rectangle([cx - bw // 2, by - bh, cx + bw // 2, by], 10, outline=(57, 57, 73, 255), width=4)
    d.text((cx - 45, by + 8), label, fill=(43, 42, 38, 255))
    return tile

# ---------- 拼图 ----------
COLS = 7
tile_w, tile_h = 200, 250
sheet = Image.new('RGBA', (COLS * tile_w, tile_h * 2 + 300), BG)
d = ImageDraw.Draw(sheet)
d.text((20, 8), '瓶子内置水平面 v2（瓶子不改样式，液面线始终屏幕水平；左=轻倾 右=满倾）', fill=(43, 42, 38, 255))

rest_tilts = [60, 63, 63, 66, 34, 34, 31]
for i, (name, color, deep, alpha) in enumerate(TIERS):
    for j, extra in enumerate((15, 50)):
        tile = Image.new('RGBA', (tile_w, tile_h), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        td.text((10, 2), '%s %d°' % (name, rest_tilts[i] + extra), fill=(43, 42, 38, 255))
        render_bottle('assets/containers/c%d.png' % (i + 1), color, deep, alpha,
                      rest_tilts[i] + extra, 0.72, tile)
        sheet.alpha_composite(tile, (i * tile_w, 24 + j * tile_h))

gy = 24 + tile_h * 2
d.text((20, gy + 4), '牛奶渐变对比（杯子里的液体）', fill=(43, 42, 38, 255))
variants = [
    ('A 现版(到底)', '#FFFFFF', '#E3D5B5'),
    ('B 柔和55%', '#FFFFFF', '#%02X%02X%02X' % mix(hex_rgb('#E3D5B5'), (255, 255, 255), 0.55)),
    ('C 柔和80%', '#FFFFFF', '#%02X%02X%02X' % mix(hex_rgb('#E3D5B5'), (255, 255, 255), 0.8)),
]
for k, (label, ct, cb) in enumerate(variants):
    tile = Image.new('RGBA', (220, 250), (0, 0, 0, 0))
    render_cup(ct, cb, 1.0, tile, label)
    sheet.alpha_composite(tile, (20 + k * 240, gy + 30))

sheet.convert('RGB').save('_preview_water.png')
print('OK -> _preview_water.png', sheet.size)
