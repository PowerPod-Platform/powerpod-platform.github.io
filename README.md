# PowerPod Platform — website

Static site. No build step, no dependencies, no framework.

```
index.html                        landing page (hero + 6 chapters + footer)
styles/site.css                   sitewide stylesheet
scripts/reel.js                   scroll fallback driver (see below)
fonts/DMSans-Variable-latin.woff2 DM Sans variable, weights 100–1000
CNAME                             custom domain
.nojekyll                         disables GitHub Pages' Jekyll processing
```

## Local preview

Serve over HTTP rather than opening the file directly — `file://` origins can
block the font fetch under CORS rules.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Replacing the placeholder copy

**All body copy is placeholder.** Every block written to be replaced carries a
`data-placeholder` attribute, so `grep -n data-placeholder index.html` lists
exactly what still needs real words. Two `href="#"` links (the CTA and the
footer contact) also need real destinations; both are marked with `TODO`
comments.

Chapter titles are real. Only the prose beneath them is scaffolding.

## How the scroll narrative works

Scrolling zooms each section out while the next arrives, settles it into a
title, holds it readable, then hands off. The ceramic background never resets.

All six chapters live in **one sticky stage**, stacked in the same grid cell.
The obvious alternative — one tall sticky block per chapter — leaves an
unavoidable ~100svh gap where the outgoing chapter has faded and the incoming
one has not started, because a chapter unpins exactly when its successor is
still a full viewport below.

Timing comes from `animation-range` offsets derived from `--i`:

```
chapter i owns [i·span − overlap, (i+1)·span + overlap]
```

Absolute offsets, not percentages — percentages resolve against total document
scroll, so every chapter would re-time whenever page length changed.

### Two drivers, one set of keyframes

Chrome/Edge 115+ and Safari 26+ run this natively on the compositor with no
JavaScript. Firefox does not ship `animation-timeline` until 156 (stable is
153 as of August 2026), so `scripts/reel.js` scrubs **the same CSS
`@keyframes`** by hand via the Web Animations API. The motion is described in
exactly one place, so the two paths cannot drift.

With neither — no scroll timelines *and* no JavaScript — the page falls back to
a plain stacked document with all copy visible. Never a blank page.

## Adding a section

1. Copy a `<section class="chapter">` block in `index.html`, give it the next
   `--i`, and place it before the `chapter--last` one.
2. Bump `--chapter-count` on `.reel`.
3. Move `chapter--last` to whichever chapter is now final.

Nothing else changes: the runway height, every `animation-range`, and the
fallback driver all derive from `--i` and `--chapter-count`.

`chapter--last` matters — the final chapter arrives and *stays*. If it departed
like the others there would be an empty viewport between it and the footer,
since the stage still has its own height left to scroll away.

## Things that will bite if changed

- **`overflow-x: clip` on `body` must not become `hidden`.** `hidden` makes the
  body a scroll container, which silently breaks `position: sticky` on every
  descendant and defeats the entire reel.
- **Never put `dvh` in the reel geometry.** Those values decide where chapters
  begin and end; `dvh` changes as the mobile URL bar collapses, which re-times
  the sequence mid-scroll. `svh` is fixed for the life of the page.
- **Do not set the `animation` shorthand on `.chapter__title` / `.chapter__body`
  after the `@supports` block.** The shorthand resets `animation-timeline` and
  `animation-range`, which strips the scroll timeline and freezes both at their
  end state — title never arriving oversized, body copy visible from frame one.
- **`--chapter-overlap` is deliberately small (2% of span).** Two titles centred
  in the same place cannot cross-fade: with a symmetric fade the crossing
  opacity *is* the minimum opacity, so continuity and double-exposure are the
  same number. A small overlap sequences them instead, with a brief deliberate
  breath between.
- **`opacity: 0` does not stop touches.** Chapters are `pointer-events: none` by
  default and only interactive during the hold beat. Without that, the topmost
  transparent chapter swallows every tap on the page.

## Deploying

Push to `main`; GitHub Pages serves it. Every path is relative, so the site
works at a domain root and under a `/<repo-name>/` subpath alike.

GitHub Pages is a static host: client-side JavaScript runs normally, but there
is no server-side execution, no API routes and no secrets — anything committed
here is public.
