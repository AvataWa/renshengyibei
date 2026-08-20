# -*- coding: utf-8 -*-
"""人生路口 · 竖排三行卡新布局预览（与 game.js drawChoice/drawChoiceRows 参数一致）"""
from PIL import Image, ImageDraw, ImageFont

FONTS = r"E:\KimiData\daimon-share\daimon\runtime\python\fonts"
REG = FONTS + r"\NotoSansSC-Regular.ttf"
BOLD = FONTS + r"\NotoSansSC-Bold.ttf"

W, H = 750, 1334  # 接近手机逻辑分辨率
INK = "#2B2A26"; MUTED = "#8A857A"; PANEL = "#F6F1E3"; TRACK = "#E4DDC9"
WHITE = "#FFFFFF"; DESC = "#3A3833"; RARE = "#E8A33D"

CATS = {
    "A": ("对而艰难的事", "#E0861A", "#FBEBD2"),
    "B": ("踏实稳定的事", "#2EA85C", "#DFF0E4"),
    "C": ("出奇制胜的事", "#5B8DEF", "#DFE8FB"),
}
CARDS = [
    ("A", "寒窗苦读", "完美范围 −20%，每次完美 +1 分", "把难的事做久一点，分数会替你记得。"),
    ("B", "按时吃饭", "完美 +10%，完成 +10%", "三餐规律的人，运气都不会太差。"),
    ("C", "破釜沉舟", "完成 −30%，完美 +30%", "砸了锅，才知道自己能走多远。"),
]

def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

img = Image.new("RGB", (W, H), "#9B978A")
d = ImageDraw.Draw(img, "RGBA")
d.rectangle([0, 0, W, H], fill=(43, 42, 38, 115))  # 半透压暗

px, py, pw, ph = W * 0.045, H * 0.115, W * 0.91, H * 0.575
rr(d, [px, py, px + pw, py + ph], 20, fill=PANEL, outline=TRACK, width=3)

def ctext(cx, y, text, f, fill):
    d.text((cx - d.textlength(text, font=f) / 2, y), text, font=f, fill=fill)

def fit(text, maxw, base, mn, bold):
    p = base
    while p > mn:
        f = ImageFont.truetype(BOLD if bold else REG, int(p))
        if d.textlength(text, font=f) <= maxw: return f
        p -= 1
    return ImageFont.truetype(BOLD if bold else REG, int(mn))

ctext(W / 2, py + H * 0.058 - H * 0.019, "人生路口", ImageFont.truetype(BOLD, int(H * 0.038)), INK)
ctext(W / 2, py + H * 0.098 - H * 0.0085, "未来可期 · 选择一种际遇", ImageFont.truetype(REG, int(H * 0.017)), MUTED)

y0, gap = py + H * 0.125, H * 0.012
rowH = (ph - H * 0.125 - H * 0.05 - gap * 2) / 3
cx = px + W * 0.032; cw = pw - W * 0.064

for i, (cat, name, desc, flavor) in enumerate(CARDS):
    cy = y0 + i * (rowH + gap)
    rr(d, [cx, cy, cx + cw, cy + rowH], 14, fill=WHITE, outline=TRACK, width=2)
    label, color, bg = CATS[cat]
    cf = ImageFont.truetype(BOLD, int(H * 0.0145))
    tw_ = d.textlength(label, font=cf)
    chipH = H * 0.03; chipW = tw_ + 22
    chipX = cx + W * 0.02; chipY = cy + rowH / 2 - chipH / 2
    rr(d, [chipX, chipY, chipX + chipW, chipY + chipH], chipH / 2, fill=bg)
    d.text((chipX + 11, chipY + chipH * 0.72 - int(H * 0.0145)), label, font=cf, fill=color)
    tx = chipX + chipW + W * 0.026
    tw = cx + cw - tx - W * 0.018
    d.text((tx, cy + rowH * 0.30 - int(H * 0.021)), name, font=fit(name, tw, H * 0.021, H * 0.016, True), fill=INK)
    d.text((tx, cy + rowH * 0.60 - int(H * 0.015)), desc, font=fit(desc, tw, H * 0.015, H * 0.0105, False), fill=DESC)
    d.text((tx, cy + rowH * 0.85 - int(H * 0.0125)), flavor, font=fit(flavor, tw, H * 0.0125, H * 0.01, False), fill=MUTED)

ctext(W / 2, py + ph - H * 0.022 - H * 0.007, "选择后本局生效 · 点击卡片做出选择", ImageFont.truetype(REG, int(H * 0.014)), MUTED)

img.save("choice-rows-preview.png")
print("saved choice-rows-preview.png")
