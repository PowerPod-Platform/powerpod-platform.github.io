/* PowerPod Platform — the scroll controller.
 *
 * There is one scroll on this page and this file owns it, in two halves.
 *
 * THE PAGER moves the document, but it no longer fights the visitor to do it.
 * A deliberate gesture — an arrow key, Space, Home/End — is turned into
 * exactly one page step, played out as a two-phase glide of our own (see
 * BEAT below): fast while the camera is still arriving, then slower while
 * the chapter's own content beat plays out in front of the now-settled text.
 * A continuous gesture — a wheel, a trackpad fling, a touch drag — is left
 * entirely to the browser's native scrolling: nothing is intercepted and
 * nothing pulls it onto a chapter afterwards either, so scrolling fast feels
 * exactly as fast as the visitor moves it and stopping between two chapters
 * is a place the visitor is genuinely allowed to be. Nothing else in the
 * page has to know either way: the copy animates from `scrollY` through CSS
 * scroll-driven animations (styles/site.css, with scripts/reel.js scrubbing them by hand
 * where those are unsupported), so moving `scrollY` — by us or by the
 * browser — drives all of it.
 *
 * THE FILM FEED reads that same scroll and hands scripts/cinema.js a frame.
 * Position is measured in CHAPTER UNITS:
 *
 *     u = (scrollY - reel.top) / chapter-span        0 .. chapter count
 *
 * so u = 4.5 is the middle of chapter 4 no matter how tall a chapter is or
 * what the viewport is doing. The span is read off the .reel__metric probe,
 * exactly as scripts/reel.js reads it, so the svh arithmetic stays in CSS and
 * the two drivers cannot drift apart.
 *
 * ANCHORS then maps u to the film's own clock. That indirection is the whole
 * trick: scripts/cinema.js keeps its original, heavily tuned choreography on
 * an untouched 0..1 timeline, and this table decides which slice of it plays
 * under which chapter. Retiming the film against the words is editing one
 * column of numbers, not re-authoring sixty animation windows.
 *
 * There is no smoothing left in the feed, and there is nothing to smooth:
 * whatever moves the scroll — our own tween or the browser's own scrolling —
 * is read on every frame, so the film always shows exactly where the reel is.
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var reel = document.querySelector('.reel');
  var stage = document.querySelector('.reel__stage');
  var metric = document.querySelector('.reel__metric');
  var footer = document.querySelector('.closing');
  var host = document.getElementById('film');
  if (!reel || !stage || !metric) return;

  /* scripts/perf.js already opened a context to identify the GPU and handed it
     straight back, so its answer is reused rather than a second one opened
     here — browsers cap how many are live at once, and the film still needs
     one of its own. The local probe is the fallback for perf.js not being
     there at all, and it leaks its context by necessity: there is nothing to
     hand it to. */
  function hasWebGL() {
    if (window.PPPerf) return window.PPPerf.webgl;
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
                (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------------
     The map, in chapter units.

     A chapter arrives at u = c, is readable from c+0.07 to c+0.88, and has
     departed by c+0.96. So the film should TRAVEL across a handoff
     (c+0.88 -> c+1.07) and be very nearly STILL through a hold. Every pair
     below is one of those two things; keeping them in that order is what
     makes the film feel like it is illustrating the sentence on screen
     rather than racing it.

     These are the original, fully-authored values — every chapter's "held"
     figure genuinely is its finished frame. What used to go wrong is not the
     numbers, it is that the pager rested at u = page + 0.5, half way through
     an arrive/held pair, before the beat playing out inside it had actually
     finished. BEAT (below) is what now carries the visitor the rest of the
     way there, in the open, rather than the anchors being moved to hide it.
     --------------------------------------------------------------------- */
  var ANCHORS = [
    /* u        t       chapter / beat                                    */
    [0.00,   0.000],  //  0  hero, the plan view, faint behind the wordmark
    [0.88,   0.004],  //     held
    [1.30,   0.008],  //  1  why a standard: the drawing, inked in
    [1.88,   0.014],  //     held
    /* Chapters 1 and 2 share the plan view, which the film holds perfectly
       still from t 0 to 0.026. That is deliberate. It is the shot that states
       the envelope, and it is the only place in Act I where the pod can
       change size without the change reading as a camera move: everywhere
       else between here and the cells the camera is travelling, and its roll
       swings hard as it comes off a near-vertical look. */
    [2.20,   0.017],  //  2  one form factor, still on the drawing
    [2.88,   0.027],  //     the balance: larger, smaller, then the size chosen
    [3.30,   0.088],  //  3  standard outside: casing dissolves, cells stack
    [3.88,   0.130],  //     pack full, upright
    [4.07,   0.138],  //  4  chemistry: the cells lie down
    [4.88,   0.242],  //     and stand back up
    [5.30,   0.300],  //  5  BMS, frontal
    [5.88,   0.372],  //     two alternate layouts on the same frame
    [6.30,   0.402],  //  6  connector face
    [6.88,   0.436],  //     held
    [7.30,   0.486],  //  7  IoT board
    [7.88,   0.520],  //     held
    [8.30,   0.640],  //  8  wide shot, rise, morph, PowerPodOS lands
    [8.88,   0.672],  //     the dashboard finishes drawing itself
    [9.30,   0.690],  //  9  the phone rises beside it
    [9.88,   0.736],  //     state of charge settles
    [10.20,  0.760],  // 10  signal drops
    [10.88,  0.856],  //     BLE link, billed on device, settled
    [11.30,  0.900],  // 11  the pod as hero
    [11.88,  0.952],  //     pod, dashboard and phone at 1:1
    [12.20,  0.972],  // 12  all three recede
    [13.00,  1.000]   //     gone
  ];

  /* Monotonic piecewise-linear, deliberately not eased. The pager's tween
     already carries the easing for the whole transition, copy and film alike;
     easing here as well would ease the film twice and leave it lagging the
     words through the middle of every handoff, which is the one place it
     would show. */
  function remap(u) {
    if (u <= ANCHORS[0][0]) return ANCHORS[0][1];
    var n = ANCHORS.length;
    if (u >= ANCHORS[n - 1][0]) return ANCHORS[n - 1][1];
    var i = 0;
    while (i < n - 2 && u > ANCHORS[i + 1][0]) i++;
    var a = ANCHORS[i], b = ANCHORS[i + 1];
    return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
  }

  /* styles/site.css sets `html { scroll-behavior: smooth }`, which governs
     `window.scrollTo()` as much as it governs anything else — but every
     write in this file is already one step of an easing curve this file
     itself is authoring (the BEAT glide, the wheel-smoothing coast below).
     Letting the browser layer its own smoothing on top of a position that
     is already moving smoothly, once per rendered frame, would fight that
     easing rather than help it. `behavior: 'instant'` opts every write here
     back out, unconditionally. */
  function jumpTo(y) { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(x, a, b) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* The hero and the closing roster are the two chapters whose copy is
     centred on screen rather than sitting in the band, so the subject drops
     back to the middle of the frame for both. */
  function liftAt(u) {
    return smoothstep(u, 0.80, 1.20) * (1 - smoothstep(u, 11.90, 12.20));
  }

  /* A blueprint under the wordmark that inks itself in as the hero leaves,
     and recedes again under the roster at the end. */
  function dimAt(u) {
    return (0.28 + 0.72 * smoothstep(u, 0.55, 1.15))
         * (1 - 0.55 * smoothstep(u, 12.00, 12.55));
  }

  /* The film is the optional half. Without WebGL there is no drawing to feed,
     but the words are still thirteen pages and the pager still owns them. */
  var film = null;
  if (host && window.PPCinema && hasWebGL()) {
    film = window.PPCinema.init(host);
    html.classList.add('film-live');
  }

  /* =====================================================================
     GEOMETRY
     ===================================================================== */
  var span = 1, count = 1, reelTop = 0, pinned = false;

  function measure() {
    // getBoundingClientRect, not offsetHeight: the latter rounds to whole
    // pixels, which is enough to walk the film out of step with the copy over
    // thirteen chapters.
    span = Math.max(1, metric.getBoundingClientRect().height);
    count = Math.max(1, document.querySelectorAll('.chapter').length);
    reelTop = reel.offsetTop;
    // The stage is only sticky in the two layouts where chapters stack in one
    // place and the scroll is a timeline — the native one, and the one
    // scripts/reel.js switches on with .reel-scrub. Anywhere else the reel is
    // an ordinary document and paging it would fight the visitor. reel.js runs
    // after this file, so this is re-read on the first frame and every resize
    // rather than decided once at startup.
    pinned = getComputedStyle(stage).position === 'sticky';
    if (film) film.resize();
  }

  /* Where a page comes to rest, in scroll pixels.

     Every chapter rests at u = page + REST — deep into its own hold (86% of
     the way through the chapter's own CSS animation-range, styles/site.css),
     just short of the 88% mark where chapter-life starts fading the text back
     out, so there is headroom against float rounding. Sitting this late in
     the hold, rather than dead centre of it, is what leaves room for BEAT's
     content phase (below) to actually finish playing before the page settles.

     The hero is the exception, at u = 0.5 rather than u = page + REST: it has
     no arrival beat of its own to play out, and hero-life (styles/site.css)
     holds full opacity from 0% all the way to 88%, so resting it mid-hold is
     exactly as safe as resting it at the very top — it just costs the same
     1.0 chapter-units to leave as every other hop costs, instead of 1.5.

     Chapter 5 is its own exception, at 0.64 rather than 0.86: CAM1's camera
     (scripts/cinema.js) holds the BMS frontal only up to t=0.350 before a
     fast, hard-authored arc swings it round to the connector face for
     chapter 6 — reached by t=0.376 — so 0.86 (t≈0.3695) rests deep inside
     that swing, with the BMS long gone from frame. 0.64 (t≈0.342) rests just
     after the board's own swap cycle finishes (compressed to land by 0.335,
     see scripts/cinema.js) and comfortably before the camera ever moves. */
  var HERO_REST = 0.5;
  var REST = 0.86;
  var REST_OVERRIDE = { 5: 0.64 };

  function settleY(page) {
    var f = page <= 0 ? HERO_REST : (REST_OVERRIDE[page] || REST);
    return reelTop + (page + f) * span;
  }

  function nearestPage(y) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < count; i++) {
      var d = Math.abs(settleY(i) - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* Where the reel stops being ours. Past the last chapter the stage unpins
     and the closing footer is an ordinary document, so the pager hands the
     scroll back rather than trapping the visitor in the reel. */
  function footerY() {
    return footer ? footer.offsetTop
                  : reelTop + reel.getBoundingClientRect().height;
  }

  /* The border between the two, taken half way between the last page and the
     footer rather than a fixed distance past the last page: the tail of the
     reel is where the stage unpins, and anywhere in the near half of it the
     visitor is still reading the last chapter and should be paging. */
  function releaseLine() { return (settleY(count - 1) + footerY()) / 2; }

  /* =====================================================================
     THE PAGER
     ===================================================================== */
  /* Pace, in milliseconds per chapter unit travelled, for the PLAIN glide —
     backward steps and Home/End/the handoff to the footer, all keyboard-only
     now that a wheel/touch scroll is never pulled onto a page (see SETTLING
     below). Duration is derived from distance rather than fixed, so a step
     between neighbours and a jump to the end move at the same speed. The
     floor keeps a short corrective snap from being instant; the ceiling
     keeps End from taking ten seconds. */
  var PACE = 1800, MIN_MS = 450, MAX_MS = 4600;

  /* =====================================================================
     THE BEAT

     A forward step is not one glide, it is two, back to back: a fast camera
     arrival (t1) to the point where the chapter's text is fully on screen —
     already an anchor in ANCHORS, the "arrive" figure — followed by a
     slower, deliberate content beat (t2) that plays out from there to
     u = page + REST. The visitor sees the same one continuous scroll either
     way; it just isn't constant-speed, so the interesting part of each
     chapter — cells re-stacking, the BMS swapping boards, the dashboard
     drawing itself — plays in the open, after the words have already
     arrived, instead of being buried inside a fast camera move.

     arriveFraction mirrors each chapter's first ANCHORS entry (+0.30 for
     most, +0.20 for 2/6/10/12, +0.07 for 4 — chemistry continues straight out
     of chapter 3's already-open casing). t1/t2 default when omitted; a few
     chapters get more time because there is more happening in them:
       5  the full original -> alternate -> original BMS swap
       8  the calm zoom-out/morph into the PowerPodOS shot, then the
          dashboard drawing itself
       10 signal drop -> telemetry -> BLE -> billed -> settled
     ===================================================================== */
  var T1_DEFAULT = 900, T2_DEFAULT = 2400;
  var BEAT = {
    1:  [0.30], 2: [0.20], 3: [0.30], 4: [0.07],
    5:  [0.30, null, 2600],
    6:  [0.30], 7: [0.30],
    8:  [0.30, 2800, 2200],
    9:  [0.30],
    10: [0.20, null, 2600],
    11: [0.30], 12: [0.20]
  };

  var page = 0;           // the chapter the visitor is on
  var busy = false;       // a transition is playing
  var beatMode = false;   // the current transition is a bent (arrive+content) one
  var released = false;   // handed the scroll back for the footer
  var pendingRelease = false;
  var fromY = 0, bendY = 0, bendV = 0, toY = 0, toPage = 0, t0 = 0, dur = 0, t1 = 0, t2 = 0;

  /* WHEEL SMOOTHING — see the 'wheel' listener under INPUT below for why this
     exists at all: CSS `scroll-behavior: smooth` only ever smooths a
     programmatic scroll, never one the user drives directly with an input
     device, so a plain mouse's chunky, fixed-size wheel notches would
     otherwise still land as instant jumps. `wheelTarget` is the running sum
     of every notch since the wheel last went idle; each frame nudges
     `scrollY` a fraction of the way toward it (see coastWheel in THE LOOP),
     so ten quick notches read as one continuous glide rather than ten
     little teleports, with no snapping or fixed destination involved — it
     dissolves however far the gesture asked for, nothing more. */
  var wheelTarget = null;
  var WHEEL_TAU = 90;      // ms; how quickly scrollY closes the gap to wheelTarget
  var lastFrameT = 0;

  function easeInOut(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  /* A cubic Hermite segment: p0/p1 the two ends, v0/v1 their velocities (in
     units of Y per ms), dur the segment's own duration, s its local 0..1
     fraction through it. Used only for the bent (arrive + content) glide —
     see glideBeat below for why a plain two-piece ease was replaced with
     this. */
  function hermite(p0, v0, p1, v1, s, segDur) {
    var s2 = s * s, s3 = s2 * s;
    var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s;
    var h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return h00 * p0 + h10 * segDur * v0 + h01 * p1 + h11 * segDur * v1;
  }

  // True while gestures belong to the pager rather than to the browser.
  function engaged() { return pinned && !released; }

  /* The plain, single-phase glide: used for backward steps, Home/End and the
     footer handoff — the three cases that were never a forward read-through
     and so never earned the two-phase beat above. */
  function glide(y, target) {
    fromY = window.scrollY;
    toY = y;
    toPage = target;
    beatMode = false;
    dur = clamp(Math.abs(toY - fromY) / span * PACE, MIN_MS, MAX_MS);
    t0 = performance.now();
    busy = true;
    wake();
  }

  /* The bent, two-phase glide a forward step onto a BEAT chapter takes: a
     fast camera arrival (t1) to the point the text is on screen, then a
     slower content beat (t2) on to the rest.

     Both legs are one continuous Hermite spline, not two ease functions
     stitched together at the bend. Two separately-eased pieces (an ease-out
     arrival meeting an ease-in content beat) each flatten to zero velocity
     right at the join, which stacks into a visible stall exactly where the
     text has just arrived — the one moment this most needed to keep moving.
     Standing the bend's own velocity at the Catmull-Rom average of the two
     legs' secant slopes keeps the whole glide moving through it: easing away
     from the previous rest, continuing through the bend, easing into this
     one. */
  function glideBeat(target) {
    var b = BEAT[target];
    fromY = window.scrollY;
    bendY = reelTop + (target + b[0]) * span;
    toY = settleY(target);
    toPage = target;
    t1 = b[1] || T1_DEFAULT;
    t2 = b[2] || T2_DEFAULT;
    bendV = 0.5 * ((bendY - fromY) / t1 + (toY - bendY) / t2);
    dur = t1 + t2;
    t0 = performance.now();
    busy = true;
    beatMode = true;
    wake();
  }

  function goTo(target) {
    target = Math.round(clamp(target, 0, count - 1));
    var y = settleY(target);
    if (target === page && Math.abs(window.scrollY - y) < 2) return;
    glide(y, target);
  }

  function step(dir) {
    if (dir > 0 && page >= count - 1) { release(); return; }
    var target = page + dir;
    if (dir > 0 && BEAT[target]) glideBeat(target);
    else goTo(target);
  }

  /* The handoff is only complete once the footer is actually on screen. Until
     then the pager still swallows keyboard input, or a Space that asked for
     the footer would also scroll the page it is already animating. */
  function release() {
    pendingRelease = true;
    glide(footerY(), count - 1);
  }

  /* =====================================================================
     THE LOOP

     One rAF, shared. It advances whichever tween is playing, then feeds the
     film from wherever the scroll actually ended up — including scroll the
     pager did not cause, so the drawing tracks a native wheel/touch scroll or
     a scrollbar drag exactly as faithfully as it tracks a page step. Every
     beat is a pure function of u, so a still page is a still image: there is
     nothing to redraw once everything has come to rest.
     ===================================================================== */
  var running = false;
  var quietUntil = 0;

  function frame(now) {
    if (busy) {
      var elapsed = now - t0;
      var y;
      if (beatMode) {
        if (elapsed <= t1) {
          var k1 = t1 > 0 ? clamp(elapsed / t1, 0, 1) : 1;
          y = hermite(fromY, 0, bendY, bendV, k1, t1);
        } else {
          var k2 = t2 > 0 ? clamp((elapsed - t1) / t2, 0, 1) : 1;
          y = hermite(bendY, bendV, toY, 0, k2, t2);
        }
      } else {
        var k = dur > 0 ? clamp(elapsed / dur, 0, 1) : 1;
        y = fromY + (toY - fromY) * easeInOut(k);
      }
      jumpTo(y);
      if (elapsed >= dur) {
        jumpTo(toY);
        page = toPage;
        busy = false;
        beatMode = false;
        if (pendingRelease) { released = true; pendingRelease = false; }
      }
    } else if (wheelTarget !== null) {
      // Coast the actual scroll toward the accumulated wheel target — see
      // the WHEEL SMOOTHING comment above `wheelTarget`'s declaration.
      // Frame-rate independent (a dropped frame doesn't leave it undershot),
      // and self-terminating: once within half a pixel it snaps the last
      // sliver and clears the target rather than approaching it forever.
      var dt = lastFrameT ? clamp(now - lastFrameT, 0, 48) : 16;
      var cy = window.scrollY;
      var factor = 1 - Math.exp(-dt / WHEEL_TAU);
      var ny = cy + (wheelTarget - cy) * factor;
      if (Math.abs(wheelTarget - ny) < 0.5) { ny = wheelTarget; wheelTarget = null; }
      jumpTo(ny);
    }
    lastFrameT = now;

    var v = (window.scrollY - reelTop) / span;
    var u = clamp(Number.isFinite(v) ? v : 0, 0, count);
    markIndex(u);

    if (film) {
      film.frame(remap(u), dimAt(u), liftAt(u));
      /* Fed only from here, and only when there is a film to draw: this loop
         runs while something is actually moving, so these are frames under
         real load rather than an idle page's easy ones. scripts/perf.js
         decides what to do about a sustained run of slow ones. */
      if (window.PPPerf) window.PPPerf.sample(now);
    }

    if (busy || wheelTarget !== null || performance.now() < quietUntil) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function wake() {
    quietUntil = performance.now() + 300;
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  /* =====================================================================
     INPUT

     Two different promises for two different gestures. A key press is a
     single, unambiguous "next chapter" — it gets the full BEAT treatment
     above. A wheel, trackpad fling or touch drag is continuous and its
     destination is the visitor's to set, not ours, and there is still no
     snapping anywhere in here: a wheel notch only ever asks to move by
     exactly the distance it reports, smoothed (see WHEEL SMOOTHING above),
     never rounded onto a chapter. Touch is left alone entirely — a finger
     already scrolls exactly as smoothly as the drag that drives it, with no
     chunky, fixed-size notch to smooth out.
     ===================================================================== */
  function maxScrollY() {
    return Math.max(0, document.documentElement.scrollHeight - innerHeight);
  }

  addEventListener('wheel', function (e) {
    // ctrl+wheel is zoom, on a trackpad and on a mouse alike. It is not a
    // scroll and it is not ours to take.
    if (e.ctrlKey) return;
    if (busy) { busy = false; beatMode = false; }
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;        // lines
    else if (e.deltaMode === 2) d *= innerHeight; // pages
    e.preventDefault();
    var base = wheelTarget === null ? window.scrollY : wheelTarget;
    wheelTarget = clamp(base + d, 0, maxScrollY());
    wake();
  }, { passive: false });

  addEventListener('touchstart', function (e) {
    if (engaged() && busy) { busy = false; beatMode = false; }
  }, { passive: true });

  /* Space is the one key with a meaning of its own: on a control it activates
     rather than scrolls, and taking it would break the button it is aimed at.
     Everything else here only ever scrolled, so paging it is the same promise
     kept at the reel's own resolution. */
  function activates(el) {
    return !!(el && el.closest &&
      el.closest('button, summary, input, select, textarea, [contenteditable], [role="button"]'));
  }

  addEventListener('keydown', function (e) {
    if (!engaged() || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key, dir = 0, to = -1;
    if (k === 'ArrowDown' || k === 'PageDown') dir = 1;
    else if (k === 'ArrowUp' || k === 'PageUp') dir = -1;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = count - 1;
    else if (k === ' ' || k === 'Spacebar') {
      if (activates(e.target)) return;
      dir = e.shiftKey ? -1 : 1;
    } else return;

    e.preventDefault();
    if (busy) return;
    if (to >= 0) goTo(to); else step(dir);
  });

  /* =====================================================================
     SETTLING

     There is no snap. Everything that moves the scroll without the pager
     animating it itself — a native wheel/touch scroll, a scrollbar drag, a
     focus ring landing on the CTA, a restored position — is left exactly
     where it lands, full stop, including between two chapters. All that
     happens here is bookkeeping: `page` is kept pointing at whichever
     chapter is nearest, purely so the *next* keyboard step (which does still
     animate) starts from the right place, and `released` is kept tracking
     whether the visitor has scrolled down into the footer, so the pager
     knows to let go of the keyboard there and take it back when they scroll
     back up. Neither of those touches `scrollY` itself. */
  function trackPosition() {
    if (busy || !pinned) return;
    var y = window.scrollY;
    released = y > releaseLine();
    if (!released) page = nearestPage(y);
  }

  addEventListener('scroll', function () {
    wake();
    trackPosition();
  }, { passive: true });

  /* =====================================================================
     LIFECYCLE
     ===================================================================== */
  /* Put the scroll back on a page without animating it.

     `keep` is the difference between a reflow and an arrival. A resize changes
     what a chapter is worth in pixels, so the page the visitor is reading has
     to be carried across and re-measured; asking where they are afterwards
     would read the old position against the new geometry and hand back the
     wrong chapter. A restored or freshly loaded position has no page behind
     it yet, so there the scroll is the only thing to go on. */
  function snap(keep) {
    busy = false;                       // a reflow outranks a transition
    beatMode = false;
    pendingRelease = false;
    if (!pinned) return;
    var y = window.scrollY;
    if (!keep) {
      released = y > releaseLine();
      page = nearestPage(y);
    }
    if (!released) jumpTo(settleY(page));
  }

  // A restored scroll position is a position the pager never chose, and the
  // browser restores it after this file runs. Owning it here means the reel
  // always opens on a page rather than half way through a handoff.
  try { history.scrollRestoration = 'manual'; } catch (e) {}

  measure();
  snap();
  wake();

  // scripts/reel.js is loaded after this file and only then switches on the
  // sticky layout it needs, so the first real measurement is the next frame's.
  requestAnimationFrame(function () { measure(); snap(); wake(); });

  /* =====================================================================
     THE STATION INDEX

     Two things make a long scroll tiring and only one of them is length. The
     other is not knowing how much of it is left: uncertainty makes any
     distance feel longer than it is, and thirteen chapters with no horizon
     is a lot of uncertainty. The index answers both — it says where you are,
     it says how many remain, and it lets you go straight to one.

     It also closes a gap this page had from the start. THE BEAT above — the
     two-phase glide that lets a chapter's own content beat play in the open,
     after its words have already landed — only ever answered a key press. A
     phone has no keys. Every touch visitor was getting all of the distance
     and none of the choreography, which is precisely backwards, since the
     thumb is the input that tires. A tap on a station is a deliberate,
     discrete gesture in exactly the sense a key press is, so it is answered
     the same way rather than with a jump.

     Nothing in here intercepts a gesture. A drag is still a drag, still ends
     exactly where the visitor put it, and stopping between two chapters is
     still somewhere they are allowed to be.
     ===================================================================== */
  var index = document.querySelector('.index');
  var stations = index ? index.querySelectorAll('.index__link') : [];
  var indexLive = false, marked = -1;

  function markIndex(u) {
    if (!index) return;
    var live = pinned && u > 0.6 && u < count - 0.02;
    if (live !== indexLive) {
      indexLive = live;
      html.classList.toggle('index-live', live);
    }
    if (!live) return;
    /* floor(u), not nearestPage(): the mark follows the FILM, so it moves
       with what is on screen rather than with where a keyboard step would
       land. The two differ through a handoff, which is exactly when a mark
       that lags is most obvious. */
    var at = clamp(Math.floor(u), 0, count - 1);
    if (at === marked) return;
    if (stations[marked]) stations[marked].removeAttribute('aria-current');
    if (stations[at]) stations[at].setAttribute('aria-current', 'true');
    marked = at;
  }

  if (index) {
    index.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('.index__link') : null;
      if (!a) return;
      /* Off the pinned layout the reel is an ordinary document and the href
         is a real fragment link to a real heading. Let it be one. */
      if (!pinned) return;
      e.preventDefault();
      var to = parseInt(a.getAttribute('data-page'), 10);
      if (!(to >= 0)) return;
      /* A tap from inside the footer is a request to come back into the reel,
         which is the one place the pager has deliberately let go of. */
      released = false;
      /* Only the next chapter earns the bent glide. Its fast leg is timed for
         one chapter's travel, and asking it to carry ten would spend that
         900ms crossing most of the film. Everything else takes the plain
         glide, whose duration is derived from the distance. */
      if (to === page + 1 && BEAT[to]) glideBeat(to);
      else goTo(to);
    });
  }

  /* =====================================================================
     RESIZE, AND THE MOBILE URL BAR

     A phone's URL bar sliding in or out fires `resize` — several times, over
     the couple of hundred milliseconds its animation takes — with a changed
     innerHeight and an unchanged innerWidth. It does that precisely when the
     visitor is scrolling UP, because that is the direction that brings the bar
     back; scrolling down hides it once and it stays hidden. That asymmetry was
     the whole of why scrolling up felt broken and scrolling down felt fine.

     Handled naively, each of those events did two expensive and one actively
     hostile thing: measure() reallocated the film's multisampled framebuffer
     (seven times in 250ms, measured, at a phone's devicePixelRatio of 3), and
     snap(true) scrolled the page to the current chapter's rest point — a
     programmatic scroll fighting a thumb that was still on the glass.

     Neither is necessary, because nothing about the reel's geometry actually
     changes when that bar moves. Every length that sets the reel's timing is
     in `svh` (styles/site.css section 2), which is defined against the
     viewport with the bar SHOWN and does not move for the life of the page.
     The only thing that genuinely needs updating is the film's framebuffer,
     and that can wait until the bar has stopped moving.

     So: coalesce every resize into one pass after things settle, and re-seat
     the scroll only for a change that is really a reshape — a width change, or
     a height change too large to be browser chrome. */

  var SETTLE_MS = 160;    // longer than a URL bar animation, shorter than a
                          // drag between two deliberate window sizes
  var CHROME_MAX = 220;   // px; taller than any mobile browser's own furniture

  var lastW = innerWidth, lastH = innerHeight;
  var settleTimer = 0, reshaped = false;

  function onResize() {
    var w = innerWidth, h = innerHeight;
    if (w !== lastW || Math.abs(h - lastH) > CHROME_MAX) reshaped = true;
    lastW = w;
    lastH = h;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      measure();
      /* Only a real reshape has moved the visitor's place in the reel and
         earns the right to move them back onto a page. A URL bar has not. */
      if (reshaped) snap(true);
      reshaped = false;
      wake();
    }, SETTLE_MS);
  }

  addEventListener('load', function () { measure(); snap(true); wake(); });
  addEventListener('resize', onResize);
  addEventListener('pageshow', function () { measure(); snap(); wake(); });
  addEventListener('orientationchange', function () {
    setTimeout(function () { measure(); snap(true); wake(); }, 120);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) wake();
  });
  // The two device screens are canvas textures: they have to be repainted
  // once DM Sans has actually arrived, and a still page would otherwise never
  // ask for another frame.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(wake);
  }
})();
