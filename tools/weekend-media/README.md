# Weekend media sync

Turns a folder of photos and clips into `freekarmelo.net/weekend`.

```
python3 sync.py ~/Dropbox/Karmelo/"After Action Solidarity"
python3 sync.py <folder> --rebuild        # reprocess everything
python3 sync.py <folder> --site /path/to/weekend
```

Point it at the shared Dropbox folder (the synced copy on your machine) and it
writes everything the page needs. **Adding media later is the normal case:** drop
new files in the folder, run the same command, and the page carries them. No HTML
is ever edited.

## What it does per file

| | |
|---|---|
| Photos | orientation corrected, then a 1500w view and a 640w thumbnail as WebP |
| Video | H.264 720p MP4 with a poster frame and a WebP thumbnail |
| Both | **EXIF is stripped**, so camera location and device details never go to the web |

It then rewrites `weekend/media.json` — the only file the page reads — and sweeps
derivatives whose source has disappeared.

## Why it is safe to re-run

Every item is keyed by a hash of its **contents**, so re-running only does work
for genuinely new files. A second run over 37 unchanged items takes about a third
of a second. Renaming a file changes nothing; re-encoding one is treated as new.

## The page reads the manifest, not the files

`weekend/index.html` fetches `media.json` with `cache: no-cache` on every load and
builds the hero, the counts and the gallery from it. The city count comes from
`solidarity/solidarity.json`, the same roster the solidarity page uses, so no
number on the page is typed by hand or can drift.

When a run adds files on a **later date** than the rest, those tiles get a JUST
ADDED marker automatically — a single import stays unmarked.

## Requirements

Python 3 with Pillow, and `ffmpeg`/`ffprobe` on PATH for video.

## Judgement to keep

These are real people at public actions. No name is published with any image, and
captions stay collective on purpose. If someone asks to be removed, delete their
file from the source folder and re-run — the sweep takes the derivatives with it.
