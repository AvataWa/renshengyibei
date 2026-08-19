# -*- coding: utf-8 -*-
"""人生选择 3选1 界面预览图生成（静态 mockup）"""
from PIL import Image, ImageDraw, ImageFont

FONTS = r"E:\KimiData\daimon-share\daimon\runtime\python\fonts"
REG = FONTS + r"\NotoSansSC-Regular.ttf"
BOLD = FONTS + r"\NotoSansSC-Bold.ttf"

W, H = 1080, 1920
INK = "#2B2A26"
MUTED = "#8A857A"
PANEL = "#F6F1E3"
BG = "#9B978A"

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 背景装饰圆（呼应游戏主界面）
for (cx, cy, r) in [(160, 260, 70), (950, 180, 46), (880, 1780, 90), (120, 1650, 52), (540, 90, 34)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#A5A192")

def font(path, size):
    return ImageFont.truetype(path, size)

def ctext(cx, y, text, f, fill):
    bb = d.textbbox((0, 0), text, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, y), text, font=f, fill=fill)

def rrect(x0, y0, x1, y1, r, fill=None, outline=None, width=1):
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline, width=width)

# 主面板
PX0, PY0, PX1, PY1 = 70, 320, 1010, 1700
rrect(PX0, PY0, PX1, PY1, 36, fill=PANEL)

ctext(W // 2, 392, "人生路口", font(BOLD, 66), INK)
ctext(W // 2, 498, "进步 · 职场新人·上手 —— 选择一种际遇", font(REG, 30), MUTED)

CARDS = [
    dict(tag="对而艰难的事", tag_c="#E0861A", tag_bg="#FBEBD2",
         name="深夜改稿", effect="完美范围 −30%，完美一次直接计 2 连",
         flavor="改得动的方案，改不动的 Deadline。", border=None),
    dict(tag="踏实稳定的事", tag_c="#2EA85C", tag_bg="#DFF0E4",
         name="按时吃饭", effect="完美范围 +10%，完成范围 +10%",
         flavor="三餐规律的人，运气都不会太差。", border=None),
    dict(tag="可遇不可求的事", tag_c="#B07A12", tag_bg="#F7E9C8",
         name="赤子之心 ◆", effect="抽出后随机选定段位生效",
         flavor="愿你走过半生，仍记得最初的味道。", border="#E8A33D", rare=True),
]

CARD_X0, CARD_X1 = 120, 960
CARD_H, GAP, Y = 320, 44, 590
for c in CARDS:
    y0, y1 = Y, Y + CARD_H
    if c["border"]:
        rrect(CARD_X0, y0, CARD_X1, y1, 28, fill="#FFFFFF", outline=c["border"], width=6)
    else:
        rrect(CARD_X0, y0, CARD_X1, y1, 28, fill="#FFFFFF", outline="#E4DDC9", width=2)
    # 分类 chip（居中；稀有卡左侧手绘小菱形）
    tf = font(BOLD, 26)
    bb = d.textbbox((0, 0), c["tag"], font=tf)
    tw = bb[2] - bb[0]
    extra = 26 if c.get("rare") else 0
    cx0 = (W - tw - extra) / 2 - 20
    rrect(cx0, y0 + 34, cx0 + tw + 40 + extra, y0 + 82, 24, fill=c["tag_bg"])
    if c.get("rare"):
        dx, dy, ds = cx0 + 24, y0 + 58, 9
        d.polygon([(dx, dy - ds), (dx + ds, dy), (dx, dy + ds), (dx - ds, dy)], fill=c["tag_c"])
        d.text((cx0 + 20 + extra, y0 + 43), c["tag"], font=tf, fill=c["tag_c"])
    else:
        ctext(W // 2, y0 + 43, c["tag"], tf, c["tag_c"])
    # 名称 / 效果 / 感悟
    ctext(W // 2, y0 + 112, c["name"], font(BOLD, 54), INK)
    ctext(W // 2, y0 + 204, c["effect"], font(REG, 33), "#3A3833")
    ctext(W // 2, y0 + 264, c["flavor"], font(REG, 25), MUTED)
    Y = y1 + GAP

ctext(W // 2, 1650, "选择后本局生效 · 点击卡片做出选择", font(REG, 26), MUTED)

out = r"E:\KimiData\kimi\workspace\water-game\choice-preview.png"
img.save(out)
print("saved:", out)

# ────────── 第二张：段位之力 二选一 ──────────
img2 = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img2)
for (cx, cy, r) in [(160, 260, 70), (950, 180, 46), (880, 1780, 90), (120, 1650, 52), (540, 90, 34)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#A5A192")

PX0, PY0, PX1, PY1 = 70, 500, 1010, 1530
rrect(PX0, PY0, PX1, PY1, 36, fill=PANEL)
ctext(W // 2, 585, "段位之力 ◆", font(BOLD, 66), INK)
ctext(W // 2, 700, "两种力量同时涌现 · 选择其一", font(REG, 30), MUTED)

FX_CARDS = [
    dict(name="麦芽之力 · 酒逢知己", effect="连击额外 +1 分", flavor="未来可期之力注入了这一杯。"),
    dict(name="麦芽之力 · 整点毕业", effect="立即 +8 分", flavor="未来可期之力注入了这一杯。"),
]
CARD_X0, CARD_X1 = 120, 960
CARD_H, GAP, Y = 300, 50, 790
for c in FX_CARDS:
    y0, y1 = Y, Y + CARD_H
    rrect(CARD_X0, y0, CARD_X1, y1, 28, fill="#FFFFFF", outline="#E8A33D", width=6)
    ctext(W // 2, y0 + 92, c["name"], font(BOLD, 50), INK)
    ctext(W // 2, y0 + 178, c["effect"], font(REG, 34), "#3A3833")
    ctext(W // 2, y0 + 240, c["flavor"], font(REG, 25), "#B07A12")
    Y = y1 + GAP

ctext(W // 2, 1470, "点击卡片做出选择", font(REG, 26), MUTED)

out2 = r"E:\KimiData\kimi\workspace\water-game\choice2-preview.png"
img2.save(out2)
print("saved:", out2)
