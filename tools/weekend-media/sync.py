#!/usr/bin/env python3
"""Weekend media sync -- Dropbox folder (or any folder) -> the celebration page.

    python3 sync.py ~/Dropbox/Karmelo/"After Action Solidarity"

Idempotent: every file is keyed by a hash of its contents, so re-running only
does work for media that is genuinely new. Drop more photos or clips into the
folder, run it again, and the page picks them up -- no HTML is ever edited.

For each item it writes a lazy-loaded thumbnail, a full-size view, and (for
video) an H.264/WebM pair with a poster, then rewrites media.json, which is the
only thing the page reads.

Two things it always does, deliberately:
  * strips EXIF, so camera location and device data never reach the web
  * applies EXIF orientation first, so phone photos are not sideways
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, time
from PIL import Image, ImageOps

PHOTO_EXT = {'.jpg', '.jpeg', '.png', '.heic', '.webp'}
VIDEO_EXT = {'.mp4', '.mov', '.m4v', '.webm'}
THUMB_W, FULL_W = 640, 1500
VIDEO_H = 720

def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def key_for(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:12]

def do_photo(src, key, outdir):
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')   # orientation, then drop EXIF
    w, h = im.size
    full_p = os.path.join(outdir, f'{key}.webp')
    thumb_p = os.path.join(outdir, f'{key}-t.webp')
    fw = min(FULL_W, w)
    im.resize((fw, round(h * fw / w)), Image.LANCZOS).save(full_p, 'WEBP', quality=74, method=6)
    tw = min(THUMB_W, w)
    im.resize((tw, round(h * tw / w)), Image.LANCZOS).save(thumb_p, 'WEBP', quality=72, method=6)
    return {'type': 'photo', 'w': w, 'h': h,
            'src': os.path.basename(full_p), 'thumb': os.path.basename(thumb_p)}

def do_video(src, key, outdir):
    probe = sh(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height:format=duration',
                '-of', 'default=nw=1:nk=1', src]).stdout.split()
    try:
        w, h, dur = int(probe[0]), int(probe[1]), float(probe[2])
    except Exception:
        w = h = 0; dur = 0.0
    scale = f'scale=-2:{VIDEO_H}' if h > VIDEO_H else 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    mp4 = os.path.join(outdir, f'{key}.mp4')
    poster = os.path.join(outdir, f'{key}-p.jpg')
    thumb = os.path.join(outdir, f'{key}-t.webp')
    sh(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', scale,
        '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
        '-crf', '28', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart', mp4])
    sh(['ffmpeg', '-v', 'error', '-y', '-ss', str(min(1.0, dur / 3)), '-i', src,
        '-vframes', '1', '-vf', scale, '-q:v', '4', poster])
    if os.path.exists(poster):
        pi = Image.open(poster).convert('RGB')
        pw, ph = pi.size
        tw = min(THUMB_W, pw)
        pi.resize((tw, round(ph * tw / pw)), Image.LANCZOS).save(thumb, 'WEBP', quality=72, method=6)
    return {'type': 'video', 'w': w, 'h': h, 'dur': round(dur, 1),
            'src': os.path.basename(mp4), 'poster': os.path.basename(poster),
            'thumb': os.path.basename(thumb)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source', help='folder of photos and clips (e.g. the synced Dropbox folder)')
    ap.add_argument('--site', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'weekend'))
    ap.add_argument('--rebuild', action='store_true', help='reprocess everything, ignoring the cache')
    a = ap.parse_args()

    site = os.path.abspath(a.site)
    outdir = os.path.join(site, 'media')
    os.makedirs(outdir, exist_ok=True)
    manifest_p = os.path.join(site, 'media.json')

    old = {}
    if os.path.exists(manifest_p) and not a.rebuild:
        try:
            old = {i['key']: i for i in json.load(open(manifest_p)).get('items', [])}
        except Exception:
            old = {}

    files = sorted(f for f in os.listdir(a.source)
                   if os.path.splitext(f)[1].lower() in PHOTO_EXT | VIDEO_EXT)
    if not files:
        print(f'No media found in {a.source}'); sys.exit(1)

    items, added, kept = [], 0, 0
    for name in files:
        src = os.path.join(a.source, name)
        key = key_for(src)
        ext = os.path.splitext(name)[1].lower()
        if key in old and os.path.exists(os.path.join(outdir, old[key].get('thumb', ''))):
            items.append(old[key]); kept += 1; continue
        try:
            rec = do_video(src, key, outdir) if ext in VIDEO_EXT else do_photo(src, key, outdir)
        except Exception as e:
            print(f'  ! skipped {name}: {e}'); continue
        rec['key'] = key
        rec['origin'] = name
        rec['added'] = time.strftime('%Y-%m-%d')
        items.append(rec); added += 1
        print(f'  + {name} -> {rec["type"]}')

    # newest additions first, so a fresh drop leads the page
    items.sort(key=lambda i: (i.get('added', ''), i['type'] != 'video'), reverse=True)
    photos = sum(1 for i in items if i['type'] == 'photo')
    videos = sum(1 for i in items if i['type'] == 'video')
    json.dump({'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'counts': {'photos': photos, 'videos': videos, 'total': len(items)},
               'items': items}, open(manifest_p, 'w'), indent=2)

    # sweep derivatives whose source is gone
    live = set()
    for i in items:
        for k in ('src', 'thumb', 'poster'):
            if i.get(k): live.add(i[k])
    removed = 0
    for f in os.listdir(outdir):
        if f not in live:
            os.remove(os.path.join(outdir, f)); removed += 1

    size = sum(os.path.getsize(os.path.join(outdir, f)) for f in os.listdir(outdir))
    print(f'\n{photos} photos, {videos} videos  ({added} new, {kept} unchanged, {removed} swept)')
    print(f'media/ is {size/1048576:.1f} MB   manifest: {manifest_p}')

    # the link-preview card is made of these photographs, so it is rebuilt here:
    # add media, run this, and what people see when they paste the link is current
    card = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'share-cards', 'make-card.py')
    if os.path.exists(card):
        r = subprocess.run([sys.executable, card, 'weekend'], capture_output=True, text=True)
        print((r.stdout or r.stderr).strip() or 'share card unchanged')
    else:
        print('! share-cards/make-card.py missing - link preview not rebuilt')

if __name__ == '__main__':
    main()
