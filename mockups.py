# 按参考图风格（奶油米底 + 黑白大圆角卡片 + 黄色强调）绘制 3 张 UI 示意图
# 输出：mockups/ui-mock-1-menu.png / ui-mock-2-play.png / ui-mock-3-over.png
from PIL import Image, ImageDraw, ImageFont
import math, os

S = 2                      # 2 倍超采样，最后缩回
W, H = 468, 1014           # 与参考图同尺寸
BG = (231, 226, 211)       # 奶油米
INK = (43, 42, 38)         # 近黑
CARD_W = (247, 245, 238)   # 卡片白
YEL = (242, 201, 76)       # 强调黄
MUTED = (142, 138, 126)    # 灰
FRAME = (58, 57, 52)       # 外框深灰
GREEN = (155, 200, 120)    # 完美区绿
BLUE = (122, 170, 210)     # 奶瓶环蓝

FONT_DIR = r'E:\KimiData\daimon-share\daimon\runtime\python\fonts'
def fb(sz): return ImageFont.truetype(os.path.join(FONT_DIR, 'NotoSansSC-Bold.ttf'), sz * S)
def fr(sz): return ImageFont.truetype(os.path.join(FONT_DIR, 'NotoSansSC-Regular.ttf'), sz * S)

def new_screen():
    img = Image.new('RGB', (W * S, H * S), FRAME)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6 * S, 6 * S, (W - 6) * S, (H - 6) * S], radius=52 * S, fill=BG)
    return img, d

def rr(d, x, y, w, h, r, fill):
    d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=r * S, fill=fill)

def text(d, x, y, s, font, fill=INK, anchor='la'):
    d.text((x * S, y * S), s, font=font, fill=fill, anchor=anchor)

def icon_dots(d, x, y):   # 四点小图标
    rr(d, x, y, 44, 44, 14, (214, 209, 194))
    for i in range(2):
        for j in range(2):
            d.ellipse([(x + 14 + i * 14) * S, (y + 14 + j * 14) * S, (x + 20 + i * 14) * S, (y + 20 + j * 14) * S], fill=INK)

def icon_person(d, x, y):
    rr(d, x, y, 44, 44, 14, (214, 209, 194))
    d.ellipse([(x + 16) * S, (y + 11) * S, (x + 28) * S, (y + 23) * S], outline=INK, width=2 * S)
    d.arc([(x + 11) * S, (y + 24) * S, (x + 33) * S, (y + 42) * S], 200, 340, fill=INK, width=2 * S)

