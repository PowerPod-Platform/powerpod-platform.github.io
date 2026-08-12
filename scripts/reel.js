/* PowerPod Platform — scroll-reel fallback driver.
 *
 * Browsers with CSS scroll-driven animations need nothing from this file; the
 * whole sequence runs on the compositor from stylesheet rules alone. This is
 * for the rest — chiefly Firefox, which does not ship `animation-timeline`
 * until 156, and Safari below 26.
 *
 * It does not reimplement the animation. The @keyframes in site.css remain the
 * only description of the motion; here those same CSS animations are simply
 * held paused and scrubbed by hand, so the two drivers cannot drift apart.
 */
(function () {
  'use strict';

  if (CSS.supports('animation-timeline', 'scroll(root block)')) return;

  var reel = document.querySelector('.reel');
  var stage = document.querySelector('.reel__stage');
  var metric = document.querySelector('.reel__metric:not(.reel__metric--hero)');
  var heroMetric = document.querySelector('.reel__metric--hero');
  if (!reel || !stage || !metric) return;

  document.documentElement.classList.add('reel-scrub');

  var targets = [];
  var span = 0;
  var heroSpan = 0;
  var lead = 0;
  var overlap = 0;

  function measure() {
    // --chapter-span resolved to px by the probe element, so the svh maths
    // lives in CSS only. Overlap then falls out of the runway's own geometry:
    // reel height - stage height === count * span + overlap.
    //
    // getBoundingClientRect over offsetHeight: the latter rounds to whole
    // pixels, which rounded a 44.8px overlap to 45 and left this driver a
    // fraction of a percent out of step with the native one.
    span = metric.getBoundingClientRect().height;
    // The hero owns a shorter span than everybody else (--hero-span in
    // site.css), and every chapter after it is pulled up by the difference.
    // Read rather than assumed, exactly as --chapter-span is.
    heroSpan = heroMetric ? heroMetric.getBoundingClientRect().height : span;
    lead = heroSpan - span;
    var chapters = document.querySelectorAll('.chapter');
    overlap = (reel.getBoundingClientRect().height
               - stage.getBoundingClientRect().height)
              - chapters.length * span - lead;

    targets = [];
    chapters.forEach(function (chapter) {
      var i = parseFloat(getComputedStyle(chapter).getPropertyValue('--i'));
      var hero = chapter.classList.contains('chapter--hero');
      // Mirrors the animation-range declarations in site.css.
      var start = hero ? 0 : i * span + lead - overlap;
      var end = hero ? heroSpan + overlap : (i + 1) * span + lead + overlap;

      var els = [chapter].concat(
        Array.prototype.slice.call(
          chapter.querySelectorAll('.chapter__title, .chapter__body')
        )
      );

      els.forEach(function (el) {
        el.getAnimations().forEach(function (anim) {
          targets.push({ anim: anim, start: start, extent: end - start });
        });
      });
    });
  }

  function apply() {
    // Clamped because iOS rubber-band overscroll reports scrollY below zero
    // and past the maximum, which would otherwise drive keyframes out of range.
    var y = window.scrollY - reel.offsetTop;
    for (var n = 0; n < targets.length; n++) {
      var t = targets[n];
      var p = (y - t.start) / t.extent;
      t.anim.currentTime = Math.min(1, Math.max(0, p)) * 1000;
    }
  }

  // Read scroll position inside rAF rather than trusting scroll-event cadence,
  // which stutters during iOS momentum. The loop is gated to idle shortly
  // after movement stops — a permanently spinning rAF is a battery cost with
  // no benefit on a page that is standing still.
  var running = false;
  var quietUntil = 0;

  function frame() {
    apply();
    if (performance.now() < quietUntil) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function wake() {
    quietUntil = performance.now() + 400;
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  measure();
  apply();

  addEventListener('scroll', wake, { passive: true });
  addEventListener('resize', function () {
    measure();
    apply();
  });
})();
