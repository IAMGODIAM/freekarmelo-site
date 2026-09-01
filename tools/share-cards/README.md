# share-cards — the pictures people see when they paste a link

Open Graph cards, 1200×630, built from the campaign's own data rather than
typed by hand. Every page that shares a card with another page is a page whose
link looks like somebody else's.

```bash
python3 tools/share-cards/make-card.py --all          # both cards
python3 tools/share-cards/make-card.py weekend        # just one
python3 tools/share-cards/make-card.py weekend --out /tmp/try.png
```

| card | writes | made of |
|---|---|---|
| `weekend` | `weekend/share-weekend.png` | three photographs chosen across `weekend/media.json`, plus the photo and clip counts |
| `solidarity` | `solidarity/share-solidarity.png` | every city in `solidarity/solidarity.json`, plotted at its real coordinates on a dot-map, each threaded home to McKinney |
| `updates` | `updates/share-updates.png` | the three newest entries in `updates/feed.json`, set as a wire front page |

`updates` has no tool calling it automatically — re-run it whenever the feed
changes. And note what it means: **whatever the newest entry says goes into
every share preview of /updates.** The guardrails in `freekarmelo-guardrails`
apply at the moment an entry is written, not afterwards.

Because both read the manifests, **the cards go stale only if the site does**.
`tools/weekend-media/sync.py` calls the weekend card at the end of every run,
so adding photographs updates the preview in the same breath. Add a city to the
roster and re-run `make-card.py solidarity` — the map re-frames itself around
whatever is on the roster, including a city in a hemisphere we have never had
one in before.

### After you change a card

Scrapers cache hard, and a link already shared will keep showing the old
picture until its cache is poked:

* Facebook / Instagram — https://developers.facebook.com/tools/debug/ → Scrape Again
* X — https://cards-dev.twitter.com/validator
* LinkedIn — https://www.linkedin.com/post-inspector/
* iMessage and Signal cache per device; a freshly pasted link generally re-fetches.

This is also why the cards carry no clock. A countdown baked into a static
image freezes at whatever it said the moment a scraper first read it, and is
wrong in every preview from then on.

### What is in here

* `make-card.py` — the generator, nothing needed beyond Pillow
* `land-110m.json` — Natural Earth 110m land, public domain, rasterised to a
  240×89 bitmask (3.5 KB) so the map needs no shapefile at build time
* `fonts/` — Archivo Black, IBM Plex Mono, Cormorant Garamond, all SIL OFL,
  licence text alongside each

The same land bitmask is embedded in `weekend/index.html` for the live map, so
the card and the page on screen are drawing the same world.
