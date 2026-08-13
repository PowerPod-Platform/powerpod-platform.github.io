/* PowerPod Platform — the input guard.
 *
 * Cancels the context menu and the keyboard shortcuts that open developer
 * tools or the page source, across every desktop browser and both modifier
 * conventions (Ctrl+Shift on Windows/Linux, Cmd+Option on macOS).
 *
 * WHAT THIS IS, HONESTLY
 *
 * A deterrent, not a control. It raises the effort from "one keystroke" to
 * "two menu clicks", and that is the whole of what any page can do. Everything
 * below is cancelled by the browser only because the browser chooses to let a
 * page cancel it, and there are several routes to the same place that make no
 * such offer:
 *
 *   · The menu. View > Developer > Inspect Elements, or the ⋮ / hamburger menu
 *     under More Tools. No key event is dispatched, so there is nothing here
 *     to cancel. This is the common path and it is untouched.
 *   · `view-source:` typed into the address bar, which is a navigation.
 *   · JavaScript switched off, which switches this file off with it. The
 *     styles/site.css half of the guard (section 13) survives that; this half
 *     does not.
 *   · curl, wget, Save Page As, the browser's own disk cache, an extension,
 *     a proxy, Reader mode.
 *   · On iOS and Android there are no developer-tool shortcuts to intercept in
 *     the first place. Inspecting a phone means USB remote debugging driven
 *     from a desktop — Safari's Web Inspector, or chrome://inspect — and the
 *     page is not a participant in that conversation and cannot become one.
 *
 * And the shape of the problem underneath all of it: the browser has to
 * receive this code and run it in order to draw the page, so anything it can
 * run, somebody can read. The only real reduction is to make what they read
 * worth less — minified, comment-stripped output — which is a build step, not
 * a listener.
 *
 * There is deliberately no devtools DETECTOR in here: no `debugger` statement
 * on a timer, no window-size heuristic, no console.log timing trick. They are
 * all defeated by a checkbox, they all fire on people who never opened
 * anything, and a timer running a `debugger` statement would spend real frame
 * budget on every visitor — on a page that goes to some length elsewhere
 * (scripts/perf.js) not to.
 */
