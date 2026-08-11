/* PowerPod Platform — the scroll controller.
 *
 * There is one scroll on this page and this file owns it, in two halves.
 *
 * THE PAGER moves the document. The reel is thirteen chapters and the visitor
 * reads one of them at a time, so a scroll is not a distance here, it is an
 * instruction: go to the next chapter. Every gesture — a wheel tick, a swipe,
 * an arrow key — is turned into exactly one page step, and the page step is
 * played out as a scroll of our own over a fixed pace. Nothing else in the
 * page has to know: the copy animates from `scrollY` through CSS scroll-driven
 * animations (styles/site.css, with scripts/reel.js scrubbing them by hand
 * where those are unsupported), so moving `scrollY` deliberately drives all of
 * it, exactly as a hand-rolled scroll used to.
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
 * There is no smoothing left in the feed, and there is nothing to smooth: the
 * only thing that ever moves the scroll is the pager's own eased tween, so the
 * film runs at the pace this file chose rather than at the pace of a wheel.
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

  // Reduced motion gets the stacked document the stylesheet already renders,
  // with no film behind it and no paging over it. Both a scroll-driven camera
  // and a scroll we animate ourselves are exactly what the preference is
  // asking us not to do.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function hasWebGL() {
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
    /* The cells finish stacking before the page comes to rest rather than
       part way through it, so the copy never arrives over a pack that is
       visibly still assembling itself. */
    [3.16,   0.090],  //  3  standard outside: casing dissolves, cells stack
    [3.50,   0.134],  //     pack full, upright — reached exactly at rest
    [3.88,   0.134],  //     held flat for the remainder of the read
    [4.07,   0.138],  //  4  chemistry: the cells lie down
    [4.88,   0.242],  //     and stand back up
    [5.30,   0.300],  //  5  BMS, frontal
    [5.88,   0.372],  //     two alternate layouts on the same frame
    [6.30,   0.402],  //  6  connector face
    /* Parked in the camera's own authored hold (0.400 -> 0.430 in
       scripts/cinema.js) by the time the page rests, not just short of it. */
    [6.50,   0.436],  //     held — reached at rest
    [6.88,   0.436],  //     held flat for the remainder of the read
    [7.30,   0.486],  //  7  IoT board
    [7.88,   0.520],  //     held
    [8.30,   0.640],  //  8  wide shot, rise, morph, PowerPodOS lands
    /* The dashboard finishes drawing itself before the page rests, so the
       phone's own rise (which starts right after) never overlaps it. */
    [8.50,   0.672],  //     the dashboard finishes drawing itself — at rest
    [8.88,   0.672],  //     held flat for the remainder of the read
    [9.30,   0.690],  //  9  the phone rises beside it
    [9.88,   0.736],  //     state of charge settles
    [10.20,  0.760],  // 10  signal drops
    /* The pod is fully in frame and telemetry is mid-pulse by the time the
       page rests, rather than resting before either has happened. */
    [10.50,  0.838],  //     BLE link, billed on device — sending at rest
    [10.88,  0.838],  //     held flat for the remainder of the read
    [11.30,  0.900],  // 11  the pod as hero
    /* All three — pod, dashboard, phone — are visible by the time the page
       rests, rather than resting before the dashboard and phone appear. */
    [11.50,  0.952],  //     pod, dashboard and phone at 1:1 — at rest
    [11.88,  0.952],  //     held flat for the remainder of the read
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

     Mid-chapter: the CSS range runs from one overlap before the chapter to one
     overlap after it, so u = i + 0.5 is dead centre of it — the middle of the
     hold, with the arrival long finished and the departure nowhere near.

     The hero is the exception. It is authored to be at rest at scroll 0: its
     range starts there and it has no arrival beat, so parking it half a
     chapter down would scroll the page on load for a frame that looks the
     same. Page 0 is simply the top of the document. */
  var SETTLE = 0.5;

  function settleY(page) {
    return page <= 0 ? reelTop : reelTop + (page + SETTLE) * span;
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
  /* Pace, in milliseconds per chapter unit travelled. Duration is derived
     from distance rather than fixed, so a step between neighbours and a jump
     to the end move the film at the same speed — the point of the whole
     rewrite is that the drawing plays at one known pace, whatever the input
     was. The floor keeps a short corrective snap from being instant; the
     ceiling keeps End from taking ten seconds. */
  var PACE = 1500, MIN_MS = 450, MAX_MS = 4200;
  var WHEEL_DEAD = 4;     // trackpad noise and inertia dribble
  var SWIPE = 40;         // px of travel before a touch counts as a swipe
  var IDLE = 140;         // quiet time before a stray scroll is settled

  var page = 0;           // the chapter the visitor is on
  var busy = false;       // a transition is playing; input is locked out
  var released = false;   // handed the scroll back for the footer
  var pendingRelease = false;
  var fromY = 0, toY = 0, toPage = 0, t0 = 0, dur = 0;
  var guardUntil = 0;     // ignore the scroll events our own tween emits

  function easeInOut(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  // True while gestures belong to the pager rather than to the browser.
  function engaged() { return pinned && !released; }

  function glide(y, target) {
    fromY = window.scrollY;
    toY = y;
    toPage = target;
    dur = clamp(Math.abs(toY - fromY) / span * PACE, MIN_MS, MAX_MS);
    t0 = performance.now();
    busy = true;
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
    goTo(page + dir);
  }

  /* The handoff is only complete once the footer is actually on screen. Until
     then the pager still swallows input, or the wheel that asked for the
     footer would also scroll the page it is already animating. */
  function release() {
    pendingRelease = true;
    glide(footerY(), count - 1);
  }

  /* =====================================================================
     THE LOOP

     One rAF, shared. It advances the tween, then feeds the film from wherever
     the scroll actually ended up — including scroll the pager did not cause,
     so the drawing tracks a scrollbar drag as faithfully as it tracks a page
     step. Every beat is a pure function of u, so a still page is a still
     image: there is nothing to redraw once everything has come to rest.
     ===================================================================== */
  var running = false;
  var quietUntil = 0;

  function frame(now) {
    if (busy) {
      var k = dur > 0 ? clamp((now - t0) / dur, 0, 1) : 1;
      window.scrollTo(0, fromY + (toY - fromY) * easeInOut(k));
      if (k >= 1) {
        window.scrollTo(0, toY);
        page = toPage;
        busy = false;
        if (pendingRelease) { released = true; pendingRelease = false; }
        guardUntil = now + 150;
      }
    }

    if (film) {
      var v = (window.scrollY - reelTop) / span;
      var u = clamp(Number.isFinite(v) ? v : 0, 0, count);
      film.frame(remap(u), dimAt(u), liftAt(u));
    }

    if (busy || performance.now() < quietUntil) {
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

     One gesture, one page. While a transition plays the gesture is swallowed
     rather than queued: a flick of the wheel throws a dozen events and the
     visitor asked for one chapter, not twelve.
     ===================================================================== */
  addEventListener('wheel', function (e) {
    // ctrl+wheel is zoom, on a trackpad and on a mouse alike. It is not a
    // scroll and it is not ours to take.
    if (!engaged() || e.ctrlKey) return;
    e.preventDefault();
    if (busy) return;
    // A wheel can report lines or pages as readily as pixels, and a notch of
    // three lines would fall straight through a dead zone measured in pixels.
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;
    else if (e.deltaMode === 2) d *= innerHeight;
    if (Math.abs(d) < WHEEL_DEAD) return;
    step(d > 0 ? 1 : -1);
  }, { passive: false });

  var touchY = 0, touching = false;

  addEventListener('touchstart', function (e) {
    if (!engaged() || e.touches.length !== 1) { touching = false; return; }
    touchY = e.touches[0].clientY;
    touching = true;
  }, { passive: true });

  addEventListener('touchmove', function (e) {
    if (!touching || !engaged()) return;
    // The reel is a pager on a phone too, so the drag must not also scroll.
    e.preventDefault();
  }, { passive: false });

  addEventListener('touchend', function (e) {
    if (!touching) return;
    touching = false;
    if (!engaged() || busy) return;
    var end = (e.changedTouches && e.changedTouches[0])
      ? e.changedTouches[0].clientY : touchY;
    var dy = touchY - end;                 // dragging up asks for the next page
    if (Math.abs(dy) < SWIPE) return;
    step(dy > 0 ? 1 : -1);
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

  /* Everything that moves the scroll without asking us — a scrollbar drag, a
     focus ring landing on the CTA, a restored position — is allowed to happen
     and then settled onto the nearest page once it stops. It is also how the
     pager takes the scroll back when the visitor returns from the footer. */
  var idle = 0;

  function settleDrift() {
    if (busy || !pinned) return;
    if (performance.now() < guardUntil) return;
    var y = window.scrollY;
    if (y > releaseLine()) { released = true; return; }
    released = false;
    var p = nearestPage(y);
    page = p;
    if (Math.abs(y - settleY(p)) > 2) glide(settleY(p), p);
  }

  addEventListener('scroll', function () {
    wake();
    if (busy) return;
    clearTimeout(idle);
    idle = setTimeout(settleDrift, IDLE);
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
    pendingRelease = false;
    if (!pinned) return;
    var y = window.scrollY;
    if (!keep) {
      released = y > releaseLine();
      page = nearestPage(y);
    }
    if (!released) window.scrollTo(0, settleY(page));
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

  addEventListener('load', function () { measure(); snap(true); wake(); });
  addEventListener('resize', function () { measure(); snap(true); wake(); });
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
