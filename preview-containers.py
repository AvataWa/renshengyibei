# 1) 去掉可乐瓶盖（c2.png 顶部红色瓶盖），重测锚点
# 2) 按游戏几何合成全部 7 个容器的静止/倾倒预览，校验放大后的落位
from PIL import Image
import math, json, os

H, W = 667, 375
cupH = H * 0.28
halfW = cupH / (2 * 1.2)          # 参考杯（收口杯 aspect 1.2）
cx = W / 2
baseY = H * 0.74
cupTop = baseY - cupH
spout = (cx - halfW * 0.18, cupTop - H * 0.10)
bucketH = H * 0.1456              # 改为固定值，不再随杯高变化
K = 2.2                           # 全局放大倍数（drawBucket 中 bh * K * cfg.scale）

# ---------- 1. 去可乐瓶盖 ----------
c2 = Image.open('assets/containers/c2.png').convert('RGBA')
px = c2.load()
for y in range(0, 120):
    for x in range(c2.width):
        r, g, b, a = px[x, y]
        if a > 0 and r > 170 and g < 90 and b < 90:   # 瓶盖亮红色
            px[x, y] = (0, 0, 0, 0)
# 清掉因去盖而悬空的细渣：重测 alpha bbox
alpha = c2.getchannel('A')
bbox = alpha.getbbox()
c2 = c2.crop(bbox)
c2.save('assets/containers/c2.png')
# 新锚点：最高点（瓶口）
ay = 0
col = c2.getchannel('A')
for y in range(c2.height):
    xs = [x for x in range(c2.width) if col.getpixel((x, y)) > 16]
    if xs:
        ay = y
        ax = sum(xs) / len(xs)
        break
print('c2 去盖后:', c2.size, 'anchor =', round(ax / c2.width, 3), round(ay / c2.height, 3))

# ---------- 2. 合成预览 ----------
cfg = json.loads(json.dumps([
    {"f": "c1", "anchor": (0.506, 0.006), "rest": 1.05, "scale": 1.3, "pivotDx": -0.08},
    {"f": "c2", "anchor": (ax / c2.width, max(ay, 1) / c2.height), "rest": 1.1, "scale": 1.3, "pivotDx": -0.08},
    {"f": "c3", "anchor": (0.495, 0.007), "rest": 1.1, "scale": 1.3, "pivotDx": -0.08},
    {"f": "c4", "anchor": (0.507, 0.006), "rest": 1.15, "scale": 1.3, "pivotDx": -0.08},
    {"f": "c5", "anchor": (0.989, 0.157), "rest": 0.6, "scale": 1.0, "pivotDx": 0.10, "pivotDy": -0.07},
    {"f": "c6", "anchor": (0.989, 0.331), "rest": 0.6, "scale": 1.0, "pivotDx": 0.12, "pivotDy": -0.07},
    {"f": "c7", "anchor": (0.99, 0.459), "rest": 0.55, "scale": 1.0, "pivotDx": 0.16, "pivotDy": -0.08},
]))

def draw_state(canvas, c, angle):
    img = Image.open(f"assets/containers/{c['f']}.png").convert('RGBA')
    dh = bucketH * K * c['scale']
    dw = dh * (img.width / img.height)
    img = img.resize((round(dw), round(dh)), Image.LANCZOS)
    a = c['rest'] + angle                      # canvas 顺时针
    axp, ayp = c['anchor'][0] * img.width, c['anchor'][1] * img.height
    # 绕图心旋转（expand），再手工推算锚点新坐标（PIL 的 center+expand 在大角度有兼容问题）
    rot = img.rotate(-math.degrees(a), expand=True, resample=Image.BICUBIC)
    nw, nh = rot.size
    cxx, cyy = img.width / 2, img.height / 2
    ca, sa = math.cos(a), math.sin(a)
    # 顺时针 a 弧度：(dx,dy) → (dx*ca + dy*sa, -dx*sa + dy*ca)
    dx, dy = axp - cxx, ayp - cyy
    ax2 = dx * ca + dy * sa + nw / 2
    ay2 = -dx * sa + dy * ca + nh / 2
    sx = spout[0] + c.get('pivotDx', 0) * W
    sy = spout[1] + c.get('pivotDy', 0) * H
    px_, py_ = sx - ax2, sy - ay2
    canvas.paste(rot, (round(px_), round(py_)), rot)
    return (px_, py_, nw, nh)

for state, angle in [('rest', 0), ('pour', 0.45)]:
    cv = Image.new('RGBA', (W, H), (245, 240, 225, 255))
    # 参考杯剪影
    from PIL import ImageDraw
    d = ImageDraw.Draw(cv)
    d.ellipse([cx - halfW, cupTop, cx + halfW, baseY], outline=(74, 59, 42, 255), width=4)
    d.ellipse([spout[0] - 4, spout[1] - 4, spout[0] + 4, spout[1] + 4], fill=(255, 0, 0, 255))
    infos = []
    for c in cfg:
        infos.append((c['f'],) + draw_state(cv, c, angle))
    cv.convert('RGB').save(f'pv-{state}.png')
    print(state, [(f, f"bbox=({px_:.0f},{py_:.0f},{nw:.0f}x{nh:.0f})") for f, px_, py_, nw, nh in infos])

# ---------- 3. 壶类自动适配 scale：静止/倾倒两种状态下都完整落在屏内 ----------
def fits(c, s):
    for angle in (0, 0.5):
        cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c2_ = dict(c); c2_['scale'] = s
        px_, py_, nw, nh = draw_state(cv, c2_, angle)
        if px_ < 8 or py_ < 8 or px_ + nw > W - 8 or py_ + nh > H - 8:
            return False
    return True

for c in cfg:
    s = c['scale']
    while s > 0.2 and not fits(c, s):
        s -= 0.02
    c['scale'] = round(s, 2)
    print(c['f'], 'fitted scale =', c['scale'], 'pivotDx =', c.get('pivotDx', 0), 'rest =', c['rest'])

# ---------- 4. 单格拼图：每容器一格（左静止 / 右倾倒），便于逐个检查 ----------
from PIL import ImageDraw
def panel(c, angle):
    cv = Image.new('RGBA', (W, H), (245, 240, 225, 255))
    d = ImageDraw.Draw(cv)
    d.ellipse([cx - halfW, cupTop, cx + halfW, baseY], outline=(74, 59, 42, 255), width=4)
    draw_state(cv, c, angle)
    sx = spout[0] + c.get('pivotDx', 0) * W
    sy = spout[1] + c.get('pivotDy', 0) * H
    d.ellipse([sx - 4, sy - 4, sx + 4, sy + 4], fill=(255, 0, 0, 255))
    return cv.resize((W // 2, H // 2), Image.LANCZOS)

for state, angle in [('rest', 0), ('pour', 0.5)]:
    row = Image.new('RGB', (W // 2 * 7, H // 2), (255, 255, 255))
    for i, c in enumerate(cfg):
        row.paste(panel(c, angle).convert('RGB'), (i * W // 2, 0))
    row.save(f'pv-grid-{state}.png')
print('grids saved')