(function () {
  'use strict';

  /* Everything is bound in the CAPTURE phase on window, so a blocked
     combination is stopped before it reaches any other listener — including
     the pager in scripts/scroll.js, which owns the arrow keys, Space, Home
     and End and must keep seeing all of them. Nothing here is cancelled
     unless it matches, so those pass straight through. */
  var CAPTURE = true;

  /* ---------------------------------------------------------------------
     THE CONTEXT MENU

     Cancelling `contextmenu` covers the right mouse button, the trackpad
     two-finger tap, the Menu key on a full keyboard, Shift+F10, and — on
     Android — the long press, which Chrome delivers as this same event.
     iOS does NOT: the long-press callout there is not a DOM event at all and
     is only reachable from CSS, which is why the guard has a second half in
     styles/site.css section 13.
     --------------------------------------------------------------------- */
  function isField(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  window.addEventListener('contextmenu', function (e) {
    if (isField(e.target)) return;
    e.preventDefault();
  }, CAPTURE);

  /* ---------------------------------------------------------------------
     THE KEYBOARD

     Two conventions, and browsers on the same OS disagree, so both are
     covered on both platforms rather than branching on a sniffed OS — a
     Windows keyboard plugged into a Mac, or the reverse, sends whichever it
     sends, and there is no cost to accepting both.
     --------------------------------------------------------------------- */

  /* Ctrl/Cmd + Shift + <key>. The panel shortcuts:
       I  inspector   Chrome, Edge, Firefox, Brave, Opera, Vivaldi
       J  console     Chrome, Edge, Brave
       C  node picker Chrome, Edge, Firefox
       K  web console Firefox
       E  network     Firefox
       M  device / responsive-design mode   Chrome, Firefox
       S  debugger    older Firefox
       P  command menu */
  var WITH_SHIFT = 'ijckemsp';

  /* Cmd + Option + <key>, the macOS convention, used by Chrome, Safari,
     Firefox and Edge alike:
       I  inspector          J  console         C  node picker
       K  web console        E  network         M  responsive mode
       U  view source        R  Safari responsive-design mode */
  var WITH_ALT = 'ijckemur';

  /* Ctrl/Cmd + <key>, no third modifier:
       U  view source
       S  save page
     Print is deliberately absent. It reveals nothing that is not already on
     the screen, and taking it is pure friction for somebody who only wanted
     to print the page. */
  var PLAIN = 'us';

  /* `key` is universal on anything current, but old Android WebViews and a
     few embedded browsers still only fill in `keyCode`, and those are exactly
     the clients least likely to be current. Mapped back to a name so there is
     one code path below rather than two parallel sets of comparisons. */
  var CODES = {
    112: 'f1', 123: 'f12',
    67: 'c', 69: 'e', 73: 'i', 74: 'j', 75: 'k', 77: 'm',
    80: 'p', 82: 'r', 83: 's', 85: 'u'
  };

  function named(e) {
    var k = e.key;
    if (typeof k === 'string' && k) return k.toLowerCase();
    return CODES[e.keyCode] || '';
  }

  function blocked(e) {
    var k = named(e);
    if (!k) return false;

    /* One "command" modifier, whichever the OS calls it. */
    var cmd = e.ctrlKey || e.metaKey;

    /* F12 — Chrome, Edge, Firefox, Opera and Vivaldi on Windows and Linux, and
       on a Mac keyboard with the function-key row inverted. Matched with no
       regard for modifiers on purpose: laptops that need Fn to reach it, and
       keyboards that report the result with Shift or Alt still held, all land
       here, and there is no combination containing F12 worth letting past. */
    if (k === 'f12') return true;

    if (cmd && e.shiftKey && k.length === 1 && WITH_SHIFT.indexOf(k) > -1) return true;
    if (e.metaKey && e.altKey && k.length === 1 && WITH_ALT.indexOf(k) > -1) return true;
    /* Ctrl+Alt as well: Linux window managers occasionally remap Cmd to Ctrl
       wholesale, and Firefox on Linux accepts Ctrl+Alt for some of these. */
    if (e.ctrlKey && e.altKey && k.length === 1 && WITH_ALT.indexOf(k) > -1) return true;

    if (cmd && !e.shiftKey && !e.altKey && k.length === 1 && PLAIN.indexOf(k) > -1) return true;

    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (!blocked(e)) return;
    e.preventDefault();
    e.stopPropagation();
    /* Stops the event dead rather than merely cancelling its default, so a
       listener bound earlier on the same target never runs either. */
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }, CAPTURE);

  /* Some browsers act on `keyup` for a few of these instead. Cheap to cover,
     and harmless: the same predicate, so the same combinations and no
     others. */
  window.addEventListener('keyup', function (e) {
    if (blocked(e)) e.preventDefault();
  }, CAPTURE);

  /* ---------------------------------------------------------------------
     SELECTION, DRAG AND COPY

     The CSS half (styles/site.css section 13) already stops a selection
     starting by pointer. These cover the routes that do not go through a
     pointer at all — Ctrl+A then Ctrl+C, a double-click that beats the style,
     dragging the wordmark out onto the desktop.

     This is the part of the guard with a real cost to ordinary visitors: the
     page's whole content is copy that somebody may legitimately want to
     quote. If that trade stops being worth it, these three listeners and the
     styles/site.css section 13 selection rules come out together and nothing
     else is affected.
     --------------------------------------------------------------------- */
  ['selectstart', 'dragstart', 'copy', 'cut'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (isField(e.target)) return;
      e.preventDefault();
    }, CAPTURE);
  });
})();