def baby_bottle(d, x, y, sc=1.0, angle=0):
    """扁平奶瓶图标：白身 + 蓝环 + 奶嘴。在独立图层绘制后旋转贴上。"""
    lw, lh = int(120 * sc * S), int(150 * sc * S)
    lay = Image.new('RGBA', (lw, lh), (0, 0, 0, 0))
    g = ImageDraw.Draw(lay)
    bw, bh = int(64 * sc * S), int(86 * sc * S)   # 瓶身
    bx, by = (lw - bw) // 2, lh - bh
    g.rounded_rectangle([bx, by, bx + bw, by + bh], radius=int(14 * sc * S), fill=(255, 255, 255, 255), outline=INK + (255,), width=2 * S)
    for i in range(4):  # 刻度
        yy = by + int((16 + i * 16) * sc * S)
        g.line([bx + int(10 * sc * S), yy, bx + int(22 * sc * S), yy], fill=MUTED + (255,), width=2 * S)
    rw, rh = int(70 * sc * S), int(16 * sc * S)   # 蓝环
    g.rounded_rectangle([(lw - rw) // 2, by - rh, (lw + rw) // 2, by], radius=int(8 * sc * S), fill=BLUE + (255,), outline=INK + (255,), width=2 * S)
    g.polygon([(lw // 2 - int(12 * sc * S), by - rh), (lw // 2 + int(12 * sc * S), by - rh),
               (lw // 2 + int(5 * sc * S), by - rh - int(26 * sc * S)), (lw // 2 - int(5 * sc * S), by - rh - int(26 * sc * S))],
              fill=(255, 244, 214, 255), outline=INK + (255,))
    return lay.rotate(angle, expand=True, resample=Image.BICUBIC)

def cup_glyph(d, x, y, c=YEL):  # 底部导航杯形
    d.polygon([(x * S, y * S), ((x + 22) * S, y * S), ((x + 18) * S, (y + 18) * S), ((x + 4) * S, (y + 18) * S)], fill=c)

def bar_glyph(d, x, y):
    for i, hh in enumerate([10, 16, 22]):
        d.rounded_rectangle([(x + i * 10) * S, (y + 22 - hh) * S, (x + i * 10 + 6) * S, (y + 22) * S], radius=3 * S, fill=INK)

def bottom_nav(d):
    rr(d, 90, 890, 110, 74, 36, INK)
    d.polygon([(140 * S, 952 * S), (140 * S, 922 * S), (160 * S, 910 * S), (180 * S, 922 * S), (180 * S, 952 * S)], fill=YEL)
    rr(d, 147, 934, 26, 18, 4, YEL)  # 杯中液
    bar_glyph(d, 330, 918)

# ============ 1. 主界面 ============
img, d = new_screen()
icon_dots(d, 46, 74)
icon_person(d, W - 90, 74)
text(d, 46, 190, '人生一杯', fb(44))
text(d, 46, 246, '从第一杯奶，到最后一杯奶', fr(17), MUTED)

# 黑色主卡：当前段位 + 开始
rr(d, 46, 300, 230, 300, 26, INK)
bt = baby_bottle(d, 0, 0, 0.9, 0)
img.paste(bt, (int(96 * S), int(320 * S)), bt)
text(d, 70, 512, '当前段位', fr(15), (200, 196, 186))
text(d, 70, 540, '奶瓶萌新', fb(24), (255, 255, 255))
rr(d, 180, 524, 76, 56, 28, YEL)
d.polygon([(206 * S, 538 * S), (206 * S, 566 * S), (232 * S, 552 * S)], fill=INK)

# 白卡：历史最高
rr(d, 292, 300, 176, 140, 26, CARD_W)
text(d, 314, 330, '历史最高', fr(15), MUTED)
text(d, 314, 356, '40', fb(36))

# 白卡：段位进度
rr(d, 292, 460, 176, 140, 26, CARD_W)
text(d, 314, 490, '升段进度', fr(15), MUTED)
rr(d, 314, 530, 130, 12, 6, (228, 223, 208))
rr(d, 314, 530, 130 * 0.65, 12, 6, YEL)
text(d, 314, 556, '距可乐少年 8 分', fr(12), MUTED)

# 白卡：操作方式
rr(d, 46, 640, 422, 120, 26, CARD_W)
text(d, 70, 672, '操作方式', fr(15), MUTED)
text(d, 70, 700, '按住屏幕倒水 · 松手停止', fb(20))
rr(d, 370, 668, 74, 56, 28, (228, 223, 208))
d.ellipse([396 * S, 688 * S, 412 * S, 704 * S], fill=CARD_W)

bottom_nav(d)
img.resize((W, H), Image.LANCZOS).save('mockups/ui-mock-1-menu.png')

# ============ 2. 游戏界面 ============
img, d = new_screen()
rr(d, 46, 74, 130, 48, 24, INK)              # 段位胶囊
text(d, 111, 98, '奶瓶萌新', fb(17), (255, 255, 255), 'mm')
text(d, W / 2, 180, '12', fb(56), anchor='mm')  # 大分数
text(d, W / 2, 222, '第 3 杯 · 最高 40', fr(14), MUTED, 'mm')
rr(d, W - 196, 74, 150, 48, 24, CARD_W)      # 饮品标签
text(d, W - 121, 98, '牛奶 · 七分满', fb(15), INK, 'mm')

# 桌面
d.rectangle([0, 838 * S, W * S, H * S], fill=(216, 203, 178))
d.line([0, 838 * S, W * S, 838 * S], fill=INK, width=3 * S)

# 杯子（扁平侧视 + 刻度区 + 奶）
cx, cup_top, cup_h, cup_half = W / 2, 560, 220, 95
d.polygon([((cx - cup_half) * S, cup_top * S), ((cx + cup_half) * S, cup_top * S),
           ((cx + cup_half * 0.82) * S, (cup_top + cup_h) * S), ((cx - cup_half * 0.82) * S, (cup_top + cup_h) * S)],
          fill=(243, 238, 224), outline=INK, width=4 * S)
zq, zp = (0.58, 0.84), (0.67, 0.77)  # 功夫茶杯刻度区
d.rectangle([(cx - cup_half + 6) * S, (cup_top + cup_h * (1 - zq[1])) * S, (cx + cup_half - 6) * S, (cup_top + cup_h * (1 - zq[0])) * S], fill=(247, 225, 150))
d.rectangle([(cx - cup_half + 6) * S, (cup_top + cup_h * (1 - zp[1])) * S, (cx + cup_half - 6) * S, (cup_top + cup_h * (1 - zp[0])) * S], fill=(205, 230, 175))
lvl = 0.70
d.polygon([((cx - cup_half + 6) * S, (cup_top + cup_h * (1 - lvl)) * S), ((cx + cup_half - 6) * S, (cup_top + cup_h * (1 - lvl)) * S),
           ((cx + cup_half * 0.82 - 6) * S, (cup_top + cup_h - 4) * S), ((cx - cup_half * 0.82 + 6) * S, (cup_top + cup_h - 4) * S)],
          fill=(255, 255, 255))
d.line([(cx - cup_half + 8) * S, (cup_top + cup_h * (1 - lvl)) * S, (cx + cup_half - 8) * S, (cup_top + cup_h * (1 - lvl)) * S], fill=(150, 128, 92), width=3 * S)

# 奶瓶（倾倒态）+ 奶流
bt = baby_bottle(d, 0, 0, 1.25, 108)
img.paste(bt, (int(96 * S), int(300 * S)), bt)
surf_y = cup_top + cup_h * (1 - lvl)
d.line([300 * S, 420 * S, (cx - 20) * S, surf_y * S], fill=(150, 128, 92), width=10 * S)   # 奶流描边
d.line([300 * S, 420 * S, (cx - 20) * S, surf_y * S], fill=(255, 255, 255), width=5 * S)  # 奶流本体

# 底部按压按钮
rr(d, W / 2 - 110, 880, 220, 64, 32, INK)
d.ellipse([(W / 2 - 88) * S, 906 * S, (W / 2 - 74) * S, 920 * S], fill=YEL)
text(d, W / 2 + 14, 912, '按住倒水', fb(20), (255, 255, 255), 'mm')
img.resize((W, H), Image.LANCZOS).save('mockups/ui-mock-2-play.png')

# ============ 3. 结算界面 ============
img, d = new_screen()
icon_dots(d, 46, 74)
icon_person(d, W - 90, 74)
rr(d, 46, 220, W - 92, 420, 30, INK)
text(d, W / 2, 280, '本局结束', fr(17), (200, 196, 186), 'mm')
text(d, W / 2, 380, '40', fb(80), (255, 255, 255), 'mm')
text(d, W / 2, 440, '★ 新纪录 ★', fb(18), YEL, 'mm')
rr(d, W / 2 - 100, 480, 200, 52, 26, YEL)    # 段位胶囊
text(d, W / 2, 506, '可乐少年 · 上学', fb(18), INK, 'mm')
text(d, W / 2, 570, '距「啤酒青年」还差 13 分 · 累计 47 分', fr(14), (200, 196, 186), 'mm')

rr(d, W / 2 - 130, 700, 260, 68, 34, YEL)    # 再来一局
text(d, W / 2, 734, '再来一局', fb(22), INK, 'mm')
rr(d, W / 2 - 130, 792, 260, 68, 34, CARD_W) # 返回主页
text(d, W / 2, 826, '返回主页', fb(22), INK, 'mm')
bottom_nav(d)
img.resize((W, H), Image.LANCZOS).save('mockups/ui-mock-3-over.png')

print('saved 3 mockups')
