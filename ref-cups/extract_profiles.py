# -*- coding: utf-8 -*-
"""
参考图 → cups.js profile 提取器
支持两种参考图:
  1. 实心剪影 (ref-01): 阈值取黑块, 逐行量宽
  2. 线稿描边 (ref-02): 空心轮廓, 需先按列投影把右侧把手从杯身分离
高脚杯自动切割杯脚(bowl/stem), 输出 cups-lab 兼容条目 + 对照图
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
N_PTS = 17
STEM_FRAC = 0.42   # 宽度低于 maxW*该比例且持续, 视为进入杯脚

# ---------- 每张参考图的人工标注(按阅读顺序: 上行左→右) ----------
META = {
    "ref-01.png": dict(thresh=90, mode="silhouette", cups=[
        dict(name="古典威士忌杯", hint="八分满", stem=False, size=1.0,  q=[0.62, 0.88]),
        dict(name="复古庭格高脚杯", hint="1/3 杯", stem=True,  size=1.1,  q=[0.28, 0.52]),
        dict(name="海波直身杯",   hint="九分满", stem=False, size=1.1,  q=[0.68, 0.92]),
        dict(name="飓风特饮杯",   hint="过肚",   stem=True,  size=1.1,  q=[0.50, 0.74]),
        dict(name="无脚葡萄酒杯", hint="半杯",   stem=False, size=1.0,  q=[0.40, 0.64]),
        dict(name="皮尔森长杯",   hint="九分满", stem=False, size=1.15, q=[0.68, 0.92]),
        dict(name="郁金香香槟杯", hint="3/4 杯", stem=True,  size=1.1,  q=[0.62, 0.86]),
        dict(name="复古宽口高脚杯", hint="1/3 杯", stem=True, size=1.05, q=[0.28, 0.52]),
        dict(name="细笛香槟杯",   hint="3/4 杯", stem=True,  size=1.15, q=[0.62, 0.86]),
        dict(name="厚底小烈酒杯", hint="满杯为宜", stem=False, size=0.85, q=[0.70, 0.94]),
    ]),
    "ref-02.png": dict(thresh=170, mode="outline", cups=[
        dict(name="奶泡马克杯",   hint="八分满", stem=False, size=1.05, q=[0.62, 0.88], handle=True),
        dict(name="直身马克杯",   hint="九分满", stem=False, size=1.1,  q=[0.68, 0.92], handle=True),
        dict(name="底座拿铁杯",   hint="八分满", stem=False, size=1.1,  q=[0.60, 0.86], handle=True),
        dict(name="宽口咖啡杯",   hint="七分满", stem=False, size=1.0,  q=[0.56, 0.82], handle=True),
        dict(name="卡布奇诺杯",   hint="七分满", stem=False, size=1.05, q=[0.55, 0.80], handle=True),
        dict(name="环把咖啡杯",   hint="七分满", stem=False, size=1.0,  q=[0.55, 0.80], handle=True),
        dict(name="美式咖啡杯",   hint="八分满", stem=False, size=0.95, q=[0.58, 0.84], handle=True),
        dict(name="圆肚环把杯",   hint="满杯为宜", stem=False, size=0.9, q=[0.68, 0.92], handle=True),
        dict(name="鼓腹咖啡杯",   hint="八分满", stem=False, size=1.0,  q=[0.58, 0.84], handle=True),
    ]),
}


def runs(proj, thresh, gap=6):
    idx = np.where(proj > thresh)[0]
    out = []
    if len(idx) == 0:
        return out
    s = p = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - p > gap:
            out.append((s, p))
            s = i
        p = i
    out.append((s, p))
    return out


def close_mask(mask, it=2):
    m = mask
    for _ in range(it):
        d = m.copy()
        d[1:] |= m[:-1]; d[:-1] |= m[1:]
        d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
        m = d
    for _ in range(it):
        e = m.copy()
        e[1:] &= m[:-1]; e[:-1] &= m[1:]
        e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        m = e
    return m


def find_components(mask, mode):
    row_thr = 30 if mode == "silhouette" else 4
    col_thr = 20 if mode == "silhouette" else 4
    comps = []
    for y0, y1 in runs(mask.sum(axis=1), row_thr, gap=10):
        sub = mask[y0:y1 + 1]
        for x0, x1 in runs(sub.sum(axis=0), col_thr, gap=10):
            cell = sub[:, x0:x1 + 1]
            ys = np.where(cell.sum(axis=1) > 0)[0]
            if len(ys) == 0:
                continue
            cy0, cy1 = y0 + int(ys[0]), y0 + int(ys[-1])
            if (x1 - x0) > 60 and (cy1 - cy0) > 80:
                comps.append((x0, cy0, x1, cy1))
    comps.sort(key=lambda b: (b[1] // 300, b[0]))
    return comps


def dilate(m, it=1):
    for _ in range(it):
        d = m.copy()
        d[1:] |= m[:-1]; d[:-1] |= m[1:]
        d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
        d[1:, 1:] |= m[:-1, :-1]; d[:-1, :-1] |= m[1:, 1:]
        d[1:, :-1] |= m[:-1, 1:]; d[:-1, 1:] |= m[1:, :-1]
        m = d
    return m


def erode(m, it=1):
    for _ in range(it):
        e = m.copy()
        e[1:] &= m[:-1]; e[:-1] &= m[1:]
        e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        e[1:, 1:] &= m[:-1, :-1]; e[:-1, :-1] &= m[1:, 1:]
        e[1:, :-1] &= m[:-1, 1:]; e[:-1, 1:] &= m[1:, :-1]
        m = e
    return m


def largest_cc(mask):
    """4-连通最大分量"""
    from collections import deque
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    best_n = 0
    H, W = mask.shape
    for y in range(H):
        row = mask[y] & ~seen[y]
        xs = np.where(row)[0]
        for x in xs:
            if seen[y, x] or not mask[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            cells = []
            while q:
                cy, cx = q.popleft()
                cells.append((cy, cx))
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(cells) > best_n:
                best_n = len(cells)
                best = cells
    out = np.zeros_like(mask)
    if best:
        ys, xs = zip(*best)
        out[list(ys), list(xs)] = True
    return out


def flood_exterior(m):
    """从边界漫水标记外部区域(4-连通, 沿 False 传播)"""
    from collections import deque
    H, W = m.shape
    ext = np.zeros((H, W), dtype=bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if not m[y, x] and not ext[y, x]:
                ext[y, x] = True
                q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if not m[y, x] and not ext[y, x]:
                ext[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
            if 0 <= ny < H and 0 <= nx < W and not m[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True
                q.append((ny, nx))
    return ext


def body_from_outline(sub):
    """线稿杯身提取: 膨胀封口 → 漫水填充 → 腐蚀断开把手接缝 → 最大连通分量"""
    m = dilate(sub, 2)
    ext = flood_exterior(m)
    filled = ~ext                          # 杯壁 + 杯腔
    filled = erode(filled, 2)              # 把手只靠 1~2px 接缝连着, 腐蚀即断
    body = largest_cc(filled)
    return dilate(body, 2)                 # 补回腐蚀量


def row_widths_outline(sub):
    """线稿模式: 杯身左右对称 → 每行只量可靠的左缘, 中心线由不跨把手的
    上/下 15% 行估计, 宽度 = 2×(中心-左缘); 水印打断的行插值"""
    H, W = sub.shape
    left = np.full(H, np.nan)
    right = np.full(H, np.nan)
    for y in range(H):
        xs = np.where(sub[y])[0]
        if len(xs):
            left[y] = xs.min()
            right[y] = xs.max()
    rows = list(range(0, max(2, int(H * 0.15)))) + \
           list(range(int(H * 0.85), H))
    cents = [(left[y] + right[y]) / 2 for y in rows if not np.isnan(left[y])]
    cx = float(np.median(cents))
    w = 2 * (cx - left)
    valid = ~np.isnan(left)
    ys = np.arange(H)
    w = np.interp(ys, ys[valid], w[valid])
    w = np.clip(w, 2, W)
    k = max(3, H // 60)
    return np.convolve(w, np.ones(k) / k, mode="same")


def row_widths(sub):
    H = sub.shape[0]
    w = np.zeros(H)
    for y in range(H):
        xs = np.where(sub[y])[0]
        if len(xs):
            w[y] = xs.max() - xs.min() + 1
    k = max(3, H // 60)
    return np.convolve(w, np.ones(k) / k, mode="same")


def split_bowl(w, stem):
    H = len(w)
    if not stem:
        return 0, H - 1
    maxw = w.max()
    y = 0
    while y < H:
        if w[y] < maxw * STEM_FRAC:
            look = w[y:min(H, y + int(H * 0.10))]
            if len(look) and look.max() < maxw * (STEM_FRAC + 0.05):
                break
        y += 1
    return 0, max(1, y - 1)


def sample17(w, y0, y1):
    """t=0 为杯底; 两端内缩 ~3% 避开口沿/圆底的裁切误差"""
    pad = max(2, int((y1 - y0) * 0.03))
    lo_y, hi_y = y0 + pad, y1 - pad
    pts = []
    for i in range(N_PTS):
        t = i / (N_PTS - 1)
        y = hi_y - t * (hi_y - lo_y)
        lo, hi = max(y0, int(y) - 1), min(y1, int(y) + 1)
        pts.append(float(w[lo:hi + 1].max()))
    m = max(pts)
    return [round(max(0.05, min(1.0, p / m)), 3) for p in pts]


def catmull(pts, t):
    """与游戏 tableProfile 完全一致的插值"""
    n = len(pts) - 1
    x = max(0, min(1, t)) * n
    i = min(int(x), n - 1)
    u = x - i
    p0 = pts[max(i - 1, 0)]
    p1, p2 = pts[i], pts[i + 1]
    p3 = pts[min(i + 2, n)]
    v = 0.5 * ((2 * p1) + (-p0 + p2) * u +
               (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
               (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
    return max(0.05, min(1, v))


def extract(src):
    cfg = META[src.name]
    a = np.asarray(Image.open(src).convert("L"))
    mask = a < cfg["thresh"]
    if cfg["mode"] == "silhouette":
        mask = close_mask(mask)
    comps = find_components(mask, cfg["mode"])
    assert len(comps) == len(cfg["cups"]), f"{src.name}: 期望 {len(cfg['cups'])} 只杯, 实际 {len(comps)}"
    results = []
    for idx, (x0, y0, x1, y1) in enumerate(comps):
        meta = cfg["cups"][idx]
        sub = mask[y0:y1 + 1, x0:x1 + 1]
        if cfg["mode"] == "outline":
            w = row_widths_outline(sub)   # 直接在含把手的整图上量, 对称补全
        else:
            w = row_widths(sub)
        bt, bb = split_bowl(w, meta["stem"])
        full_w = w[bt:bb + 1].max()
        pts = sample17(w, bt, bb)
        aspect = round(max(0.55, min(2.8, (bb - bt + 1) / full_w)), 2)
        results.append(dict(idx=idx, bbox=[x0, y0, x1, y1],
                            pts=pts, aspect=aspect,
                            **{k: v for k, v in meta.items() if k != "handle"},
                            handle=bool(meta.get("handle"))))
    return results


def render_gen(draw, ox, oy, ch, cup, ink=(40, 46, 54)):
    """按 profile 画生成杯剪影, oy 为杯底 y, ch 为杯身高; 带把/带脚一起画"""
    pts, aspect = cup["pts"], cup["aspect"]
    half_w = (ch / aspect) / 2
    N = 60
    left, right = [], []
    for i in range(N + 1):
        t = i / N
        y = oy - t * ch
        hw = catmull(pts, t) * half_w
        left.append((ox - hw, y))
        right.append((ox + hw, y))
    draw.polygon(left + right[::-1], fill=ink)
    if cup["stem"]:
        sh = ch * 0.55
        sw = half_w * 0.16
        draw.rectangle([ox - sw, oy, ox + sw, oy + sh], fill=ink)
        fw = half_w * 0.62
        draw.ellipse([ox - fw, oy + sh - 8, ox + fw, oy + sh + 6], fill=ink)
    if cup.get("handle"):  # 游戏 deco.handle 的示意: 右侧椭圆把
        hw_top = catmull(pts, 0.82) * half_w
        hw_bot = catmull(pts, 0.42) * half_w
        hx = ox + max(hw_top, hw_bot)
        y1, y2 = oy - 0.82 * ch, oy - 0.42 * ch
        rw = half_w * 0.45
        draw.ellipse([hx, y1, hx + rw * 2, y2], outline=ink, width=max(3, int(half_w * 0.16)))


def compare_sheet(results, src, suffix):
    img = Image.open(src).convert("RGB")
    row_h, cup_h = 200, 150
    cell_w = 240
    n = len(results)
    W = 60 + cell_w * 2 + 220
    H = row_h * n + 50
    sheet = Image.new("RGB", (W, H), (248, 248, 250))
    d = ImageDraw.Draw(sheet)
    d.text((60, 14), "ref                         generated (17-pt profile)   # / aspect",
           fill=(90, 90, 96))
    for r, cup in enumerate(results):
        y_mid = 50 + r * row_h + row_h // 2
        x0, y0, x1, y1 = cup["bbox"]
        crop = img.crop((x0, y0, x1, y1 + 1))
        scale = cup_h / (y1 - y0 + 1)
        crop = crop.resize((max(1, int((x1 - x0) * scale)), cup_h), Image.LANCZOS)
        sheet.paste(crop, (60 + (cell_w - crop.width) // 2, y_mid - cup_h // 2))
        gen_cx = 60 + cell_w + cell_w // 2
        gen_oy = y_mid + (cup_h // 2 if not cup["stem"] else cup_h // 4)
        ch = cup_h if not cup["stem"] else int(cup_h * 0.62)
        render_gen(d, gen_cx, gen_oy, ch, cup)
        for qv in cup["q"]:
            qy = gen_oy - qv * ch
            d.line([gen_cx - cell_w // 2 + 10, qy, gen_cx + cell_w // 2 - 10, qy],
                   fill=(80, 180, 100), width=1)
        d.text((60 + cell_w * 2 + 8, y_mid - 6),
               f"#{cup['idx'] + 1}  aspect={cup['aspect']}  stem={cup['stem']}",
               fill=(60, 60, 66))
    out = HERE / f"compare_sheet{suffix}.png"
    sheet.save(out)
    return out


def to_js(results, suffix):
    lines = [f"// 由 extract_profiles.py 从参考图提取, pool=9 试制区"]
    for c in results:
        pts = c["pts"]
        rows = [pts[i:i + 6] for i in range(0, len(pts), 6)]
        pt_str = ", \n        ".join(", ".join(str(p) for p in row) for row in rows)
        stem = "true" if c["stem"] else "false"
        deco = "\n      deco: { handle: true }," if c.get("handle") else ""
        lines.append(f"""    {{
      name: '试制·{c["name"]}', hint: '{c["hint"]}', aspect: {c["aspect"]}, stem: {stem}, size: {c["size"]}, pool: 9,{deco}
      profile: tableProfile([
        {pt_str}]),
      zones: {{ q: [{c["q"][0]:.2f}, {c["q"][1]:.2f}] }}
    }},""")
    out = HERE / f"cups-lab-snippet{suffix}.js"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?", default="ref-01.png", help="参考图文件名")
    args = ap.parse_args()
    src = HERE / args.src
    suffix = "-" + src.stem.split("-")[-1]
    results = extract(src)
    (HERE / f"extracted{suffix}.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    sheet = compare_sheet(results, src, suffix)
    js = to_js(results, suffix)
    for c in results:
        print(f"#{c['idx']+1:>2} {c['name']:<8} stem={c['stem']!s:<5} handle={c.get('handle')!s:<5} "
              f"aspect={c['aspect']:<5} min={min(c['pts']):.2f} max={max(c['pts']):.2f}")
    print("对比图 ->", sheet)
    print("JS 片段 ->", js)
