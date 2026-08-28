#!/usr/bin/env python3
"""City-sheet typography layer.

Reads a JSON spec on stdin, draws the campaign's roll-call sheet over the
GPU-rendered background, and writes a print PNG plus the 640w WebP the site
paints. Every string comes from solidarity.json -- nothing about the case is
asserted here beyond the city, the dates and the three approved actions.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
M = 76                                   # page margin
INK      = (8, 5, 16)
PAPER    = (247, 243, 251)
GOLD     = (217, 179, 108)
GOLD_LT  = (240, 220, 172)
LILAC    = (201, 178, 255)
VIOLET   = (139, 92, 246)
MUTED    = (156, 143, 181)
FAINT    = (126, 114, 149)

FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

def black(sz):
    return ImageFont.truetype(os.path.join(FONTS, "ArchivoBlack-Regular.ttf"), sz)

def sans(sz, weight="SemiBold"):
    f = ImageFont.truetype(os.path.join(FONTS, "Archivo.ttf"), sz)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

def mono(sz, semi=False):
    name = "IBMPlexMono-SemiBold.ttf" if semi else "IBMPlexMono-Regular.ttf"
    return ImageFont.truetype(os.path.join(FONTS, name), sz)

def tracked(draw, xy, text, font, fill, track=0.0, anchor_right=False):
    """PIL has no letter-spacing; draw glyph by glyph."""
    x, y = xy
    if anchor_right:
        x -= width_of(text, font, track)
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + track
    return x

def width_of(text, font, track=0.0):
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    return sum(d.textlength(c, font=font) for c in text) + track * max(0, len(text) - 1)

def build(spec, bg_path, out_png, out_webp):
    city   = spec["city"]
    roster = spec["roster"]                # [{name, region, slug, status, ...}]
    slug   = city["slug"]

    im = Image.open(bg_path).convert("RGB") if os.path.exists(bg_path) else Image.new("RGB", (W, H), INK)
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(im, "RGBA")

    # ── top rule, the site's own gradient bar ─────────────────────────
    stops = [(0.00, (58, 44, 20)), (0.22, GOLD), (0.50, GOLD_LT),
             (0.78, VIOLET), (1.00, (42, 26, 74))]
    for x in range(W):
        t = x / (W - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                k = 0 if b == a else (t - a) / (b - a)
                c = tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
                break
        d.rectangle([x, 0, x + 1, 5], fill=c)

    # ── eyebrow ───────────────────────────────────────────────────────
    y = 72
    tracked(d, (M, y), f"{city['name']} CALLS THE ROLL", mono(15, True), LILAC, 2.6)
    tracked(d, (W - M, y), "8/29 -> 8/30", mono(15), MUTED, 2.6, anchor_right=True)

    # ── the name, the largest thing on the sheet ───────────────────────
    y = 138
    d.text((M - 6, y), "KARMELO", font=black(132), fill=PAPER)
    d.text((M - 6, y + 124), "ANTHONY", font=black(132), fill=PAPER)

    # ── date line ─────────────────────────────────────────────────────
    y = 418
    date_f = black(52)
    d.text((M - 3, y), "AUG 29 + AUG 30", font=date_f, fill=GOLD)
    sub_f, sub = mono(14), "BOTH DAYS, EVERYWHERE"
    sub_x = M - 3 + width_of("AUG 29 + AUG 30", date_f) + 26
    if sub_x + width_of(sub, sub_f, 2.2) > W - M:
        sub_x = W - M - width_of(sub, sub_f, 2.2)
    tracked(d, (sub_x, y + 30), sub, sub_f, MUTED, 2.2)

    # ── confirmed strip, only when the lead has locked a time ─────────
    y = 500
    if city.get("status") == "locked" and city.get("when"):
        d.rectangle([M, y, M + 4, y + 74], fill=GOLD)
        tracked(d, (M + 20, y + 4), "CONFIRMED", mono(12, True), GOLD, 2.4)
        d.text((M + 20, y + 24), city["when"], font=sans(25, "Bold"), fill=GOLD_LT)
        where = city.get("where", "")
        if where:
            d.text((M + 20, y + 54), where[:58], font=sans(17, "Regular"), fill=MUTED)
        y += 104
    else:
        y += 14

    # ── the roll call ─────────────────────────────────────────────────
    d.line([(M, y), (W - M, y)], fill=(139, 92, 246, 90), width=1)
    y += 26
    others = [c for c in roster if c["slug"] != slug]
    others.sort(key=lambda c: (c.get("status") != "locked",))
    shown = [city] + others[:8]
    for i, c in enumerate(shown):
        me = c["slug"] == slug
        tracked(d, (M, y + 11), f"{i + 1:02d}", mono(13), GOLD if me else FAINT, 1.4)
        d.text((M + 52, y), c["name"], font=sans(31, "Bold" if me else "SemiBold"),
               fill=GOLD if me else LILAC)
        reg = c.get("region", "")
        if reg:
            name_f = sans(31, "Bold" if me else "SemiBold")
            d.text((M + 52 + width_of(c["name"], name_f) + 16, y + 10),
                   reg, font=mono(14), fill=FAINT)
        if me:
            d.line([(M, y + 46), (W - M, y + 46)], fill=(217, 179, 108, 70), width=1)
        y += 47
    tracked(d, (M + 52, y + 6), "AND EVERY OTHER CITY ON THE MAP", mono(16, True), MUTED, 2.0)

    # ── how the roll gets answered ────────────────────────────────────
    y = 1168
    tracked(d, (M, y), "HOW THE ROLL GETS ANSWERED", mono(12, True), FAINT, 2.6)
    d.text((M - 2, y + 22), "Wear purple  ·  Write him a letter  ·  Post it and tag it",
           font=sans(27, "Bold"), fill=PAPER)

    # ── footer ────────────────────────────────────────────────────────
    d.line([(M, 1268), (W - M, 1268)], fill=(139, 92, 246, 80), width=1)
    tracked(d, (M, 1292), "FREEKARMELO.NET/SOLIDARITY", mono(16, True), PAPER, 2.4)
    tracked(d, (W - M, 1294), "#FREEKARMELO", mono(13), MUTED, 2.4, anchor_right=True)

    im.save(out_png, "PNG", optimize=True)
    w = im.resize((640, round(H * 640 / W)), Image.LANCZOS)
    w.save(out_webp, "WEBP", quality=80, method=6)
    return out_png, out_webp

if __name__ == "__main__":
    spec = json.load(sys.stdin)
    png, webp = build(spec, spec["background"], spec["out_png"], spec["out_webp"])
    print(json.dumps({"png": png, "webp": webp,
                      "png_kb": round(os.path.getsize(png) / 1024),
                      "webp_kb": round(os.path.getsize(webp) / 1024)}))
