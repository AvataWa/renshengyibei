# -*- coding: utf-8 -*-
"""
游戏画风预览渲染器
按 game.js drawCup() 同款画法渲染提取的杯子:
  玻璃高光 / 三色分区 / 渐变液体 / 开口杯壁描边 / 加粗杯底 / 贝塞尔耳形把手
把手参数(t1/t2/out)从参考图把手实际几何回算, 不再是统一占位符
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from extract_profiles import (HERE, META, find_components, row_widths_outline,
                              catmull)

INK = (43, 42, 38)
DRINK = dict(color="#F2B33D", deep="#D98E1B", alpha=0.85)   # 麦芽色预览
S = 3                       # 超采样
CUP_H = 300                 # 逻辑杯高(px)


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def bez(p0, p1, p2, p3, n=26):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def detect_handle(src_name, idx):
    """回算第 idx 只杯的把手参数: t1/t2(附着高度) + out(外扩, 相对最大半宽)"""
    cfg = META[src_name]
    a = np.asarray(Image.open(HERE / src_name).convert("L"))
    mask = a < cfg["thresh"]
    comps = find_components(mask, cfg["mode"])
    x0, y0, x1, y1 = comps[idx]
    sub = mask[y0:y1 + 1, x0:x1 + 1]
    H, W = sub.shape
    w = row_widths_outline(sub)          # 杯身全宽(不含把手)
    # 复算中心线(与 row_widths_outline 同法)
    left = np.full(H, np.nan)
    right = np.full(H, np.nan)
    for y in range(H):
        xs = np.where(sub[y])[0]
        if len(xs):
            left[y], right[y] = xs.min(), xs.max()
    rows = list(range(0, max(2, int(H * 0.15)))) + list(range(int(H * 0.85), H))
    cents = [(left[y] + right[y]) / 2 for y in rows if not np.isnan(left[y])]
    cx = float(np.median(cents))
    ys_top, ys_bot, max_pro = None, None, 0
    handle_rows = []
    for y in range(H):
        edge = cx + w[y] / 2
        xs = np.where(sub[y])[0]
        hx = xs[xs > edge + 4]
        if len(hx) >= 3:                     # 至少 3px 才算把手行, 滤杂点
            handle_rows.append((y, hx.max() - edge))
    if not handle_rows:
        return None
    ys_arr = np.array([r[0] for r in handle_rows])
    ys_top = float(np.percentile(ys_arr, 5))   # 分位数抗离群
    ys_bot = float(np.percentile(ys_arr, 95))
    max_pro = max(r[1] for r in handle_rows)
    t1 = (H - 1 - ys_top) / (H - 1)
    t2 = (H - 1 - ys_bot) / (H - 1)
    half_max = w.max() / 2
    out = max_pro / half_max
    return dict(t1=round(min(0.92, max(0.4, t1)), 2),
                t2=round(min(0.75, max(0.15, t2)), 2),
                out=round(min(1.1, max(0.3, out)), 2))


def trace_wall(cx, baseY, cupH, halfW, prof, inset=0.0, n=48):
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        w = halfW * prof(t) * (1 - inset)
        y = baseY - t * cupH
        left.append((cx - w, y))
        right.append((cx + w, y))
    return left, right


def band_poly(cx, baseY, cupH, halfW, prof, t0, t1, n=16):
    pts = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        pts.append((cx - halfW * prof(t) * 0.96, baseY - t * cupH))
    for i in range(n, -1, -1):
        t = t0 + (t1 - t0) * i / n
        pts.append((cx + halfW * prof(t) * 0.96, baseY - t * cupH))
    return pts


def render_cup(size, cup, handle_cfg):
    """返回该杯的 RGBA 图(超采样后缩小)"""
    cell_w, cell_h = size
    img = Image.new("RGBA", (cell_w * S, cell_h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cell_w * S / 2
    cupH = CUP_H * S * (cup.get("size") or 1) / 1.05
    halfW = cupH / cup["aspect"] / 2
    # 宽杯等比缩小, 给把手留右边距
    max_half = cell_w * S * 0.30
    if halfW > max_half:
        halfW = max_half
        cupH = halfW * cup["aspect"] * 2
    stemH = cupH * 0.20 if cup["stem"] else 0
    baseY = cell_h * S * 0.88 - stemH
    prof = lambda t: catmull(cup["pts"], t)
    q = cup["q"]
    qw = max(q[1] - q[0], 0.24)
    q0 = max(0.15, q[1] - qw)
    pw = (q[1] - q0) / 3
    p = (q[1] - pw, q[1])

    # 杯脚
    if cup["stem"]:
        d.line([cx, baseY, cx, baseY + stemH], fill=INK, width=5 * S)
        d.ellipse([cx - halfW * 0.55, baseY + stemH - 4 * S,
                   cx + halfW * 0.55, baseY + stemH + 10 * S],
                  fill=(255, 255, 255, 128), outline=INK, width=4 * S)

    # 玻璃高光(左侧随壁弯曲的白带)
    hi = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    poly = []
    for i in range(25):
        t = 0.06 + 0.88 * i / 24
        poly.append((cx - halfW * prof(t) * 0.80, baseY - t * cupH))
    for i in range(24, -1, -1):
        t = 0.06 + 0.88 * i / 24
        poly.append((cx - halfW * prof(t) * 0.52, baseY - t * cupH))
    hd.polygon(poly, fill=(255, 255, 255, 115))
    img = Image.alpha_composite(img, hi)
    d = ImageDraw.Draw(img)

    # 三色分区
    zone = Image.new("RGBA", img.size, (0, 0, 0, 0))
    zd = ImageDraw.Draw(zone)
    zd.polygon(band_poly(cx, baseY, cupH, halfW, prof, 0, 1), fill=(43, 42, 38, 15))
    zd.polygon(band_poly(cx, baseY, cupH, halfW, prof, q0, q[1]), fill=(242, 201, 76, 115))
    zd.polygon(band_poly(cx, baseY, cupH, halfW, prof, p[0], p[1]), fill=(190, 222, 150, 204))
    img = Image.alpha_composite(img, zone)
    d = ImageDraw.Draw(img)

    # 液体(填到完美区中点, 纵向渐变)
    level = (p[0] + p[1]) / 2
    liq_mask = Image.new("L", img.size, 0)
    ld = ImageDraw.Draw(liq_mask)
    lp = []
    for i in range(25):
        t = level * i / 24
        lp.append((cx - halfW * prof(t) - 2 * S, baseY - t * cupH))
    for i in range(24, -1, -1):
        t = level * i / 24
        lp.append((cx + halfW * prof(t) + 2 * S, baseY - t * cupH))
    ld.polygon(lp, fill=255)
    grad = Image.new("RGBA", img.size)
    c_top, c_bot = hex2rgb(DRINK["color"]), hex2rgb(DRINK["deep"])
    ga = np.zeros((img.size[1], img.size[0], 4), dtype=np.uint8)
    y_top, y_bot = baseY - level * cupH, baseY
    ys = np.arange(img.size[1])
    f = np.clip((ys - y_top) / max(1, y_bot - y_top), 0, 1)[:, None]
    rgb = (np.array(c_top) * (1 - f) + np.array(c_bot) * f).astype(np.uint8)
    ga[:, :, 0] = rgb[:, 0:1]; ga[:, :, 1] = rgb[:, 1:2]; ga[:, :, 2] = rgb[:, 2:3]
    ga[:, :, 3] = int(DRINK["alpha"] * 255)
    grad = Image.fromarray(ga, "RGBA")
    img.paste(grad, (0, 0), liq_mask)
    d = ImageDraw.Draw(img)

    # 杯壁描边(开口) + 杯底加粗
    left, right = trace_wall(cx, baseY, cupH, halfW, prof)
    wall_w = max(3, int(4.5 * S))
    d.line(list(reversed(left)) + right, fill=INK, width=wall_w, joint="curve")
    bw0 = halfW * prof(0)
    d.line([cx - bw0, baseY, cx + bw0, baseY], fill=INK, width=wall_w * 2)

    # 把手(方 D 形马克杯柄: 外侧直边+圆角, 填充随饮品色)
    if handle_cfg:
        ht1, ht2 = handle_cfg["t1"], handle_cfg["t2"]
        hOut = halfW * handle_cfg["out"]
        hw1, hw2 = halfW * prof(ht1), halfW * prof(ht2)
        hy1, hy2 = baseY - ht1 * cupH, baseY - ht2 * cupH
        hTh = max(4.5 * S * 2.2, (hy2 - hy1) * 0.30)          # 柄厚
        xL = cx + max(hw1, hw2) - 2 * S                       # 内孔左缘(贴杯壁)
        xOut = cx + max(hw1, hw2) + hOut                      # 外侧直边
        rO = min(hTh * 0.55, (xOut - xL) * 0.45)              # 外圆角
        iy1, iy2, ixO = hy1 + hTh, hy2 - hTh, xOut - hTh      # 内孔(内缩柄厚)
        rI = max(2 * S, rO - hTh * 0.4)                       # 内孔圆角
        hmask = Image.new("L", img.size, 0)
        hm = ImageDraw.Draw(hmask)
        hm.rounded_rectangle([xL, hy1, xOut, hy2], radius=rO,
                             corners=(False, True, True, False), fill=255)
        hm.rounded_rectangle([xL, iy1, ixO, iy2], radius=rI,
                             corners=(False, True, True, False), fill=0)
        hga = np.zeros((img.size[1], img.size[0], 4), dtype=np.uint8)
        hf = np.clip((ys - hy1) / max(1, hy2 - hy1), 0, 1)[:, None]
        hrgb = (np.array(c_top) * (1 - hf) + np.array(c_bot) * hf).astype(np.uint8)
        hga[:, :, 0] = hrgb[:, 0:1]; hga[:, :, 1] = hrgb[:, 1:2]; hga[:, :, 2] = hrgb[:, 2:3]
        hga[:, :, 3] = int(DRINK["alpha"] * 255)
        img.paste(Image.fromarray(hga, "RGBA"), (0, 0), hmask)
        d = ImageDraw.Draw(img)
        hw_w = max(3, wall_w - S)
        d.rounded_rectangle([xL, hy1, xOut, hy2], radius=rO,
                            corners=(False, True, True, False), outline=INK, width=hw_w)
        d.rounded_rectangle([xL, iy1, ixO, iy2], radius=rI,
                            corners=(False, True, True, False), outline=INK, width=hw_w)

    # 合格区虚线
    for qv in (q0, q[1]):
        wAt = halfW * prof(qv)
        yy = baseY - qv * cupH
        x = cx - wAt
        while x < cx + wAt:
            d.line([x, yy, min(x + 6 * S, cx + wAt), yy], fill=(43, 42, 38, 77), width=2 * S)
            x += 12 * S

    return img.resize(size, Image.LANCZOS)


def main(src_name="ref-02.png"):
    suffix = "-" + src_name.split("-")[-1].split(".")[0]
    results = json.loads((HERE / f"extracted{suffix}.json").read_text(encoding="utf-8"))
    # 回算把手参数并写回 JSON / JS 片段
    for c in results:
        if c.get("handle"):
            c["handleCfg"] = detect_handle(src_name, c["idx"])
    (HERE / f"extracted{suffix}.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    # 重写 JS 片段: 把手参数写进 deco.handle
    lines = ["// 由 extract_profiles.py + render_gamestyle.py 生成, pool=9 试制区"]
    for c in results:
        pts = c["pts"]
        rows = [pts[i:i + 6] for i in range(0, len(pts), 6)]
        pt_str = ", \n        ".join(", ".join(str(p) for p in row) for row in rows)
        stem = "true" if c["stem"] else "false"
        deco = ""
        if c.get("handleCfg"):
            hc = c["handleCfg"]
            deco = (f"\n      deco: {{ handle: {{ t1: {hc['t1']}, t2: {hc['t2']}, "
                    f"out: {round(float(hc['out']), 2)} }} }},")
        lines.append(f"""    {{
      name: '试制·{c["name"]}', hint: '{c["hint"]}', aspect: {c["aspect"]}, stem: {stem}, size: {c["size"]}, pool: 9,{deco}
      profile: tableProfile([
        {pt_str}]),
      zones: {{ q: [{c["q"][0]:.2f}, {c["q"][1]:.2f}] }}
    }},""")
    (HERE / f"cups-lab-snippet{suffix}.js").write_text("\n".join(lines), encoding="utf-8")

    cols = 3
    cell = (300, 400)
    rows = (len(results) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell[0] + 40, rows * cell[1] + 60), (247, 243, 236, 255))
    d = ImageDraw.Draw(sheet)
    d.line([0, sheet.height - 60, sheet.width, sheet.height - 60], fill=INK, width=3)
    for i, c in enumerate(results):
        img = render_cup(cell, c, c.get("handleCfg"))
        x = 20 + (i % cols) * cell[0]
        y = 10 + (i // cols) * cell[1]
        sheet.paste(img, (x, y), img)
        d.text((x + 12, y + 8), f"#{i + 1}", fill=(90, 90, 96))
    out = HERE / f"gamestyle{suffix}.png"
    sheet.convert("RGB").save(out)
    for c in results:
        print(f"#{c['idx']+1:>2} {c['name']:<8} handle={c.get('handleCfg')}")
    print("游戏画风预览 ->", out)
    return out


if __name__ == "__main__":
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else "ref-02.png")
