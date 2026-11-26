"""產生程式圖示：web/assets/icon.png（1024）、packaging/icon.ico。

資料助秘系列的深藍到青綠圓角方塊；中間是兩張交疊的拍立得相片（夕陽山景、愛心）與一條底片，
右下角紅色圓形播放鍵（代表做成影片），上方「家庭相簿」標題列，左下角「資料助秘」標籤。
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(size, weight="Black"):
    try:
        f = ImageFont.truetype(os.path.join(HERE, "web", "assets", "fonts", "NotoSansTC-VF.ttf"), size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        return f
    except Exception:
        return ImageFont.load_default()


def shadow_layer(size, draw_fn, blur=18, alpha=110, offset=(10, 18)):
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(sh), offset, (0, 0, 0, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur))


def polaroid(w, h, kind):
    """一張拍立得：白框＋相片內容。"""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=18, fill=(252, 250, 244, 255))
    m = int(w * 0.075)
    ph = int(h * 0.74)
    pic = Image.new("RGBA", (w - 2 * m, ph - m), (0, 0, 0, 255))
    pd = ImageDraw.Draw(pic)
    pw, pph = pic.size
    if kind == "sunset":
        for y in range(pph):
            pd.line([(0, y), (pw, y)], fill=lerp((255, 140, 90), (255, 214, 120), y / pph) + (255,))
        pd.ellipse([pw * 0.58, pph * 0.18, pw * 0.82, pph * 0.42], fill=(255, 248, 200, 255))
        pd.polygon([(0, pph), (pw * 0.3, pph * 0.45), (pw * 0.55, pph * 0.8), (pw * 0.75, pph * 0.55), (pw, pph)],
                   fill=(108, 62, 117, 255))
    else:
        for y in range(pph):
            pd.line([(0, y), (pw, y)], fill=lerp((90, 180, 255), (190, 230, 255), y / pph) + (255,))
        pd.rectangle([0, pph * 0.78, pw, pph], fill=(92, 191, 92, 255))
        # 一家人（簡單圓頭人形）
        for i, (cx, s, col) in enumerate([(0.3, 1.0, (233, 87, 87)), (0.52, 0.72, (255, 193, 7)), (0.72, 0.95, (66, 133, 244))]):
            x, r = pw * cx, pw * 0.07 * s
            base = pph * 0.86
            pd.ellipse([x - r, base - r * 6.2, x + r, base - r * 4.2], fill=(255, 220, 185, 255))
            pd.rounded_rectangle([x - r * 1.3, base - r * 4.1, x + r * 1.3, base], radius=int(r), fill=col + (255,))
        # 愛心
        hx, hy, hs = pw * 0.52, pph * 0.18, pw * 0.16
        pd.ellipse([hx - hs * 0.5, hy, hx, hy + hs * 0.5], fill=(255, 82, 120, 255))
        pd.ellipse([hx, hy, hx + hs * 0.5, hy + hs * 0.5], fill=(255, 82, 120, 255))
        pd.polygon([(hx - hs * 0.48, hy + hs * 0.33), (hx + hs * 0.48, hy + hs * 0.33), (hx, hy + hs * 0.85)],
                   fill=(255, 82, 120, 255))
    im.paste(pic, (m, m))
    return im


def main():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp((15, 60, 110), (14, 150, 120), y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
    img.paste(grad, (0, 0), mask)
    gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([-200, -520, S + 200, 420], fill=(255, 255, 255, 34))
    img = Image.alpha_composite(img, Image.composite(gloss, Image.new("RGBA", (S, S)), mask))

    # 底片（斜放在後面）
    film = Image.new("RGBA", (900, 200), (0, 0, 0, 0))
    fd = ImageDraw.Draw(film)
    fd.rounded_rectangle([0, 0, 899, 199], radius=16, fill=(25, 25, 30, 255))
    for x in range(20, 900, 70):
        fd.rounded_rectangle([x, 14, x + 38, 40], radius=6, fill=(235, 228, 205, 255))
        fd.rounded_rectangle([x, 160, x + 38, 186], radius=6, fill=(235, 228, 205, 255))
    for i, x in enumerate(range(30, 880, 210)):
        fd.rectangle([x, 54, x + 180, 146], fill=[(255, 170, 90), (120, 200, 255), (150, 220, 140), (255, 140, 170)][i % 4] + (255,))
    film = film.rotate(-14, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(film, (60, 520))

    # 兩張拍立得
    p1 = polaroid(430, 500, "sunset").rotate(12, expand=True, resample=Image.BICUBIC)
    p2 = polaroid(450, 520, "family").rotate(-8, expand=True, resample=Image.BICUBIC)
    for p, pos in ((p1, (130, 250)), (p2, (430, 290))):
        sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        a = p.split()[3].point(lambda v: 120 if v > 0 else 0)
        blk = Image.new("RGBA", p.size, (0, 0, 0, 255))
        blk.putalpha(a)
        sh.alpha_composite(blk, (pos[0] + 14, pos[1] + 22))
        img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(16)))
        img.alpha_composite(p, pos)

    # 播放鍵
    d = ImageDraw.Draw(img)
    cx, cy, r = 790, 800, 120
    img = Image.alpha_composite(img, shadow_layer((S, S), lambda dd, o, f: dd.ellipse([cx - r + o[0], cy - r + o[1], cx + r + o[0], cy + r + o[1]], fill=f)))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(229, 57, 53, 255), outline=(255, 255, 255, 255), width=12)
    d.polygon([(cx - 38, cy - 62), (cx - 38, cy + 62), (cx + 66, cy)], fill=(255, 255, 255, 255))

    # 標題列「家庭相簿」
    img = Image.alpha_composite(img, shadow_layer((S, S), lambda dd, o, f: dd.rounded_rectangle([170 + o[0], 96 + o[1], 854 + o[0], 236 + o[1]], radius=50, fill=f), blur=14, alpha=90))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([170, 96, 854, 236], radius=50, fill=(30, 77, 140, 255), outline=(120, 170, 230, 255), width=6)
    d.text((512, 162), "家庭相簿", font=font(96), fill=(255, 255, 255, 255), anchor="mm")

    # 左下「資料助秘」
    d.rounded_rectangle([96, 850, 470, 940], radius=34, fill=(255, 255, 255, 235))
    d.text((283, 893), "資料助秘", font=font(56), fill=(15, 74, 117, 255), anchor="mm")

    os.makedirs(os.path.join(HERE, "web", "assets"), exist_ok=True)
    img.save(os.path.join(HERE, "web", "assets", "icon.png"))
    img.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "web", "assets", "icon-256.png"))
    os.makedirs(os.path.join(HERE, "packaging"), exist_ok=True)
    img.save(os.path.join(HERE, "packaging", "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("ok")


if __name__ == "__main__":
    main()
