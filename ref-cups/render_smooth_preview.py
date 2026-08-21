# -*- coding: utf-8 -*-
"""平滑前后对比图: 每只检出杯 左=现在(锯齿) 右=平滑后, 游戏画风"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

from render_gamestyle import render_cup, INK

HERE = Path(__file__).parent


def cjk_font(size):
    try:
        import sys
        sys.path.insert(0, str(Path(sys.executable).parent.parent.parent))
        from daimon_runtime import setup_plot
        setup_plot()
        from matplotlib import font_manager
        f = font_manager.findfont(font_manager.FontProperties(
            family=["Noto Sans CJK SC", "Microsoft YaHei", "SimHei"]),
            fallback_to_default=False)
        from PIL import ImageFont
        return ImageFont.truetype(f, size)
    except Exception:
        return None


def main():
    cups = json.loads((HERE / "smooth-preview.json").read_text(encoding="utf-8"))
    cols = 5
    cell_w, cell_h = 300, 400
    sub = (cell_w // 2 - 10, cell_h - 40)
    rows = (len(cups) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w + 40, rows * cell_h + 60), (247, 243, 236, 255))
    d = ImageDraw.Draw(sheet)
    font = cjk_font(18)
    for i, c in enumerate(cups):
        x = 20 + (i % cols) * cell_w
        y = 20 + (i // cols) * cell_h
        base = dict(aspect=c["aspect"], size=c["size"], stem=c["stem"], q=c["q"])
        before = render_cup(sub, {**base, "pts": c["ptsBefore"]}, c.get("handleCfg"))
        after = render_cup(sub, {**base, "pts": c["ptsAfter"]}, c.get("handleCfg"))
        sheet.paste(before, (x, y + 24), before)
        sheet.paste(after, (x + sub[0] + 12, y + 24), after)
        d.text((x + 4, y + 4), f"#{c['idx']} {c['name']}", fill=(60, 60, 66), font=font)
    out = HERE / "smooth-compare.png"
    sheet.convert("RGB").save(out)
    print("对比图 ->", out, f"({len(cups)} 杯)")


if __name__ == "__main__":
    main()
