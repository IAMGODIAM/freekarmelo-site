#!/usr/bin/env python3
"""
Build the campaign's link-preview cards (1200x630 Open Graph).

Nothing here is typed by hand twice: the weekend card is composed from the
photographs in weekend/media.json, and the solidarity card plots the cities in
solidarity/solidarity.json onto a dot-map of the world. Add media or add a
city, re-run, and the picture people see when they paste the link is current.

    python3 tools/share-cards/make-card.py --all
    python3 tools/share-cards/make-card.py weekend
    python3 tools/share-cards/make-card.py solidarity

Land outline: Natural Earth 110m (public domain), rasterised to a 240x89
bitmask in land-110m.json. Fonts in fonts/ are SIL OFL, licences alongside.
"""
import argparse, base64, json, math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FONTS = os.path.join(HERE, 'fonts')
# Archivo Black and IBM Plex Mono already live with the flyer tool; only the
# serif is new here, so there is one copy of each face in the repo, not two.
SHARED = os.path.join(HERE, '..', 'city-sheet', 'fonts')

W, H = 1200, 630
S = 2                                   # supersample, then downscale for clean edges

INK       = (8, 5, 16)
INK_2     = (12, 8, 22)
PAPER     = (247, 243, 251)
GOLD      = (217, 179, 108)
GOLD_LT   = (240, 220, 172)
VIOLET    = (139, 92, 246)
LILAC     = (201, 178, 255)
MUTED     = (156, 143, 181)
FAINT     = (126, 114, 149)

BLACK_F = os.path.join(SHARED, 'ArchivoBlack-Regular.ttf')
MONO_F  = os.path.join(SHARED, 'IBMPlexMono-SemiBold.ttf')
MONO_R  = os.path.join(SHARED, 'IBMPlexMono-Regular.ttf')
SERIF_I = os.path.join(FONTS, 'CormorantGaramond-SemiBoldItalic.ttf')
SANS_F  = os.path.join(SHARED, 'Archivo.ttf')

ANCHOR = {'name': 'McKINNEY', 'lat': 33.198, 'lng': -96.615}


# ── text helpers ──────────────────────────────────────────────────────────
def font(path, px):
    return ImageFont.truetype(path, int(px * S))


def text_w(d, s, f, track=0):
    if not s:
        return 0
    w = sum(d.textlength(c, font=f) for c in s)
    return w + track * S * (len(s) - 1)


def tracked(d, xy, s, f, fill, track=0):
    """Draw with real letter-spacing; Pillow has none of its own."""
    x, y = xy
    for c in s:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textlength(c, font=f) + track * S
    return x


def fit(path, s, max_w, start, floor, d, track=0):
    """Largest size at or under `start` that still fits inside max_w."""
    px = start
    while px > floor:
        f = font(path, px)
        if text_w(d, s, f, track) <= max_w * S:
            return f
        px -= 1
    return font(path, floor)


def vgrad(size, top, bottom):
    g = Image.new('RGB', (1, size[1]))
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        g.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize(size)


def hscrim(size, stops):
    """Horizontal alpha ramp: stops = [(x_fraction, alpha), ...]."""
    w, h = size
    a = Image.new('L', (w, 1))
    px = a.load()
    for x in range(w):
        t = x / max(1, w - 1)
        prev = stops[0]
        val = stops[-1][1]
        for s in stops:
            if t <= s[0]:
                span = (s[0] - prev[0]) or 1e-6
                k = (t - prev[0]) / span
                val = prev[1] + (s[1] - prev[1]) * k
                break
            prev = s
        px[x, 0] = int(max(0, min(255, val)))
    return a.resize((w, h))


def rule(im, y, h_px, x0=0, x1=W):
    """The site's top rule: dark gold -> gold -> lilac -> deep violet."""
    d = ImageDraw.Draw(im)
    stops = [(0.0, (58, 44, 20)), (0.22, GOLD), (0.5, GOLD_LT), (0.78, VIOLET), (1.0, (42, 26, 74))]
    for x in range(int(x0 * S), int(x1 * S)):
        t = (x - x0 * S) / max(1, (x1 - x0) * S - 1)
        prev = stops[0]
        col = stops[-1][1]
        for s in stops:
            if t <= s[0]:
                span = (s[0] - prev[0]) or 1e-6
                k = (t - prev[0]) / span
                col = tuple(int(prev[1][i] + (s[1][i] - prev[1][i]) * k) for i in range(3))
                break
            prev = s
        d.line([(x, int(y * S)), (x, int((y + h_px) * S))], fill=col)


