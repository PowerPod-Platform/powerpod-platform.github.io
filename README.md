# PowerPod Platform — website

Static site. No build step, no framework, no third-party request at runtime.

```
index.html                        the page (hero + 12 chapters + footer)
styles/site.css                   sitewide stylesheet
scripts/scroll.js                 the one scroll controller
scripts/cinema.js                 the film: scene, choreography, update(t)
scripts/pod-geometry.js           digitised CAD the film draws
scripts/reel.js                   copy-animation fallback driver (see below)
scripts/vendor/three.min.js       three.js r128, vendored
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

## The shape of the page

Two things ride one scroll: a **film** (a fixed, transparent WebGL canvas
drawing the real pod as hidden-line wireframe) and the **copy** (thirteen
chapters crossfading in a sticky stage). The ceramic glaze is the background
for both and never resets.

Position is measured in **chapter units**:

```
u = (scrollY − reel.top) / chapter-span        0 .. chapter count
```

`u = 4.5` is the middle of chapter 4 whatever the viewport is doing. The span
comes from the `.reel__metric` probe, so the `svh` arithmetic lives only in
CSS and both drivers read the same number.

### How the two stay in sync

`scripts/cinema.js` exposes exactly one entry point, `frame(t, dim, lift)`,
where `t` is the film's own 0..1 clock. It reads no scroll and registers no
listeners. `scripts/scroll.js` owns the scroll, the rAF loop and the resize
handler, and converts `u` into `t` through the **`ANCHORS`** table at the top
of that file.

That indirection is the whole trick. The film keeps its original, heavily
tuned choreography on an untouched timeline, and the table decides which slice
of it plays under which chapter. Retiming the film against the words means
editing one column of numbers, not sixty animation windows.

The rule when editing it: a chapter `c` arrives at `u = c`, is readable from
`c+0.07` to `c+0.88`, and has departed by `c+0.96`. So the film should
**travel** across a handoff and be very nearly **still** through a hold.

`scroll.js` also passes `dim` (the film's overall opacity, which keeps the pod
a faint blueprint under the hero wordmark) and `lift` (how far the camera
dollies down to clear the copy band).

### Copy sits in a band

With a drawing behind it, copy centred in the frame lands on top of the very
thing it describes. Every chapter carrying a beat is marked `chapter--band`
and moves to the bottom of the viewport, with `.scrim` washing the drawing out
underneath it and the camera lifting its subject into the clear two thirds
above. The hero and the closing roster keep the centre: neither has a subject
to make room for.

All of that hangs off `.film-live`, which `scroll.js` adds to `<html>` only
once the film is actually running. Without it the page is the plain centred
reel on bare ceramic, which is what a browser with no WebGL and a page with
JavaScript off both get. (The cinema and the paged reel run unconditionally
otherwise — an OS-level reduced-motion preference is not checked.)

### Chapter timing

```
chapter i owns [i·span − overlap, (i+1)·span + overlap]
```

Absolute offsets, not percentages — percentages resolve against total document
scroll, so every chapter would re-time whenever page length changed.

All thirteen chapters live in **one sticky stage**, stacked in the same grid
cell. The obvious alternative — one tall sticky block per chapter — leaves an
unavoidable ~100svh gap where the outgoing chapter has faded and the incoming
one has not started, because a chapter unpins exactly when its successor is
still a full viewport below.

### Two drivers, one set of keyframes

Chrome/Edge 115+ and Safari 26+ run the copy natively on the compositor with
no JavaScript. Firefox does not ship `animation-timeline` until 156 (stable is
153 as of August 2026), so `scripts/reel.js` scrubs **the same CSS
`@keyframes`** by hand via the Web Animations API. The motion is described in
exactly one place, so the two paths cannot drift.

With neither — no scroll timelines *and* no JavaScript — the page falls back
to a plain stacked document with all copy visible. Never a blank page.

## Adding a section

1. Copy a `<section class="chapter chapter--band">` block in `index.html`,
   give it the next `--i`, and place it before the `chapter--last` one.
2. Bump `--chapter-count` on `.reel`.
3. Move `chapter--last` to whichever chapter is now final.
4. Add two rows to `ANCHORS` in `scripts/scroll.js` for the new chapter's
   hold, and shift every row after it up by one chapter unit.

Steps 1 to 3 are all the copy needs: the runway height, every
`animation-range`, and the fallback driver derive from `--i` and
`--chapter-count`. Step 4 is the film.

`chapter--last` matters — the final chapter arrives and *stays*. If it
departed like the others there would be an empty viewport between it and the
closing footer, since the stage still has its own height to scroll away.

## Still placeholder

`grep -n data-placeholder index.html` lists what is not real yet: the member
roster, and two `href="#"` links (the CTA and the footer contact), both marked
with `TODO` comments. All other copy is final.

**No em dashes in rendered copy.** The commas are deliberate.

## Things that will bite if changed

- **`overflow-x: clip` on `body` must not become `hidden`.** `hidden` makes the
  body a scroll container, which silently breaks `position: sticky` on every
  descendant and defeats the entire reel.
- **Never put `dvh` in the reel geometry.** Those values decide where chapters
  begin and end; `dvh` changes as the mobile URL bar collapses, which re-times
  the sequence mid-scroll. `svh` is fixed for the life of the page.
- **`PAPER` in `cinema.js` is `--porcelain`, not white.** It fills the occluder
  meshes that do the hidden-line pass, so it is the colour the pod is made of.
  White against the glaze reads as cut-outs punched in the page.
- **`update(t)` must stay a pure function of `t`.** Nothing may depend on the
  previous frame. That purity is why scrubbing backwards is identical to
  scrubbing forwards, and it is easy to break by accident with a `+=`.
- **Nothing outside DM Sans may be painted into the device screens.** They are
  canvas textures, so an unavailable glyph silently falls back to a system
  face. `₹` is outside the self-hosted subset and is drawn as a path by
  `rupee()` for exactly that reason.
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
