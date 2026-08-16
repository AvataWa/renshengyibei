# 素材后处理：从 7 张组合图中拆出容器精灵
# - 清除左下角水印区、细长地平线
# - 按列投影找左（容器）右（杯）分界，只保留容器
# - d5/d6/d7 壶嘴朝左，水平翻转为朝右
# - 收紧 alpha 边界，实测出水锚点：瓶类(d1-d4)取最高点，壶类(d5-d7)取最右点
# 输出 assets/containers/c1..c7.png 与 src/containers.js 配置
from PIL import Image
import numpy as np
import os, json

SRC = 'drinks'
OUT = os.path.join('assets', 'containers')
os.makedirs(OUT, exist_ok=True)

FILES = ['d1-milk.png', 'd2-cola.png', 'd3-beer.png', 'd4-wine.png',
         'd5-baijiu.png', 'd6-tea.png', 'd7-warmmilk.png']
FLIP = {4, 5, 6}          # 0-based：d5/d6/d7 水平翻转
ANCHOR_MODE = {0: 'top', 1: 'top', 2: 'top', 3: 'top', 4: 'right', 5: 'right', 6: 'right'}
# restTilt：静止时预倾角，让瓶身/锅身位于支点上方，不倒垂进杯区
REST_TILT = {0: 1.05, 1: 1.10, 2: 1.10, 3: 1.15, 4: 0.55, 5: 0.50, 6: 0.35}
# scale：显示高度缩放（宽体容器适当缩小，防止把手出屏）
SCALE = {0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 0.95, 6: 0.82}

config = []
for idx, fname in enumerate(FILES):
    img = Image.open(os.path.join(SRC, fname)).convert('RGBA')
    a = np.array(img).astype(np.uint8)
    alpha = a[..., 3]
    h, w = alpha.shape

    # 1) 清左下水印区（白色半透明字）
    alpha[int(h * 0.92):, :int(w * 0.25)] = 0

    # 2) 清细长地平线：某行不透明跨度 > 45% 宽且该线厚度 < 12px
    rows = (alpha > 120).sum(axis=1)
    for y in range(h):
        if rows[y] > w * 0.45:
            band = rows[y:y + 12]
            if (band > w * 0.45).all():
                continue  # 粗内容带，跳过
            # 找这一细行的垂直厚度
            t = 0
            while y + t < h and rows[y + t] > w * 0.45:
                t += 1
            if t <= 12 and rows[y] > w * 0.70:  # 地平线几乎横贯全图，容器不会超过 70%
                alpha[y:y + t, :] = 0

    # 3) 左右分界：列投影在中部 1/3 找谷底
    cols = (alpha > 120).sum(axis=0)
    lo, hi = int(w * 0.35), int(w * 0.65)
    split = lo + int(np.argmin(cols[lo:hi]))
    left = alpha[:, :split]

    # 4) 容器包围盒 + 收紧
    ys, xs = np.where(left > 120)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 4
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(split, x1 + pad); y1 = min(h, y1 + pad)
    sprite = Image.fromarray(a[y0:y1, x0:x1])

    # 5) 壶嘴朝右
    if idx in FLIP:
        sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)

    sp = np.array(sprite)[..., 3]
    sh, sw = sp.shape

    # 6) 锚点
    if ANCHOR_MODE[idx] == 'top':
        ys2, xs2 = np.where(sp > 120)
        top_y = ys2.min()
        mx = xs2[ys2 <= top_y + 3].mean()
        anchor = (mx / sw, top_y / sh)
    else:
        for x in range(sw - 1, -1, -1):
            col = np.where(sp[:, x] > 120)[0]
            if len(col):
                anchor = (x / sw, col.mean() / sh)
                break

    out = os.path.join(OUT, f'c{idx + 1}.png')
    sprite.save(out)
    config.append({
        'file': f'assets/containers/c{idx + 1}.png',
        'anchor': {'x': round(anchor[0], 3), 'y': round(anchor[1], 3)},
        'restTilt': REST_TILT[idx],
        'scale': SCALE[idx],
        'w': sw, 'h': sh
    })
    print(f'c{idx + 1}: {sw}x{sh} anchor=({anchor[0]:.3f},{anchor[1]:.3f}) restTilt={REST_TILT[idx]}')

# 7) 写 JS 配置（UMD，与 cups.js 同风格）
js = "/**\n * 容器精灵配置（由 process-containers.py 自动生成）\n * anchor: 出水口在贴图内的相对位置；restTilt: 静止预倾角(rad)\n */\n"
js += "(function (root, factory) {\n"
js += "  if (typeof module !== 'undefined' && module.exports) module.exports = factory();\n"
js += "  else root.Containers = factory();\n"
js += "})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function () {\n  return "
js += json.dumps(config, ensure_ascii=False, indent=2)
js += ";\n});\n"
with open(os.path.join('src', 'containers.js'), 'w', encoding='utf-8') as f:
    f.write(js)
print('src/containers.js written')
