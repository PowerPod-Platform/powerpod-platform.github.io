# PowerPod Platform — website

Static site. No build step for the page itself, no framework, and no
third-party script served from a third-party origin — the one exception is
Firebase Analytics, which does call out to Google at runtime (see below).

```
index.html                        the page (hero + 12 chapters + footer)
contact.html                      Get in touch fallback, plain white (no film, for no-JS)
styles/site.css                   sitewide stylesheet
scripts/scroll.js                 the one scroll controller
scripts/cinema.js                 the film: scene, choreography, update(t)
scripts/pod-geometry.js           digitised CAD the film draws
scripts/reel.js                   copy-animation fallback driver (see below)
scripts/firebase-config.js        the project config, shared by both bundles
scripts/firebase.js               Firebase app + Analytics init source
scripts/contact.js                form: schema listener, render, submit
scripts/touch.js                  Get in touch: underline → card (no Firebase)
scripts/vendor/three.min.js       three.js r128, vendored
scripts/vendor/firebase.min.js    Firebase app + Analytics, bundled and vendored
scripts/vendor/contact.min.js     Firebase + Firestore + form, bundled and vendored
firestore.rules                   public form schema read, create-only submissions
firebase.json                     rules-only deploy (Hosting stays GitHub Pages)
fonts/DMSans-Variable-latin.woff2 DM Sans variable, weights 100–1000
package.json                      dev-only tooling to rebuild vendored Firebase bundles
CNAME                             custom domain
.nojekyll                         disables GitHub Pages' Jekyll processing
```

## Local preview

Serve over HTTP rather than opening the file directly. `file://` origins can
block the font fetch under CORS rules, and Get in touch does not work there at
all: the origin is `null`, so Firestore's requests are refused, and a refused
listener is not an error it reports — `onSnapshot` simply stays pending in
offline mode. The card opens, the three waiting ticks breathe, and no question
ever arrives. There is nothing to debug in that; it is the protocol.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## The glaze is static, everywhere

Four oversized colour fields under one full-viewport
`filter: blur(clamp(40px, 6vmax, 70px))` (styles/site.css section 4). They used to
drift on mutually prime 29-to-61-second cycles, and that was by a wide margin the
most expensive thing this site did: a blur whose input moves can never be cached,
so the layer was re-rasterised every frame, on every page, forever — including on
an idle page nobody was looking at.

Held still it collapses to one rasterisation, reused for the life of the page, and
the per-frame cost of the background is zero. Same four blobs, same blur radius,
same colours, same oversized container, same sheen. The same picture, not a moving
one. Every blob sits at opacity 1, which is the most saturated the glaze ever got;
that is the composition now, not a frame sampled out of a loop.

The film and the chapter transitions are untouched by this and always were.

The grain (section 6) went the same way for the same kind of reason: it no
longer blends. Between them, the page's full-screen pixel work is now the film
alone, and styles/site.css section 12 — the performance tier's CSS — is empty.

## The shape of the page

Two things ride one scroll: a **film** (a fixed, transparent WebGL canvas
drawing the real pod as hidden-line wireframe) and the **copy** (thirteen
chapters crossfading in a sticky stage). The ceramic glaze is the background
for both, and it is a still picture — see below.

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

## The page never moves itself

There is no snap and, as of now, no assist either. A scroll ends exactly where
the gesture left it, including between two chapters, and the page does not
adjust itself afterwards for any reason.

`scripts/scroll.js` used to carry an assist: it noticed the visitor coming to
rest somewhere unresolved — a title mid-settle, body copy nine per cent
revealed — and after a 650ms dwell finished the beat for them. It was careful
work (once per stop, never against a gesture, never inside a chapter's hold,
cancelled by any input) and it was built for touch specifically, on the
reasoning that a phone has no keys and so a thumb got all of the distance and
none of the choreography.

On a phone it read as a bug. The sequence is flick, lift, momentum ends, read,
and then a second later the page slides somewhere you did not ask it to go,
which is indistinguishable from the site losing its place. It is gone, along
with `quintic()`, `glideCalm()`, the dwell, the refusal bookkeeping and
`travelDir`, which existed only to serve it.

The deliberate version of the same idea survives and is the one to build on:
the **station index**. A tap on it is a discrete, deliberate gesture, so it is
answered with the full glide — asked for rather than offered. Arrow keys,
Space, Home and End still page the same way.

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
roster, and the specification CTA. All other copy is final.

**No em dashes in rendered copy.** The commas are deliberate. This includes
every string on `contact.html` and every label seeded into `config/form`.

## Get in touch

The underline under `Get in touch` **is** the form. `scripts/touch.js` measures
`.touch-origin__rule`, lays `.touch-plate` over it at exactly its rect, and
plays that box's geometry — `left`, `top`, `width`, `height`, corner radius and
fill — to the card's. On landing the card takes its own chrome, identical to
the plate's, and the plate is hidden on the same frame at the same rect.

Three things hold that together and none of them is optional:

