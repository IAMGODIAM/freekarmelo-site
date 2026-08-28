# City sheet generator

Builds a Free Karmelo solidarity sheet for any city on the roster, straight
from `solidarity/solidarity.json`. A city approved in the moderation console
can have its flyer without waiting on a designer.

```
node make-sheet.mjs detroit            # one city
node make-sheet.mjs --all              # rebuild every city on the roster
node make-sheet.mjs detroit --wire     # also point solidarity.json at the result
node make-sheet.mjs detroit --site /path/to/solidarity
```

Outputs, per city:

| File | What it is |
|---|---|
| `solidarity/flyers-cities/<slug>.png` | 1080x1350 print sheet, ~200 KB |
| `solidarity/flyers-cities/web/<slug>.webp` | 640w thumbnail the site paints, ~25 KB |

`--wire` sets that city's `flyer` and `art` fields, which is what flips its
roster card from MASTER SHEET to CITY SHEET on the live page.

## How it works

**Stage 1 — background (GPU).** `background.mjs` renders the field through
`vgpu` and Dawn: a restrained violet nebula, a warm corner, a faint lattice
echoing the globe, and a vignette. The field is seeded from the city's slug,
so every city gets its own background and gets the *same* one on every
rebuild. Luminance is deliberately held low — the type is the hero.

**Stage 2 — typography.** `compose.py` draws the sheet with Pillow: the
eyebrow, the name at full size, the dates, a confirmed strip when the city has
a locked time and meet point, the roll call with this city first in gold, the
three approved actions, and the footer.

## Setup

```
npm install
npx vgpu doctor                        # verifies the machine end to end
```

Needs Node 18+ and Python 3 with Pillow (`pip install pillow`).

**No GPU?** Run `npx vgpu install-software-renderer` once. Dawn then renders on
the CPU and everything works unchanged — all 23 sheets rebuild in about 24
seconds that way, so a plain server or CI box is fine.

## Two things to know before running `--all`

**The existing city sheets are not ours to overwrite.** Most cities on the
roster carry art made by their own organizers — BLM Grassroots chapters and
local leads, with their own marks and their own voice. `--all` regenerates
into those filenames. Run it only when you intend to replace organizer art,
which is almost never. The tool exists for cities that have **no** sheet yet.

**Case language is fixed by design.** The sheet asserts nothing about the
case. It carries the city, the dates, the meet point when one is confirmed,
and the three approved actions. Keep it that way: never add anything implying
the conviction was overturned, that a new trial was granted, or predicting the
appeal — and never a mugshot or a mailing address.

## Fonts

Archivo, Archivo Black and IBM Plex Mono ship in `fonts/` under the SIL Open
Font License; the licenses are alongside them. They are the same faces the
site uses, so a generated sheet and the page it lands on read as one system.
