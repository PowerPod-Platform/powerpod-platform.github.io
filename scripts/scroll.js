/* PowerPod Platform — the scroll controller.
 *
 * There is one scroll on this page and this file owns it. The reel's runway is
 * the timeline for both halves of the site: the copy rides it through CSS
 * scroll-driven animations (styles/site.css, with scripts/reel.js scrubbing
 * them by hand where those are unsupported), and the film rides it through
 * here.
 *
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
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var reel = document.querySelector('.reel');
  var metric = document.querySelector('.reel__metric');
  var host = document.getElementById('film');
  if (!reel || !metric || !host || !window.PPCinema) return;

  // Reduced motion gets the stacked document the stylesheet already renders,
  // with no film behind it. A scroll-driven camera is exactly what the
  // preference is asking us not to do.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (!hasWebGL()) return;

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
    [0.88,   0.012],  //     held
    [1.30,   0.018],  //  1  why a standard: the drawing, inked in
    [1.88,   0.026],  //     held
    [2.20,   0.030],  //  2  one form factor: tilts up, casing still shut
    [2.88,   0.046],  //     the balance beat swells and returns
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

  /* Monotonic piecewise-linear, deliberately not eased. The copy animates
     linearly against scroll, so easing here would put the two out of step in
     the middle of every handoff, which is the one place it would show. */
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

  var film = window.PPCinema.init(host);
  html.classList.add('film-live');

  var span = 1, count = 1;

  function measure() {
    // getBoundingClientRect, not offsetHeight: the latter rounds to whole
    // pixels, which is enough to walk the film out of step with the copy over
    // thirteen chapters.
    span = Math.max(1, metric.getBoundingClientRect().height);
    count = Math.max(1, document.querySelectorAll('.chapter').length);
    film.resize();
  }

  var target = 0, prog = 0;

  function read() {
    var y = window.scrollY - reel.offsetTop;
    var v = y / span;
    target = Number.isFinite(v) ? clamp(v, 0, count) : 0;
  }

  /* Light smoothing only. It exists to take the stepping out of a mouse
     wheel, not to add drag: at 14/s the film is within a frame or two of the
     copy, which is the whole point of putting them on one timeline. */
  var RATE = 14;
  var last = performance.now();
  var running = false;
  var quietUntil = 0;

  function frame(now) {
    var dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);                       // tab switch, long stall

    if (!Number.isFinite(prog)) prog = target;     // self-heal
    if (!Number.isFinite(target)) target = 0;
    prog += (target - prog) * Math.min(1, dt * RATE);
    if (!Number.isFinite(prog)) prog = target;
    if (Math.abs(target - prog) < 0.0004) prog = target;

    var u = clamp(prog, 0, count);
    film.frame(remap(u), dimAt(u), liftAt(u));

    // Every beat is a pure function of u, so a still page is a still image:
    // there is nothing to redraw once the smoothing has caught up.
    if (prog !== target || performance.now() < quietUntil) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function wake() {
    quietUntil = performance.now() + 300;
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  measure();
  read();
  prog = target;
  wake();

  addEventListener('scroll', function () { read(); wake(); }, { passive: true });
  addEventListener('resize', function () { measure(); read(); wake(); });
  addEventListener('pageshow', function () { read(); prog = target; wake(); });
  addEventListener('orientationchange', function () {
    setTimeout(function () { measure(); read(); wake(); }, 120);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { read(); wake(); }
  });
  // The two device screens are canvas textures: they have to be repainted
  // once DM Sans has actually arrived, and a still page would otherwise never
  // ask for another frame.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(wake);
  }
})();
