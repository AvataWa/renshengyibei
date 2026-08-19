# -*- coding: utf-8 -*-
"""人生选择 新布局预览图（横排竖卡 + 已做选择面板）"""
from PIL import Image, ImageDraw, ImageFont

FONTS = r"E:\KimiData\daimon-share\daimon\runtime\python\fonts"
REG = FONTS + r"\NotoSansSC-Regular.ttf"
BOLD = FONTS + r"\NotoSansSC-Bold.ttf"

W, H = 1080, 1920
INK = "#2B2A26"
MUTED = "#8A857A"
PANEL = "#F6F1E3"
TRACK = "#E4DDC9"
BG = "#9B978A"

def font(path, size):
    return ImageFont.truetype(path, size)

def wrap(d, text, f, maxw):
    lines, cur = [], ""
    for ch in text:
        if cur and d.textlength(cur + ch, font=f) > maxw:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur: lines.append(cur)
    return lines

def new_canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for (cx, cy, r) in [(160, 260, 70), (950, 180, 46), (880, 1780, 90), (120, 1650, 52), (540, 90, 34)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#A5A192")
    # 桌子
    d.rectangle([0, int(H * 0.86), W, H], fill="#8A857A")
    d.line([0, int(H * 0.86), W, int(H * 0.86)], fill=INK, width=5)
    return img, d

def ctext(d, cx, y, text, f, fill):
    d.text((cx - d.textlength(text, font=f) / 2, y), text, font=f, fill=fill)

def rrect(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def draw_cards(d, cards, y0, ch, px, side, gap, pw):
    cw = (pw - side * 2 - gap * (len(cards) - 1)) / len(cards)
    for i, c in enumerate(cards):
        cx = px + side + i * (cw + gap)
        rare = c.get("rare")
        rrect(d, [cx, y0, cx + cw, y0 + ch], 30, fill="#FFFFFF",
              outline="#E8A33D" if rare else TRACK, width=8 if rare else 3)
        mid = cx + cw / 2
        # chip
        tf = font(BOLD, 30)
        tag = ("◆ " if rare else "") + c["tag"]
        tw = d.textlength(tag, font=tf)
        chy = y0 + ch * 0.055
        chh = 56
        rrect(d, [mid - tw / 2 - 22, chy, mid + tw / 2 + 22, chy + chh], 28, fill=c["tag_bg"])
        d.text((mid - tw / 2, chy + 10), tag, font=tf, fill=c["tag_c"])
        # 名称
        nf = font(BOLD, 52)
        for j, ln in enumerate(wrap(d, c["name"], nf, cw - 30)[:2]):
            ctext(d, mid, y0 + ch * 0.20 + j * 64, ln, nf, INK)
        # 效果
        ef = font(REG, 34)
        for j, ln in enumerate(wrap(d, c["effect"], ef, cw - 36)[:5]):
            ctext(d, mid, y0 + ch * 0.40 + j * 50, ln, ef, "#3A3833")
        # 感悟
        ff = font(REG, 27)
        for j, ln in enumerate(wrap(d, c["flavor"], ff, cw - 36)[:4]):
            ctext(d, mid, y0 + ch * 0.74 + j * 40, ln, ff, MUTED)

CATS = {
    "A": ("对而艰难的事", "#E0861A", "#FBEBD2"),
    "B": ("踏实稳定的事", "#2EA85C", "#DFF0E4"),
    "D": ("可遇不可求的事", "#B07A12", "#F7E9C8"),
}
def card(cat, name, effect, flavor, rare=False):
    t, c, bg = CATS[cat]
    return dict(tag=t, tag_c=c, tag_bg=bg, name=name, effect=effect, flavor=flavor, rare=rare)

# ── 图 1：三选一横排 ──
img, d = new_canvas()
# 杯子剪影（表示局内画面保留）
rrect(d, [W//2 - 130, 1150, W//2 + 130, 1620], 26, outline=INK, width=8)

PX, PY, PW, PH = 50, 220, 980, 1100
rrect(d, [PX, PY, PX + PW, PY + PH], 40, fill=PANEL, outline=TRACK, width=5)
ctext(d, W // 2, 300, "人生路口", font(BOLD, 80), INK)
ctext(d, W // 2, 430, "元气少年 · 选择一种际遇", font(REG, 34), MUTED)

cards = [
    card("A", "深夜改稿", "完美范围 −30%，完美一次直接计 2 连", "改得动的方案，改不动的 Deadline。"),
    card("B", "按时吃饭", "完美范围 +10%，完成范围 +10%", "三餐规律的人，运气都不会太差。"),
    card("D", "赤子之心 ◆", "抽出后随机选定段位生效", "愿你走过半生，仍记得最初的味道。", rare=True),
]
draw_cards(d, cards, PY + 260, 730, PX, 108, 52, PW)
ctext(d, W // 2, PY + PH - 60, "选择后本局生效 · 点击卡片做出选择", font(REG, 30), MUTED)

# 底部：操作提示 + 已做选择按钮
ctext(d, W // 2, 1740, "按住屏幕倒水", font(BOLD, 52), "#F6F1E3")
bx, by, bw, bh = 790, 1720, 260, 92
rrect(d, [bx, by + 6, bx + bw, by + bh + 6], 46, fill="#7A766B")
rrect(d, [bx, by, bx + bw, by + bh], 46, fill=PANEL, outline=TRACK, width=3)
ctext(d, bx + bw / 2, by + 22, "已做选择 2", font(BOLD, 38), INK)

out1 = r"E:\KimiData\kimi\workspace\water-game\choice-preview.png"
img.save(out1)
print("saved:", out1)

# ── 图 2：已做选择面板 ──
img, d = new_canvas()
PX, PY, PW, PH = 86, 290, 908, 1230
rrect(d, [PX, PY, PX + PW, PY + PH], 40, fill=PANEL, outline=TRACK, width=5)
ctext(d, W // 2, 380, "本局际遇（5）", font(BOLD, 70), INK)

items = [
    ("B", "按时吃饭", "完美范围 +10%，完成范围 +10%"),
    ("A", "高压考核", "取消误触保护，每杯 +1 分"),
    ("D", "赤子之心 ◆", "抽中麦芽之力 · 整点毕业"),
    ("B", "记账习惯", "预告下一杯杯型"),
    ("A", "极限冲刺", "接下来 10 杯出水 +30%，每杯 +2 分"),
]
ly, lh, item_h = PY + 190, PH - 190 - 170, 138
for i, (cat, name, desc) in enumerate(items):
    iy = ly + i * item_h
    t, c, bg = CATS[cat]
    rrect(d, [PX + 54, iy + 8, PX + PW - 54, iy + item_h - 8], 24, fill="#FFFFFF")
    d.ellipse([PX + 84, iy + item_h / 2 - 10, PX + 104, iy + item_h / 2 + 10], fill=c)
    d.text((PX + 130, iy + 26), name, font=font(BOLD, 40), fill=INK)
    d.text((PX + 130, iy + 82), desc, font=font(REG, 30), fill=MUTED)
# 滚动条
rrect(d, [PX + PW - 40, ly, PX + PW - 30, ly + 300], 5, fill="#C9C3B2")
# 关闭按钮
cw2, ch2 = 430, 96
cx2, cy2 = W // 2 - cw2 // 2, PY + PH - 130
rrect(d, [cx2, cy2, cx2 + cw2, cy2 + ch2], 48, fill=INK)
ctext(d, W // 2, cy2 + 24, "关闭", font(BOLD, 40), PANEL)

out2 = r"E:\KimiData\kimi\workspace\water-game\choice2-preview.png"
img.save(out2)
print("saved:", out2)