- **The card is a fixed size** (`--card-w` / `--card-h`, styles/site.css
  section 2). That is what lets the morph know the rectangle it is growing into
  before `config/form` has arrived, and it is why the form asks **one question
  at a time**: a card sized to nine fields would be a scrolling column, and a
  card that resized between questions would have no target rect to aim at.
  Every question is laid out to fit this box, the longest being the four-option
  `primaryGoal`. Change `--card-h` and check that one. The progress ticks sit
  at the **head** of the card, under the title: "how much is left" is asked
  before starting, not after finishing.
- **The plate animates geometry, not a transform.** Scaling the sheet is
  cheaper and is what this used to do; a non-uniform scale smears the 1px
  border to a fraction of a pixel on two sides and turns the corner radius into
  an ellipse, and the edge and the corner are the two things anyone watches
  here.
- **The fill is on its own clock.** Geometry runs 820ms on a curve that holds
  the line as a line for the first fifth; the ink → ceramic hand-off runs 150ms.
  On one clock, the ink is still most of the fill when the rectangle is already
  a third grown, and what opens in the middle of the page is a grey slab.

### The open card costs nothing to hold

It is a popup over the last page of the film, and while it is up **that page
stops moving**:

- **The background was already still.** The glaze does not drift on any page
  (section 4), so opening the card has nothing to stop. It used to pause the
  drift for the duration; that rule is gone with the drift.
- **There is no `backdrop-filter` in section 15.** A translucent card over a
  live backdrop is a full re-blur of a card-sized region every frame the
  backdrop changes. `--card-fill` is opaque; the card is a flat fill with an
  edge and a shadow. This is also why there is no `.gpu-low` branch for the
  card any more: there is nothing left to opt out of.
- **Nothing is started.** No held WebGL frame, no `saturate()` transition on
  the glaze, no viewport-sized bloom. All three existed, all three were
  continuous GPU time spent decorating a page that is covered up.

The veil is one static gradient at one opacity transition: a whisper at the
outer edge so the frame has somewhere to end.

### Closing, in the only order that works

`.is-landed` carries the card's border, fill and shadow. Taking it off first
removed all three on that frame, while the plate that inherits them was still
`hidden` until `morph()` ran `CONTENT_OUT` later — so the card did not shrink,
it blinked: 150ms of empty page, then a full-size rectangle appearing from
nowhere to collapse.

