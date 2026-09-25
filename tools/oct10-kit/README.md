# oct10-kit — Political Education Party (Sat Oct 10)

**Source of truth:** `oct10/event.json`. The page at
`/events/political-education-party/` fetches it with `cache: 'no-cache'` and
repaints; nothing about the event is typed into the HTML.

```
node tools/oct10-kit/stamp.mjs     # after any edit to event.json
node tools/check-pages.mjs         # must print 0 failing
```

`stamp.mjs` writes what scrapers need (title, description, og/twitter tags,
JSON-LD `Event`, the `<h1>`) into the `EVENT-HEAD` / `EVENT-H1` blocks of the page
and of `/oct10/` (the short link every flyer and QR points at — it forwards to
the page and keeps the UTM query). It also rebuilds the share-kit thumbnails and
`oct10/downloads/political-education-party-kit.zip`.

## Organizer switches (edit event.json, stamp, push)

| Field | Effect |
|---|---|
| `status` | `weather` / `moved` / `past` show a banner. `today` and `past` also switch on automatically from `start`/`end` (America/Chicago). |
| `program[].confirmed`, `tables[].confirmed` | `false` = hidden publicly |
| `tables[].open` | collapse into one "N tables open" card |
| `featured.confirmed` | red "Featuring" stamp |
| `tournament.brackets[].status` | `full` → "FULL · WAIT LIST" |
| `venue.parking` | replaces the "posted before the day" line in the FAQ |
| `case.lines`, `case.lastConfirmed` | re-confirm before every change — see `freekarmelo-guardrails` |

## Forms → e5-fk-events (existing intake, Turnstile)

| Form | form_type | action_type |
|---|---|---|
| RSVP | `local-action` | `oct10-rsvp` |
| Youth team (guardian) | `local-action` | `oct10-youth-team` |
| Volunteer | `partner-volunteer` | — |

Submissions land in the worker's D1 (`/admin/pending` for local-action). Players
are first names only; minors' contacts are never collected — the guardian's are.

The flyer PNG/PDFs in `oct10/downloads/` were exported from the design handoff
(`Oct 10 Flyers.dc.html`). Re-export there if a printed fact changes.
