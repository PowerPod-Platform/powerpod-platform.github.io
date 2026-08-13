/* PowerPod Platform — the performance tier.
 *
 * One question, answered once: can this machine composite this page's
 * full-screen pixel work at 60fps while a WebGL canvas redraws underneath it?
 *
 * Almost none of this page's cost is geometry. The drawing is a few thousand
 * line vertices and is effectively free. The cost is full-screen pixel work,
 * and two passes of it are stacked on each other: the grain's multiply blend,
 * and the film's own multisampled framebuffer. A current GPU absorbs both. A
 * 2013 integrated one cannot.
 *
 * There used to be a third and larger pass, and this file mostly existed to
 * remove it: the glaze drifted forever, and a blur whose input moves can never
 * be cached, so the background was re-rasterised every frame on every page even
 * while it sat idle. The glaze is now held still for everybody (styles/site.css
 * section 4), which means an idle page has nothing moving on it at all and the
 * watchdog below only ever samples during a scroll — scripts/scroll.js feeds
 * sample() from inside the film loop, and that loop runs only while something
 * is moving.
 *
 * THE LOW TIER REMOVES NOTHING. It trades two things a visitor cannot read: the
 * grain's blend mode, which over a backdrop this light is the same arithmetic
 * either way, and the film's framebuffer scale, which costs resolution on 1px
 * lines rather than lines. Nothing is smaller, softer, flatter or missing, and
 * a visitor who never sees the other tier cannot tell which one they are on.
 * That is the entire design goal: a slow machine gets a page that looks
 * identical and runs, never a visibly cheaper page that advertises its age.
 *
 * Two things decide the tier, in this order:
 *
 *   1. What can be known before drawing anything — a stored verdict from a
 *      previous visit, then software rendering and GPU families that predate
 *      this page's pixel budget.
 *   2. What actually happens. The heuristics above will misjudge somebody, so
 *      scripts/scroll.js feeds every rendered frame's timestamp to sample()
 *      and a sustained run of slow frames demotes the page for good.
 *
 * The verdict is stored, so a machine that failed the watchdog once starts
 * the next visit already settled rather than stuttering through another two
 * seconds to reach the same answer. There is deliberately no promotion path:
 * a page that has come to rest must not start moving again because one
 * window of frames happened to be quick.
 */