So the rectangle exists before the card stops being one. `rest()` parks the
plate on the sheet's measured rect and shows it while the sheet still has its
chrome; `.is-landed` then comes off on a frame where two identical rectangles
are stacked and one is removed. Nothing changes on screen. Only then does the
content fade (0.18s, and `.is-landed` sets `transition: opacity 0s` so landing
stays instant under the content's own arrival beats), and only then does the
geometry move. `.touch-open` comes off last, not first.

## Things that will bite if changed

- **Nothing may scroll the page that the visitor did not ask for.** The assist
  was removed for this reason and should not come back in another form. If
  something has to move the scroll, it goes through `jumpTo()`, which forces
  `behavior: 'instant'` — `html` sets `scroll-behavior: smooth`, so any bare
  `scrollTo()` animates and reads as the page sliding on its own.
- **The keyboard goes down before the card collapses.** `afterKeyboard()` in
  `scripts/touch.js` blurs the focused field, waits for `visualViewport` to go
  quiet, and only then starts the close. A keyboard is a viewport change, so
  dismissing it at the same moment the scroll unlocks put two viewport
  transitions in flight at once and every rect was measured in the middle of
  both — the card landed short of the footer and left the page on the un-stuck
  stage with every chapter faded out. Nothing focused means no wait at all.
- **Get in touch records and restores the scroll across its lock.** See
  `rememberScroll()` / `restoreScroll()` in `scripts/touch.js`. A phone brings
  its URL bar back when the root is locked with `overflow: hidden`, which moves
  what the maximum scroll position is, and iOS may not honour the lock at all.
  Without the restore, closing the card near the end of the reel lands a few
  hundred pixels above the footer, on the un-stuck stage with every chapter
  already faded out — a blank screen.
- **The grain must never get a `mix-blend-mode` back.** A blend mode on a
  full-viewport element at the top of the stack cannot be composited alone: the
  compositor flattens everything beneath it into one buffer, reads it back and
  blends, every frame anything below changes — which during a scroll is every
  frame, at roughly eight million pixels on a DPR 2 laptop display, on top of
  the film's own render. It is bandwidth rather than shader work, so fast
  hardware does not absorb it; on shared-memory machines it saturates the bus
  and spins the fan. What it bought was the film's ink lines staying at pure
  `#000000` instead of about `#060606`.
- **Nothing in the glaze may animate again, and `will-change` counts.** Both
  halves come back together or not at all: the animations are what move the
  blur's input, and `will-change` is what keeps each blob on its own composited
  layer, which is what stops five layers feeding a filter from ever being
  cacheable. Adding either one back re-introduces a full-viewport blur
  re-rasterised every frame, on every page, forever. That is the entire cost
  freezing it removed.
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
- **`display: grid` on `.touch-layer` out-specifies `[hidden]`.** The attribute
  alone does not close the card; `.touch-layer[hidden] { display: none }` is
  what does. Without it the close mark sits in the corner of the footer.
- **`scrollbar-gutter: stable` on `html` is load-bearing.** Opening the card
  locks the document with `overflow: hidden`. Where scrollbars take real width,
  that hands back 15px of viewport on the way in and takes it away again on the
  way out, sliding the page sideways under a rectangle that is in the middle of
  growing out of one of its own pixels.
- **The DOM holds one question at a time, so it is not the source of truth.**
  `values` in `scripts/contact.js` is. `readStep()` is the only write to it.
- **`scripts/touch.js` must stay ahead of `three.min.js` in the defer queue.**
  Deferred scripts run in order, and until this one has parsed, `Get in touch`
  is still a plain link: a click landing in that window navigates to
  `contact.html` instead of opening the card. Behind three.js and the Firebase
  bundle that window was hundreds of kilobytes long.
- **Serving over `file://` is not a test.** Firestore is refused from a `null`
  origin and reports nothing; the card just waits forever. See Local preview.

## Firebase

The site is registered as the `powerpod-platform` Firebase project's web app.
Analytics runs on the film. Firestore is injected on the first hint that the
form is wanted — a pointer settling on `Get in touch`, a focus ring landing on
it, a finger touching it — which is what gives the 820ms morph a chance to
cover the download. `contact.html` is the no-JS fallback: the same card and the
same one-question-at-a-time form, with no film to hold behind it and no
underline to grow out of.

Vendored bundles are **committed**. GitHub Pages serves flat files, so
`node_modules` is never shipped and there is no build step at deploy time.

```sh
npm install
npm run build          # firebase.min.js + contact.min.js
```

`index.html` loads `scripts/vendor/firebase.min.js` last, deferred: `app` plus
Analytics, assigned to `window.PPFirebase`. Firestore is not in that file.
`scripts/touch.js` injects `scripts/vendor/contact.min.js` on the first hover,
focus or touch of the origin. It listens to `config/form` and writes
`submissions/{autoId}` only after Send succeeds. The first schema to arrive is
the one that renders and the listener ignores every later one: re-rendering
mid-answer would throw away the values already given, and after Send it would
throw away the confirmation.

**The two bundles do not share a Firebase app, and cannot.** Each carries its
own copy of the SDK, and `_registerComponent` writes into the registry of the
copy that runs it — so the app `firebase.js` created carries `firebase.js`'s
own container, and handing it to the other copy's `getFirestore()` throws
`Service firestore is not available`. That is what shipped, on both pages, for
as long as `contact.js` read `window.PPFirebase.app`. Each bundle now calls
`initializeApp` itself against the shared `scripts/firebase-config.js`. Two
SDK copies, two app objects, one project. The split still earns its keep: it
is what keeps ~350kb of Firestore off a visit that never opens the form.

If you ever see that error again, this is it, and the fix is never to make one
bundle borrow the other's app.

`contact.html` loads `contact.min.js` on its own — no `perf.js` (there is no
film and no glaze on that page to set a tier for) and no dependency on
`firebase.min.js`, which it loads last only for Analytics.

Rules live in `firestore.rules` and deploy independently of GitHub Pages:

```sh
npx -y firebase-tools@latest deploy --only firestore:rules --project powerpod-platform
```

`config/form` is world-readable (the questions). `submissions` is create-only
for the client; reads stay with the Admin SDK in Paddock. Prototype rules:
review them before a public launch.

Seed the schema from the Paddock repo (Admin SDK):

```sh
npm run seed:powerpod-platform-form
```

Run that in Central Ledger, not in this repo.

App Check: set `APP_CHECK_SITE_KEY` in `scripts/contact.js` to the reCAPTCHA
v3 site key from Firebase Console → App Check, rebuild `contact.min.js`, then
switch Firestore from Monitor to Enforce. Until the key is set, submits still
work and the quota is protected only by rules.

**Two things worth knowing:**

- The `firebaseConfig` object (`apiKey` included) is meant to be public. It
  identifies the project to Google's servers, it does not authorize access.
  Submissions are protected by Firestore Security Rules, not by hiding this
  file.
- Analytics calls out to `googletagmanager.com` / `google-analytics.com` at
  runtime, the one deliberate exception to "no third-party request" above.
  `scripts/firebase.js` wraps it in `isSupported()` so it resolves to `null`
  rather than throwing under a tracking blocker, in an unsupported browser, or
  when the page is opened via `file://`. Before a public launch in a region
  covered by cookie-consent law (e.g. GDPR), add a consent gate before
  Analytics initializes. None exists yet.

## Deploying

Push to `main`; GitHub Pages serves it. Every path is relative, so the site
works at a domain root and under a `/<repo-name>/` subpath alike.

GitHub Pages is a static host: client-side JavaScript runs normally, but there
is no server-side execution, no API routes and no secrets — anything committed
here is public.