def wordmark(d, x, y, tail, px=30):
    """FREE KARMELO .NET /TAIL, in the site's own colours."""
    f = font(BLACK_F, px)
    for s, c in (('FREE', PAPER), ('KARMELO', VIOLET), ('.NET', GOLD), (tail, MUTED)):
        x = tracked(d, (x, y), s, f, c, track=0.4)
    return x


def heart(d, x, y, w, fill):
    """The campaign mark, small enough to sit in front of an eyebrow line."""
    x, y, w = x * S, y * S, w * S
    r = w * 0.28
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=fill)
    d.ellipse([x + w - 2 * r, y, x + w, y + 2 * r], fill=fill)
    d.polygon([(x + w * 0.02, y + w * 0.30), (x + w * 0.98, y + w * 0.30), (x + w * 0.5, y + w * 1.0)], fill=fill)


def blend(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cover(path, box):
    """Crop-to-fill, like CSS object-fit: cover."""
    bw, bh = box
    im = Image.open(path).convert('RGB')
    scale = max(bw / im.width, bh / im.height)
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    return im.crop(((im.width - bw) // 2, max(0, int((im.height - bh) * 0.42)),
                    (im.width - bw) // 2 + bw, max(0, int((im.height - bh) * 0.42)) + bh))


# ── the map ───────────────────────────────────────────────────────────────
def land_degrees():
    d = json.load(open(os.path.join(HERE, 'land-110m.json')))
    bits = base64.b64decode(d['b64'])
    cols, rows = d['cols'], d['rows']
    cw = 360 / cols
    ch = (d['latTop'] - d['latBot']) / rows
    out = []
    for i in range(cols * rows):
        if bits[i >> 3] & (128 >> (i & 7)):
            out.append((-180 + (i % cols + 0.5) * cw, d['latTop'] - (i // cols + 0.5) * ch))
    return out, cw


def map_frame(pins, w, h, bias=0.5):
    """Same rule the live page uses: pad the roster's bbox, grow the short side
       to the canvas aspect, then shift (never clip) back inside the world."""
    xs = [p['lng'] for p in pins] + [ANCHOR['lng']]
    ys = [p['lat'] for p in pins] + [ANCHOR['lat']]
    x0, x1, y0, y1 = min(xs) - 14, max(xs) + 14, min(ys) - 10, max(ys) + 10
    ar = w / h
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    lon, lat = x1 - x0, y1 - y0
    if lon / lat < ar:
        lon = lat * ar
    else:
        lat = lon / ar
    if lon > 360:
        lon = 360; lat = lon / ar
    if lat > 138:
        lat = 138; lon = min(360, lat * ar)
    x0, x1, y0, y1 = cx - lon / 2, cx + lon / 2, cy - lat / 2, cy + lat / 2
    if x0 < -180: x1 += -180 - x0; x0 = -180
    if x1 > 180:  x0 -= x1 - 180;  x1 = 180
    if y0 < -58:  y1 += -58 - y0;  y0 = -58
    if y1 > 80:   y0 -= y1 - 80;   y1 = 80
    if bias != 0.5:                      # slide the window so the cluster sits where the design wants it
        lc = sum(p['lng'] for p in pins) / len(pins)
        want = lc - (x1 - x0) * bias
        shift = max(-180 - x0, min(180 - x1, want - x0))
        x0 += shift; x1 += shift
    return x0, x1, y0, y1


def draw_map(im, pins, box, dot_alpha=48, pin_r=5.0, bias=0.5):
    """Dot-map with a thread from every city home to the courthouse."""
    bx, by, bw, bh = box
    layer = Image.new('RGBA', (int(bw * S), int(bh * S)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    fr = map_frame(pins, bw, bh, bias)
    land, cw = land_degrees()

    def px(lng, lat):
        return ((lng - fr[0]) / (fr[1] - fr[0]) * bw * S,
                (fr[3] - lat) / (fr[3] - fr[2]) * bh * S)

    r = max(1.1, (bw * S) / ((fr[1] - fr[0]) / cw) * 0.30)
    for lng, lat in land:
        if not (fr[0] <= lng <= fr[1] and fr[2] <= lat <= fr[3]):
            continue
        x, y = px(lng, lat)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(184, 164, 236, dot_alpha))

    ax, ay = px(ANCHOR['lng'], ANCHOR['lat'])
    for p in pins:                                   # threads first, under the pins
        cxp, cyp = px(p['lng'], p['lat'])
        mx, my = (ax + cxp) / 2, (ay + cyp) / 2
        dx, dy = ax - cxp, ay - cyp
        dist = math.hypot(dx, dy) or 1
        qx, qy = mx - dy / dist * dist * 0.19, my + dx / dist * dist * 0.19
        pts = []
        for i in range(29):
            t = i / 28
            u = 1 - t
            pts.append((u * u * cxp + 2 * u * t * qx + t * t * ax,
                        u * u * cyp + 2 * u * t * qy + t * t * ay))
        d.line(pts, fill=(217, 179, 108, 66), width=int(1.4 * S), joint='curve')

    glow = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for p in pins:
        x, y = px(p['lng'], p['lat'])
        gd.ellipse([x - pin_r * 3.4 * S, y - pin_r * 3.4 * S, x + pin_r * 3.4 * S, y + pin_r * 3.4 * S],
                   fill=(217, 179, 108, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(6 * S))
    layer = Image.alpha_composite(layer, glow)
    d = ImageDraw.Draw(layer)

    for p in pins:
        x, y = px(p['lng'], p['lat'])
        d.ellipse([x - pin_r * S, y - pin_r * S, x + pin_r * S, y + pin_r * S], fill=GOLD + (255,))
    d.ellipse([ax - pin_r * 2.6 * S, ay - pin_r * 2.6 * S, ax + pin_r * 2.6 * S, ay + pin_r * 2.6 * S],
              outline=(255, 244, 214, 190), width=int(1.6 * S))
    d.ellipse([ax - pin_r * 1.25 * S, ay - pin_r * 1.25 * S, ax + pin_r * 1.25 * S, ay + pin_r * 1.25 * S],
              fill=(255, 244, 214, 255))
    im.paste(layer, (int(bx * S), int(by * S)), layer)


# ── the cards ─────────────────────────────────────────────────────────────
def base_canvas():
    im = Image.new('RGB', (W * S, H * S), INK)
    im.paste(vgrad((W * S, H * S), INK_2, (6, 4, 13)), (0, 0))
    return im


def finish(im, out):
    rule(im, 0, 4)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W * S - 1, H * S - 1], outline=(139, 92, 246, 255), width=int(1 * S))
    im = im.resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, 'PNG', optimize=True)
    print('%-46s %s  %dKB' % (os.path.relpath(out, ROOT), im.size, os.path.getsize(out) // 1024))


def card_weekend(out):
    man = json.load(open(os.path.join(ROOT, 'weekend', 'media.json')))
    photos = [i for i in man.get('items', []) if i.get('type') != 'video' and i.get('src')]
    if not photos:
        sys.exit('weekend/media.json has no photographs to build a card from')

    im = base_canvas()
    d = ImageDraw.Draw(im)

    # right-hand mosaic: one tall frame plus two stacked, sampled across the whole set
    MX, MW = 660, W - 660
    gap = 5
    c1 = int(MW * 0.44)
    c2 = MW - c1 - gap
    top_h = int((H - 4 - gap) * 0.53)
    slots = [(MX, 4, c1, H - 4),
             (MX + c1 + gap, 4, c2, top_h),
             (MX + c1 + gap, 4 + top_h + gap, c2, H - 4 - top_h - gap)]
    step = max(1, len(photos) // len(slots))
    picks, used = [], set()
    for n, sl in enumerate(slots):
        want = sl[2] / sl[3]
        pool = [p for k, p in enumerate(photos) if k not in used] or photos
        best = min(pool, key=lambda p: abs((p.get('w', 4) / max(1, p.get('h', 3))) - want)
                   + 0.35 * abs(photos.index(p) - n * step) / max(1, len(photos)))
        used.add(photos.index(best))
        picks.append(best)
    for (x, y, w, h), p in zip(slots, picks):
        src = os.path.join(ROOT, 'weekend', 'media', p['src'])
        if not os.path.exists(src):
            continue
        im.paste(cover(src, (w * S, h * S)), (x * S, y * S))

    # feather the seam between the ink panel and the frames, and keep the
    # photographs bright: a preview thumbnail is small, and murk reads as nothing
    im.paste(Image.new('RGB', ((W - MX) * S, (H - 4) * S), INK), (MX * S, 4 * S),
             hscrim(((W - MX) * S, (H - 4) * S), [(0.0, 242), (0.20, 104), (0.46, 26), (1.0, 8)]))
    im.paste(Image.new('RGB', (W * S, H * S), INK), (0, 0),
             hscrim((W * S, H * S), [(0.0, 255), (0.545, 255), (0.575, 40), (1.0, 6)]))

    x = 62
    heart(d, x, 70, 17, GOLD)
    tracked(d, ((x + 27) * S, 70 * S), u'AUG 29–31 · 2026 · WORLDWIDE SOLIDARITY WEEKEND',
            font(MONO_F, 14.5), GOLD_LT, track=2.4)

    hl = font(BLACK_F, 88)
    for line in ('THE WORLD', 'SHOWED UP.'):
        hl = min(hl, fit(BLACK_F, line, 545, 88, 52, d, track=-1.0), key=lambda f: f.size)
    lead = (hl.size / S) * 0.94
    for i, line in enumerate(('THE WORLD', 'SHOWED UP.')):
        tracked(d, (x * S, (124 + i * lead) * S), line, hl, PAPER, track=-1.0)

    y = 124 + 2 * lead + 14
    d.text((x * S, y * S), 'And it looked like this.', font=font(SERIF_I, 44), fill=GOLD)

    y += 76
    d.line([(x * S, y * S), ((x + 452) * S, y * S)], fill=blend(INK, GOLD, 0.5), width=int(1 * S))

    c = man.get('counts', {})
    tracked(d, (x * S, (y + 26) * S),
            u'%d PHOTOGRAPHS · %d CLIPS' % (c.get('photos', 0), c.get('videos', 0)),
            font(MONO_F, 14), GOLD_LT, track=2.2)
    tracked(d, (x * S, (y + 50) * S), 'EVERY ONE TAKEN BY SOMEONE WHO WAS THERE',
            font(MONO_R, 12.5), MUTED, track=2.0)

    wordmark(d, x * S, 520 * S, '/WEEKEND', px=31)
    tracked(d, (x * S, 564 * S), 'A PROJECT OF E5 ENCLAVE INCORPORATED', font(MONO_R, 11.5), FAINT, track=2.2)
    finish(im, out)

def card_solidarity(out):
    data = json.load(open(os.path.join(ROOT, 'solidarity', 'solidarity.json')))
    pins = [c for c in data.get('cities', []) if c.get('lat') is not None and c.get('lng') is not None]
    if not pins:
        sys.exit('solidarity.json has no plottable cities')

    im = base_canvas()

    # the world runs as a wide ribbon under the type, so no city is ever hidden
    BY = 274
    draw_map(im, pins, (0, BY, W, H - BY), dot_alpha=54, pin_r=4.4, bias=0.42)
    im.paste(Image.new('RGB', (W * S, 120 * S), INK), (0, BY * S),
             vgrad((W * S, 120 * S), (255, 255, 255), (0, 0, 0)).convert('L'))
    im.paste(Image.new('RGB', (W * S, 76 * S), INK), (0, (H - 76) * S),
             vgrad((W * S, 76 * S), (0, 0, 0), (140, 140, 140)).convert('L'))
    d = ImageDraw.Draw(im)

    x = 62
    heart(d, x, 66, 17, GOLD)
    tracked(d, ((x + 27) * S, 66 * S), u'WORLDWIDE SOLIDARITY · FREE KARMELO ANTHONY',
            font(MONO_F, 14.5), GOLD_LT, track=2.4)

    hl = font(BLACK_F, 78)
    for line in ('WE WERE COMING', 'ANYWAY.'):
        hl = min(hl, fit(BLACK_F, line, 640, 78, 46, d, track=-1.0), key=lambda f: f.size)
    lead = (hl.size / S) * 0.93
    for i, line in enumerate(('WE WERE COMING', 'ANYWAY.')):
        tracked(d, (x * S, (116 + i * lead) * S), line, hl, PAPER, track=-1.0)

    d.text(((x + text_w(d, 'ANYWAY.', hl, -1.0) / S + 26) * S, (116 + lead + 10) * S),
           'Now you know why.', font=font(SERIF_I, 40), fill=GOLD)

    tracked(d, (x * S, 296 * S),
            u'CITIES ACROSS THE WORLD · ONE NAME · EVERY THREAD RUNS BACK TO McKINNEY, TX',
            font(MONO_R, 12.5), MUTED, track=1.9)

    wordmark(d, x * S, 548 * S, '/SOLIDARITY', px=29)
    finish(im, out)

def clip(d, text, f, max_w, track=0):
    """Trim to fit, with an ellipsis, so a long headline never runs off the card."""
    if text_w(d, text, f, track) <= max_w * S:
        return text
    out = text
    while out and text_w(d, out + '\u2026', f, track) > max_w * S:
        out = out[:-1]
    return out.rstrip(' ,;:-') + '\u2026'


def card_updates(out):
    """The wire card: the three newest entries in the feed, as published."""
    feed = json.load(open(os.path.join(ROOT, 'updates', 'feed.json')))
    items = [i for i in feed if i.get('headline')][:3]
    if not items:
        sys.exit('updates/feed.json has no entries')

    im = base_canvas()
    d = ImageDraw.Draw(im)
    # a faint dot-field down the right, echoing the map on the solidarity card
    for gy in range(0, H, 13):
        for gx in range(760, W, 13):
            t = max(0.0, min(1.0, (gx - 760) / (W - 760)))
            d.ellipse([gx, gy, gx + 1.6 * S, gy + 1.6 * S],
                      fill=(int(28 + 26 * t), int(20 + 20 * t), int(52 + 40 * t)))
    im.paste(Image.new('RGB', (W * S, H * S), INK), (0, 0),
             hscrim((W * S, H * S), [(0.0, 255), (0.55, 235), (1.0, 120)]))

    x = 62
    heart(d, x, 66, 17, GOLD)
    tracked(d, ((x + 27) * S, 66 * S), u'THE RECORD \u00b7 FREE KARMELO ANTHONY',
            font(MONO_F, 14.5), GOLD_LT, track=2.4)

    hl = font(BLACK_F, 66)
    for line in ('THE TRUTH,', 'WITHOUT VARNISH.'):
        hl = min(hl, fit(BLACK_F, line, 660, 66, 40, d, track=-1.0), key=lambda f: f.size)
    lead = (hl.size / S) * 0.94
    for i, line in enumerate(('THE TRUTH,', 'WITHOUT VARNISH.')):
        tracked(d, (x * S, (112 + i * lead) * S), line, hl, PAPER, track=-1.0)

    y = 112 + 2 * lead + 26
    d.line([(x * S, y * S), ((W - 62) * S, y * S)], fill=blend(INK, VIOLET, 0.45), width=int(1 * S))

    y += 26
    for it in items:
        d.ellipse([x * S, (y + 7) * S, (x + 7) * S, (y + 14) * S], fill=GOLD)
        meta = (it.get('date', '') + u'  \u00b7  ' + it.get('tag', '')).upper()
        tracked(d, ((x + 20) * S, y * S), clip(d, meta, font(MONO_F, 12), 1000, 2.0),
                font(MONO_F, 12), GOLD_LT, track=2.0)
        head = font(SANS_F, 23)
        d.text(((x + 20) * S, (y + 22) * S),
               clip(d, it['headline'], head, W - x - 96), font=head, fill=PAPER)
        y += 78

    wordmark(d, x * S, 544 * S, '/UPDATES', px=29)
    tracked(d, ((W - 62 - 210) * S, 556 * S), 'EVERY ENTRY SOURCED', font(MONO_R, 11.5), FAINT, track=2.2)
    finish(im, out)


CARDS = {
    'weekend':    (card_weekend,    os.path.join(ROOT, 'weekend', 'share-weekend.png')),
    'solidarity': (card_solidarity, os.path.join(ROOT, 'solidarity', 'share-solidarity.png')),
    'updates':    (card_updates,    os.path.join(ROOT, 'updates', 'share-updates.png')),
}

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('card', nargs='?', choices=sorted(CARDS))
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--out', help='write somewhere else (single card only)')
    a = ap.parse_args()
    if not a.card and not a.all:
        ap.error('name a card or pass --all')
    for name in (sorted(CARDS) if a.all else [a.card]):
        fn, dest = CARDS[name]
        fn(a.out if (a.out and not a.all) else dest)