(function () {
  'use strict';

  var html = document.documentElement;

  /* =====================================================================
     TUNABLES
     ===================================================================== */

  var KEY = 'pp-tier';        // localStorage; holds a verdict, never a reason

  /* Framebuffer scale for the film. The cap matters far more than the
     antialiasing does: MSAA is what keeps a 1px CAD line from crawling as the
     camera moves, so it stays ON in both tiers and the resolution is what
     gives. Dropping 2 to 1.5 is 44% less fill for a difference invisible on
     antialiased line art; turning MSAA off instead would save less and would
     be the one change a viewer actually notices. */
  var DPR_HIGH = 2;
  var DPR_LOW = 1.5;

  /* The watchdog. A window has to be MOSTLY slow, not occasionally slow: one
     long frame is a garbage collection, thirty-three of sixty is a machine
     that cannot do this. */
  var WARMUP = 90;        // frames skipped while first-paint work all lands at once
  var WINDOW = 60;        // frames per verdict
  var SLOW_MS = 28;       // a frame slower than ~36fps
  var SLOW_SHARE = 0.55;  // share of a window that has to be slow to demote
  var STALL_MS = 250;     // beyond this it is a tab switch or a GC pause, not a frame

  /* Renderer strings that are not a judgement call.
     Guessing wrong in this direction is cheap — a fast machine wrongly listed
     here loses only the drift — while guessing wrong the other way is a
     stuttering page until the watchdog catches up a couple of seconds later.
     Even so the list is kept to families that genuinely predate this page's
     pixel budget rather than to anything merely integrated, because the
     watchdog is the real mechanism and this is only its head start. */
  var WEAK = [
    /swiftshader|llvmpipe|softpipe|software|basic render/,     // no GPU at all
    /intel.*\b(gma|hd graphics (2000|3000|4000|4400|4600))\b/, // pre-2014 integrated
    /geforce (8|9)\d{2}m\b|geforce gt \d{3}m\b/,               // pre-2013 mobile discrete
    /powervr sgx|mali-4\d\d|adreno \(tm\) [23]\d\d/            // old mobile parts
  ];

  /* =====================================================================
     THE PROBE

     One WebGL context, created once and handed straight back. scripts/
     scroll.js used to open its own just to ask whether WebGL exists at all;
     it reads `webgl` off here instead now, so the page opens exactly one
     throwaway context rather than two, and this one does not leak — browsers
     cap live contexts, and the real renderer still has to get one.
     ===================================================================== */
  var hasGL = false, glName = '';

  (function probe() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return;
      hasGL = true;
      /* WEBGL_debug_renderer_info is a hint, not a guarantee: several browsers
         mask it for fingerprinting reasons and hand back something generic.
         That lands here as an unrecognised string, which is treated as
         "assume fine, and measure" rather than as a reason to demote. */
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                  : gl.getParameter(gl.RENDERER);
      glName = String(s || '').toLowerCase();
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) { /* no WebGL: hasGL stays false, and the film will not run */ }
  })();

  /* =====================================================================
     THE VERDICT
     ===================================================================== */

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return (v === 'low' || v === 'high') ? v : null;
    } catch (e) { return null; }   // private mode, or storage disabled
  }

  function remember(t) {
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }

  function guess() {
    if (!hasGL) return 'low';      // software compositing all the way down
    for (var i = 0; i < WEAK.length; i++) if (WEAK[i].test(glName)) return 'low';
    /* The other way this goes wrong: a very large panel on an unremarkable
       GPU. Every cost on this page is per pixel, so a 4K screen asks four
       times what a 1080p one does from hardware that may be no faster. Only
       demoted when the CPU side looks modest too, since a 4K panel on a
       workstation is not the case being caught here. */
    var px = (screen.width || 0) * (screen.height || 0) *
             Math.pow(window.devicePixelRatio || 1, 2);
    if (px > 12e6 && (navigator.hardwareConcurrency || 8) <= 4) return 'low';
    return 'high';
  }

  /* ?gpu=low / ?gpu=high forces a tier for this page view and is deliberately
     not stored — it is how you look at the other path on your own machine
     without poisoning what the page believes about it afterwards. */
  function override() {
    var m = /[?&]gpu=(low|high)\b/.exec(location.search);
    return m ? m[1] : null;
  }

  var forced = override();
  var tier = forced || stored() || guess();

  function apply() {
    /* One class, and everything that hangs off the tier hangs off it — the
       grain's blend mode in styles/site.css section 12, and the film's
       framebuffer scale through pixelRatio() below. The glaze used to be the
       third; it is held still on every tier now and reads no class. */
    if (tier === 'low') html.classList.add('gpu-low');
    else html.classList.remove('gpu-low');
  }
  apply();

  var listeners = [];

  function demote() {
    if (tier === 'low') return;
    tier = 'low';
    apply();
    if (!forced) remember('low');
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](tier); } catch (e) {}
    }
  }

  /* =====================================================================
     THE WATCHDOG

     Fed one timestamp per rendered frame by scripts/scroll.js's rAF loop —
     which only runs while something is actually moving, so these are real
     frames under real load rather than an idle page's easy ones.
     ===================================================================== */
  var last = 0, seen = 0, inWindow = 0, slow = 0;

  function sample(now) {
    if (tier === 'low' || forced) return;
    if (!last) { last = now; return; }
    var dt = now - last;
    last = now;
    /* A gap either side of plausible is not a frame rate. The loop stops
       whenever the page comes to rest, so long gaps here are ordinary. */
    if (dt <= 0 || dt > STALL_MS) return;
    if (++seen <= WARMUP) return;   // shader compile, first blur raster, font swap
    inWindow++;
    if (dt > SLOW_MS) slow++;
    if (inWindow >= WINDOW) {
      if (slow / inWindow > SLOW_SHARE) demote();
      inWindow = 0;
      slow = 0;
    }
  }

  /* =====================================================================
     THE SURFACE
     ===================================================================== */
  window.PPPerf = {
    /* 'high' | 'low'. Read it, do not write it — demotion is one-way and has
       to go through the watchdog so the verdict is stored with it. */
    get tier() { return tier; },

    /* Whether a WebGL context could be had at all, so scripts/scroll.js does
       not have to open a second one to find out. */
    webgl: hasGL,

    /* What scripts/cinema.js should hand THREE.WebGLRenderer.setPixelRatio.
       Read on every resize rather than once at startup, so a demotion mid-
       scroll only has to call the film's own resize() to take effect. */
    pixelRatio: function () {
      var dpr = window.devicePixelRatio || 1;
      return Math.min(dpr, tier === 'low' ? DPR_LOW : DPR_HIGH);
    },

    sample: sample,

    /* Called once, with the new tier, if the page is ever demoted. */
    onTier: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };
})();
