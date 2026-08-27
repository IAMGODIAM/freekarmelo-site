# freekarmelo.net/solidarity — production build

Implementation of `Day of Solidarity.dc.html` from the Claude Design handoff.
No framework, no build step, no dependencies. Upload the folder as-is.

```
solidarity/
  index.html            the page — all CSS and JS inline
  solidarity.json       the content block, machine-readable (see "Publishing")
  solidarity-globe.js   the 3D globe web component, shipped unchanged
  share-card.png        og:image
  assets/               partner lockups
  flyers-master-23-cities/  ·  flyers-houston/  ·  flyers-final/   the 10 sheets
```

Serve it at `/solidarity/` so the relative flyer paths and the canonical URL
line up. Any static host works — R2 + a custom domain, Pages, or a Worker with
an assets binding.

---

## One thing blocks the form

`FK.turnstileSiteKey` in `index.html` is empty. The intake Worker
(`e5-fk-events`) rejects every `/submit` without a Turnstile token —
`verifyTurnstileTransition` throws `turnstile_required`, no exceptions. Paste
the sitekey registered for `freekarmelo.net` and the form goes live:

```js
var FK = window.FK = {
  intake: 'https://e5-fk-events.yisraelleemccartney.workers.dev',
  turnstileSiteKey: '0x4AAA...',   // ← here
```

Until it is set the form fails closed with a plain-English message and points
people at `freekarmelo.net/events`. It never silently drops a submission.

The Worker's `ALLOWED_ORIGINS` already includes `freekarmelo.net`,
`freekarmelo.today` and `e5enclave.com`. Serving this page from anywhere else
means a CORS failure on submit.

---

## How the form maps onto the intake schema

The Worker's `signup` validator rejects unknown fields outright, so the
prototype's four inputs are mapped, not passed through:

| Form field | Sent as | Note |
|---|---|---|
| NAME | `first_name` + `last_name` | split on first whitespace; a single-word name gets `last_name: "—"` |
| EMAIL | `email` | |
| CITY / METRO | `city` (display name) + `state` (region) | the slug rides along in `source` |
| ORGANIZATION | `roles: "org: …"` | **see below** |
| YOUR MESSAGE | `message` | **only when the wall box is ticked** |
| peaceful/lawful box | `sign_manifesto: true`, `opt_in_newsletter` | |
| — | `commitment_type: "appeal_advocacy"` | required by the schema; the solidarity weekend supports the appeal |
| — | `want_address: ""` | never asked; the README forbids publishing a mailing address |
| — | `source: "solidarity-weekend-2026/<slug>"` | so solidarity signups are separable in the D1 |

**Two of these deserve a decision from you.**

*Organization has nowhere to go.* The `signup` schema has no `organization`
key and `assertKnownKeys` throws `unknown_field` on anything it does not
recognise, so the value rides in `roles` prefixed `org: `. It works, and it is
wrong — `roles` means something else. The honest fix is three lines in
`e5-fk-events`:

```diff
- assertKnownKeys(body, new Set([...common, "first_name", "last_name", "email", "city",
-   "state", "message", "commitment_type", "roles", "sign_manifesto", …]));
+ assertKnownKeys(body, new Set([...common, "first_name", "last_name", "email", "city",
+   "state", "message", "commitment_type", "roles", "organization", "sign_manifesto", …]));
```

```diff
  payload = {
    …
+   organization: cleanString(body.organization, "organization", { required: false, max: 160 }),
```

Then change `roles: org ? ('org: ' + org) : ''` to `organization: org` in
`index.html`. Do it whenever the Worker next ships; nothing breaks in the
meantime.

*The wall box is a real consent gate.* `handleSubmit` auto-queues any message
of 3+ characters for wall moderation. So when the box is unticked the page
sends `message: ''` rather than sending the text and hoping — an unticked box
means the words never leave the browser.

---

## Publishing without touching the page

Content lives in exactly one object, and the page reads it from three places,
last one winning:

1. the `content` defaults inside `index.html` — render instantly, always work offline
2. `solidarity.json` — fetched after first paint, re-renders in place if it differs
3. `<script type="application/json" id="fk-content">` — inlined at publish time, always wins

`solidarity.json` is the integration point the design README describes: a dev
ships a write endpoint for that one file and **Solidarity Admin.dc.html**
becomes functional with zero page changes. `lattice-mcp`'s `fk_roster` tool
reads the same file, so the page, the dashboard and the agents cannot drift.

### Adding a city

```json
{ "name": "DETROIT", "region": "MI", "slug": "detroit" }
```

It inherits the master broadside, `AUG 29–30 · TIME TBA`, and status COMMITTED.
When a lead confirms:

```json
{ "name": "DETROIT", "region": "MI", "slug": "detroit", "status": "locked",
  "when": "SAT AUG 29 · 2:00 PM CT", "where": "Meet point sent to registrants" }
```

To put its pin on the globe, add the same `slug` plus `lat`/`lng` to
`DEFAULT_CITIES` in `solidarity-globe.js`. **Page and globe are matched by
slug** — a mismatch means the card never highlights and the pin never scrolls.

### Adding a poster

```json
{ "src": "flyers-x/your-file.png", "title": "SHORT NAME", "tag": "CATEGORY",
  "alt": "what the sheet says, for screen readers" }
```

One line. The grid reflows and the sheet count updates itself.

### Adding a wall quote

```json
{ "kind": "SUPPORTER", "quote": "…", "who": "FIRST NAME + INITIAL", "meta": "CITY · DATE" }
```

The seven seeded cards are sourced, on-the-record voices — counsel, family,
open court — so nothing invented is published on day one. Approved supporter
messages from `GET /wall?mode=feed` append after them automatically; set
`FK.wallLive = false` to turn that off.

---

