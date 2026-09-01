# The freekarmelo.net site standard

Every rule below exists because that exact thing went wrong on this site.
None of them are style preferences.

**The rules are enforced, not documented.** `node tools/check-pages.mjs` runs
on every push via `.github/workflows/quality.yml`. A failure blocks the merge.
Run it yourself before pushing — it takes under a second.

---

## Starting a new page

Copy `_template/page.html`. Do not start from another page — that is how the
homepage ended up with three `<h1>`s and how eleven pages ended up with no
analytics.

```
cp _template/page.html your-page.html
node tools/check-pages.mjs
```

Fill in the five bracketed fields at the top of the template. The checker will
tell you if you missed one.

---

## The rules

### Blocking — CI fails, nothing ships

| Rule | Why |
|---|---|
| Exactly one `<h1>` | The homepage carried three, all above the fold, all saying the same thing. Three headlines is no headline. |
| GA4 `G-05PYDYP5S0` present | Eighteen of twenty pages had no tag. The Ad Grant requires a measurable conversion; an untagged page cannot produce one. This is the rule that costs money. |
| `<title>` present | — |
| `<meta name="description">` present | — |
| `<meta name="viewport">` present | Without it a phone renders the desktop layout at 980px and the whole page reads as broken. |
| No dead `#anchor` | Every `Sign Up` button on the site pointed at `/#signup` after a refactor removed that section. Conversions ran on one form for weeks with no way to reach it. |
| No dead internal link | Links to a page or file that is not in the repo. |
| Every `<img>` has `alt` | Accessibility, and it is what a screen reader reads aloud at a rally. |
| A page with a `<form>` references `e5-fk-events` | A form that posts nowhere looks identical to a form that works. |
| The homepage has `#signup` | The single conversion path. It has been deleted once. |

### Warnings — allowed, but you should have a reason

- `<title>` over 70 characters (Google truncates near 60)
- description under 50 or over 165 characters
- missing `rel="canonical"`
- missing `og:title` / `og:description` / `og:image` — shares look bare without them
- `<img>` with no `width`/`height` — causes layout shift as the page loads
- an image over 250 KB with no `srcset`
- homepage with no `generate_lead` event — Ads still cannot count a signup

---

## Before you ship a page that moves

`check-pages.mjs` reads the markup. It cannot tell you that a photograph never
faded in, that a canvas painted nothing, or that the page scrolls sideways on a
phone. `verify-page.mjs` runs the page and checks exactly those things.

```
npm i playwright          # once; do NOT run "playwright install"
node tools/verify-page.mjs weekend solidarity
node tools/verify-page.mjs index.html --keep      # --keep writes screenshots
```

It opens each page at 390 / 834 / 1024 / 1440 plus a reduced-motion pass, jumps
to the bottom the way a hash link does, walks back up the way a reader does, and
fails on:

| Check | Why it is here |
|---|---|
| horizontal overflow | a phone that scrolls sideways reads as a broken page, and it has happened twice |
| script errors | filtered for the sandbox's own Google Fonts / gtag noise |
| elements that never faded in | an `IntersectionObserver` never fires for something a fast flick skipped, and the photograph stays invisible forever |
| a 2D canvas that painted nothing | GPU-backed canvases are skipped with a reason — this machine has no adapter, so a progressive hero is blank here by design |
| broken `<img>` src | `naturalWidth === 0` after load |

It also prints transferred weight per viewport and names the three heaviest
files whenever a page goes over 3 MB. That is not a failure, but a rally page is
opened on a phone on cellular, so know the number before you ship it.

Not in CI: GitHub's runner has no browser, and this check wants a real one.

---

## Images

Never reference a full-size original in an `<img>`. Generate variants:

```
node tools/gen-images.mjs assets/your-photo.jpg
```

That writes AVIF, WebP and JPEG at 480/800/1200/1600 into `assets/r/`, and
prints the `<picture>` block to paste.

The hero portraits went from **969 KB to 74 KB** on a phone this way, with no
visible change. Two images were being served at 4× and 6× the size they
rendered at.

---

## Structure

- **One shared system.** Tokens, components and mobile fixes live in
  `freekarmelo-shared/`. New pages use them. The homepage is currently
  self-contained and is the exception, not the pattern to copy.
- **The nav is the same everywhere.** Copy it from the template, not from
  whichever page you had open.
- **`/hero-lab/` and `_template/` are excluded** from the checker. Anything
  under them is scratch and must stay unlinked and `noindex`.

---

## When you change the homepage

The homepage carries the conversion path for the whole campaign. Before pushing:

1. `node tools/check-pages.mjs` — must be clean
2. Confirm `#signup` still exists and the form still posts to `e5-fk-events`
3. Confirm the GA4 tag survived

A refactor removed all three at once on 27 Aug 2026 and the site ran with no
reachable signup form until it was caught. The checker now blocks that exact
commit.