## The globe

Drag to spin it, hover or click a pin to jump to that city's card, hover a city
card to spin the globe to it. Honours `prefers-reduced-motion` — the idle spin
and the pin pulse both stop.

**It was not actually interactive before.** The `.boot` overlay ("PLOTTING THE
ROSTER") fades to `opacity: 0` when the globe finishes loading, but it kept
`pointer-events: auto` and stayed stretched across the canvas at `inset: 0`.
Every drag and every pin click was landing on an invisible div. The globe looked
alive because the idle spin is driven by the render loop, not by input, so the
bug was invisible until you tried to touch it. One line fixes it — the boot
notice is a status overlay and should never be an input target:

```css
.boot{ … ; pointer-events:none}
```

Verified after the fix: drag rotates, all four sampled pins raycast-hit on hover
(cursor turns to a pointer) and fire `city-select` on click, hovering a city
card targets that city, and `prefers-reduced-motion` stops the idle spin.

### The two dependencies are now served from this origin

`vendor/three-0.160.0.min.js` (655 KB) and `vendor/land-110m.json` (54 KB). The
prototype pulled both from unpkg at runtime. For a page that exists for one
specific weekend, a CDN blip would have degraded the hero at exactly the wrong
moment — and it put two third-party origins on a page about an active appeal.

`solidarity-globe.js` reads them from globals when the page provides them and
**still falls back to unpkg when it doesn't**, so the component remains a valid
standalone drop-in. `index.html` starts the land fetch at parse time and hands
the component a promise, so there is no race and no wasted request. If both
paths fail, the lat/long lattice globe still renders: the hero never blanks.

The page loads `solidarity-globe.js?v=10`. **Bump that number whenever you edit
the component**, or browsers serve the old one.

---

## What changed from the prototype

The prototype ran on Claude Design's `x-dc` / `DCLogic` runtime (`support.js`).
That is gone; the markup, values, spacing, colours and copy are carried over
1:1. Beyond that:

- **Real CSS.** `style-hover` attributes became CSS classes; layout values are unchanged.
- **The form actually posts** to `e5-fk-events`, with error states, a disabled
  submit while in flight, honeypots matched to the Worker's `isHoneypotTriggered`,
  and Turnstile reset on failure.
- **The wall pulls live approved messages** and falls back to the seeded cards.
- **One deliberate visual deviation:** at ≤760px the poster grid uses a 140px
  minimum instead of 196px. At 196px it collapses to a single column on a phone,
  putting roughly 4,400px of scroll in front of "find your city" — the page's
  primary action. Two columns keeps the same rhythm and the same aspect ratio.
- **The globe actually responds now** — see above. In the prototype every drag
  and pin click hit the faded boot overlay.
- **three.js and the land geometry are vendored**, with the CDN kept as fallback.
- **Accessibility:** skip link, `lang`, labelled sections, `aria-label`s on the
  icon-only wall controls and the card overlays, visible focus rings, keyboard
  reachability for the city sheets (the reveal is `:focus-within`, not just
  `:hover`), and a nav scrollspy.
- Checked for horizontal overflow at 320 / 360 / 390 / 430 / 600 / 760 / 900 /
  1120 / 1280 / 1440 / 1920 — clean at all of them.

## Still open (unchanged from the design handoff)

- 22 of 23 cities need local times and meet points. Houston 8/29 2:00 PM CT is
  the only confirmed one; everything else reads TBA **by design, not oversight**.
- The `1,480` signup count is a placeholder pending real numbers, left hardcoded
  on purpose. There is no unauthenticated count endpoint to wire it to.
- Aug 30 day-two assignments are unpublished; the roster shows the weekend range.
- The admin dashboard has no auth. Gate that route before it goes near live.

## Case language — non-negotiable

Verified Aug 27, 2026 against public reporting (WFAA, CNN, CBS Texas, NBC 5 DFW,
Courthouse News, Dallas Morning News).

**Say:** Judge John Roach was recused Aug 19 from deciding the motion for a new
trial; retired Kaufman County Judge Michael Chitty was assigned in his place.
Chitty denied the motion Aug 22 in a half-page order without elaboration,
following a two-day hearing Aug 20–21. The 35-year sentence stands. The defense
has said it will appeal, to the Fifth District Court of Appeals in Dallas. No
argument date is set.

**Never:** that the conviction was overturned, that the recusal freed him, that
a new trial was granted, or any predicted outcome of the appeal. Never contact
judges, jurors, witnesses, or court staff. Never publish his mugshot or any
mailing address.

## Publishing a city without a git push — the moderation console

`moderate.html` (unlisted, `noindex`) is the campaign's approval surface,
independent of any third-party platform. Two tokens, entered in the page and
kept only in that browser:

| Token | Scope | Used for |
|---|---|---|
| Campaign admin token | the worker's `x-fk-admin` secret | reading the wall queue + new-city requests, APPROVE / REJECT |
| GitHub token | fine-grained PAT, **Contents: Read+Write on `freekarmelo-site` only** | PUBLISH A CITY — commits `solidarity.json` to `main` |

Flow: a supporter picks "MY CITY ISN'T LISTED — I WANT TO START ONE" on the
commit form → the request appears in §B of the console → fill name / region /
slug / lat / lng in §C → PUBLISH. The console commits `solidarity.json`,
GitHub Pages redeploys (~2 min), and the live page paints the new roster card
AND pins the globe itself — `solidarity-globe.js` is never edited, because
**the globe now follows the roster**: any city entry carrying `lat`/`lng`
drives its own pin (FK54). §C also edits existing cities (lock a time, set a
meet point) from a phone.

Wall messages: §A lists the pending queue; APPROVE puts the message — with the
supporter's location — on the canonical wall feed, which this page and the
justice page both render.
