/* PowerPod Platform — Get in touch, from the underline.
 *
 * A few kilobytes, no Firebase. The film page loads this always. Firestore
 * arrives only as scripts/vendor/contact.min.js, on the first hint that the
 * form is wanted, so a visitor who never opens it never pays to parse it.
 *
 * THE MOVE. The card is already laid out at rest, centred and at its final
 * size (styles/site.css section 15 — it is a fixed size precisely so this
 * file can know the target rect before the schema exists). What animates is
 * .touch-plate: a bare fixed box put over .touch-origin__rule at exactly its
 * rect, whose geometry is then played to the sheet's. left, top, width,
 * height, corner radius and fill all move together, so a 1px ink line
 * thickens into a ceramic card and keeps a true 1px edge and a true corner
 * for every frame in between.
 *
 * Scaling the sheet itself would have been cheaper and is what this file used
 * to do. It cannot work: a non-uniform scale smears the border to a fraction
 * of a pixel on two sides and turns the corner radius into an ellipse, and
 * the two things anyone actually watches in this transition are the edge and
 * the corner. Geometry on one empty box is a layout of one box per frame,
 * which is nothing.
 *
 * On landing the sheet takes its own chrome — identical to the plate's, from
 * the same --card-fill — and the plate is hidden on the same frame at the same
 * rect. The handover is two identical rectangles, so there is nothing to see.
 *
 * Behind it, nothing happens. The page the card opens over is the page that
 * was already there, and it was already still: the glaze does not drift on any
 * page any more (styles/site.css section 4), so there is nothing for opening
 * the card to stop and neither file starts anything of its own. A form is a
 * popup over the last page of the film, not a second film.
 *
 * href="contact.html" on the origin is the real destination. This file only
 * intercepts when it can. JavaScript off still navigates.
 */
(function () {
  'use strict';

  /* NOT the house curve. cubic-bezier(0.2, 0.7, 0.2, 1) is what the index
     ticks and the veil both use, and it is heavily front-loaded: a
     third of the distance in the first tenth of the time. That is right for a
     tick changing length and wrong for the one move on this page whose whole
     point is legibility, because it means the rectangle is two hundred pixels
     across before anyone has registered that a line was where it started. This
     curve holds the line as a line for the first fifth, sweeps it open, and
     settles. */
  var EASE = 'cubic-bezier(0.55, 0.02, 0.16, 1)';
  var OPEN_MS = 820;
  var CLOSE_MS = 560;
  /* The card's content leaves before the rectangle starts collapsing. Closing
     both at once reads as the card being deleted; sequencing them reads as it
     folding back into the line it came out of. */
  var CONTENT_OUT = 150;
  /* The ink of the underline giving way to ceramic. See morph(). */
  var SKIN_MS = 150;
  var CONTACT_SRC = 'scripts/vendor/contact.min.js';

  var html = document.documentElement;
  var origin = document.getElementById('touch-origin');
  var rule = origin && origin.querySelector('.touch-origin__rule');
  var layer = document.getElementById('touch-layer');
  var veil = document.getElementById('touch-veil');
  var plate = document.getElementById('touch-plate');
  var sheet = document.getElementById('touch-sheet');
  var closer = document.getElementById('touch-close');
  var mount = document.getElementById('touch-mount');
  if (!origin || !rule || !layer || !veil || !plate || !sheet) return;

  var isOpen = false;
  var busy = false;
  var morphing = 0;     // 1/-1 only while a geometry animation is actually live
  var loading = null;
  var lastFocus = null;
  var player = null;      // the geometry player, the one that owns onfinish
  var players = [];       // every player on the plate, for cancelling
  var closeTimer = 0;
  var savedY = 0;         // the scroll the card was opened from
  var savedAtBottom = false;

  /* ---------------------------------------------------------------------
     THE BUNDLE

     Firestore plus the form is the single largest thing this site can be
     asked to fetch, and the morph gives it 780ms of cover at most. Anything
     that says the form is about to be wanted starts it: a pointer settling on
     the link, a focus ring landing on it, a finger touching it. By the time
     the rectangle has finished growing the schema is usually already there,
     and .touch__wait covers the case where it is not.
     --------------------------------------------------------------------- */
  function loadContact() {
    if (window.PPContactStarted) return loading || Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CONTACT_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    loading['catch'](function () {
      loading = null;
      failed();
    });
    return loading;
  }

  function waiting() {
    if (!mount || mount.firstChild) return;
    var wait = document.createElement('div');
    wait.className = 'touch__wait';
    wait.setAttribute('aria-hidden', 'true');
    wait.appendChild(document.createElement('span'));
    wait.appendChild(document.createElement('span'));
    wait.appendChild(document.createElement('span'));
    mount.appendChild(wait);
  }

  function failed() {
    if (!mount || window.PPContactStarted) return;
    mount.replaceChildren();
    var note = document.createElement('p');
    note.className = 'touch__status';
    note.textContent = 'Could not load the form. Try again.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cta';
    btn.textContent = 'Try again';
    btn.addEventListener('click', function () {
      mount.replaceChildren();
      waiting();
      loadContact();
    });
    mount.append(note, btn);
  }

  /* ---------------------------------------------------------------------
     THE MOVE
     --------------------------------------------------------------------- */
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function box(r, radius) {
    return {
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
      borderRadius: radius
    };
  }

  /* The rule paints itself in `currentColor`, which is the closing line's own
     68% ink and changes on hover. Reading it rather than restating it is what
     keeps the first frame of the plate indistinguishable from the last frame
     of the line. */
  function ruleFill() {
    return getComputedStyle(rule).backgroundColor;
  }

  function cardRadius() {
    return getComputedStyle(sheet).borderRadius || '1.25rem';
  }

  /* The card's own skin, read off the plate rather than restated here: the
     plate paints itself with --card-fill and the sheet's border, so whatever
     the tier or the tokens say, the rectangle this grows into is the one that
     lands. Read only with no animation applied, which stopPlayers() guarantees. */
  function cardSkin() {
    var cs = getComputedStyle(plate);
    return {
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      borderWidth: cs.borderTopWidth
    };
  }

  /* Border width goes to zero, not just transparent. `box-sizing: border-box`
     is on everything here, so a 1px border on a 1px-tall box is two borders in
     one pixel of room: the used height comes out at 2px and the line the plate
     is supposed to be starting from is twice the thickness of the one it
     replaced. */
  function lineSkin() {
    return {
      backgroundColor: ruleFill(),
      borderColor: 'rgba(0, 0, 0, 0)',
      borderWidth: '0px'
    };
  }

  function stopPlayers() {
    for (var i = 0; i < players.length; i++) {
      try { players[i].cancel(); } catch (e) { /* already finished */ }
    }
    players.length = 0;
  }

  /* Two players on one box, because the two halves of this move are not on the
     same clock.
     GEOMETRY runs the whole length in the house ease, which is heavily
     front-loaded: a third of the distance is covered in the first tenth of the
     time.
     THE SKIN cannot be. Left on the same curve, the ink the line is drawn in
     is still most of the fill when the rectangle is already a third grown, and
     a dark grey slab opening in the middle of the page is not a line becoming
     a card. It gets its own 190ms instead, so the ink turns to ceramic while
     the thing is still recognisably a line, and the reverse happens at the end
     of the close rather than the start. */
  /* The plate parked at a rect with no animation on it, wearing exactly what
     CSS gives it — which is the same fill, border, radius and shadow the
     landed sheet has. Used to take the card's place before the card stops
     being one. */
  function rest(r) {
    stopPlayers();
    plate.removeAttribute('hidden');
    plate.style.left = r.left + 'px';
    plate.style.top = r.top + 'px';
    plate.style.width = r.width + 'px';
    plate.style.height = r.height + 'px';
  }

  function morph(from, to, opening, done) {
    stopPlayers();
    plate.removeAttribute('hidden');
    /* rest() may have written inline geometry. An animation with fill:'both'
       out-ranks inline styles, so this is housekeeping rather than a fix — but
       it keeps the plate's resting state and its animated state from being two
       different descriptions of the same box. */
    plate.style.cssText = '';

    var line = opening ? from : to;
    var card = opening ? to : from;
    var geom = [box(line, '1px'), box(card, cardRadius())];
    var skin = [lineSkin(), cardSkin()];
    if (!opening) { geom.reverse(); skin.reverse(); }

    /* Set here rather than at the top of open/close: it means "a geometry
       animation is live", which is exactly the window the resize handler at the
       foot of this file is allowed to cut short. The keyboard wait and the
       content fade are not that window — a resize during either is expected
       (it is often the keyboard itself) and must not abort the close. */
    morphing = opening ? 1 : -1;

    var run = opening ? OPEN_MS : CLOSE_MS;
    player = plate.animate(geom, { duration: run, easing: EASE, fill: 'both' });
    players.push(player);
    players.push(plate.animate(skin, {
      duration: SKIN_MS,
      delay: opening ? 0 : run - SKIN_MS,
      easing: opening ? 'ease-out' : 'ease-in',
      fill: 'both'
    }));

    player.onfinish = function () {
      stopPlayers();
      if (done) done();
    };
  }

  /* ---------------------------------------------------------------------
     THE SCROLL, ACROSS THE LOCK

     `html.touch-open { overflow: hidden }` is how the page behind is held, and
     it is not something a phone can be trusted with. Locking the root makes a
     mobile browser bring its URL bar back, which changes innerHeight, which
     changes what the maximum scroll position IS — and the card is opened from
     the very bottom of a nineteen-thousand-pixel document, so "the maximum"
     is exactly where the visitor was. iOS is worse than that: it does not
     reliably honour the lock at all, so a drag over the card can move the
     document underneath it.

     Either way the same thing happens on close: the layer is hidden and the
     page underneath is no longer where it was left. Near the end of the reel,
     what is a few hundred pixels above the footer is the un-stuck stage with
     every chapter already faded out — which is to say, nothing. That is the
     blank space.

     So the position is not trusted, it is recorded and put back. Bottom-anchored
     when it was at the bottom, because if the URL bar did come back then the
     old pixel offset is no longer the bottom and the footer would sit low with
     a strip of empty stage above it.

     `behavior: 'instant'` is not optional: styles/site.css sets
     `scroll-behavior: smooth` on html, and without it this restore would
     animate — the page sliding on its own, which is the other half of what was
     reported. */
  function maxY() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function rememberScroll() {
    savedY = window.scrollY;
    savedAtBottom = savedY >= maxY() - 2;
  }

  function restoreScroll() {
    var y = savedAtBottom ? maxY() : savedY;
    if (Math.abs(window.scrollY - y) < 1) return;
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }

  /* ---------------------------------------------------------------------
     THE KEYBOARD

     Opening the card focuses the first question, which on a phone raises the
     keyboard. That is wanted. Dismissing it is where this used to break.

     A keyboard is a viewport change. Android shrinks innerHeight by its
     height and fires resize; iOS moves the visual viewport. So the moment the
     card closes, TWO viewport transitions are in flight at once — the keyboard
     sliding away and the URL bar coming back as the scroll unlocks — and
     restoreScroll() below was reading maxY() in the middle of both. It
     restored against a viewport height that was about to change, landed short
     of the footer, and left the page on the un-stuck stage with every chapter
     faded out. Background, and nothing on it.

     So the keyboard goes away FIRST, on its own, and the card does not begin
     to collapse until the viewport has stopped moving. blur() is what dismisses
     it on both platforms. Then this waits for visualViewport to go quiet rather
     than guessing at an animation length, with a hard cap so a browser that
     never fires the event cannot hang the close.

     Nothing focused, or no keyboard on screen, and this costs one function
     call and no delay at all — which is every desktop close, and every close
     from a question whose answer is a set of options rather than typing. */
  var KEY_QUIET_MS = 120;   /* no viewport change for this long = settled */
  var KEY_CAP_MS = 520;     /* never wait longer than this, whatever happens */
  var KEY_BLIND_MS = 260;   /* used only where visualViewport does not exist */

  function typing(el) {
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
                     el.isContentEditable));
  }

  function afterKeyboard(done) {
    var el = document.activeElement;
    if (!typing(el)) { done(); return; }
    el.blur();

    var vv = window.visualViewport;
    if (!vv) { window.setTimeout(done, KEY_BLIND_MS); return; }

    var quiet = 0, cap = 0, spent = false;

    function finish() {
      if (spent) return;
      spent = true;
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      vv.removeEventListener('resize', bump);
      done();
    }

    function bump() {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(finish, KEY_QUIET_MS);
    }

    vv.addEventListener('resize', bump);
    bump();   /* start the clock, so a browser that fires nothing still resolves */
    cap = window.setTimeout(finish, KEY_CAP_MS);
  }

  /* ---------------------------------------------------------------------
     FOCUS
     --------------------------------------------------------------------- */
  /* A radio group is one tab stop, and which member of it that stop lands on
     is the checked one — or the first, when none is checked yet. Collecting
     every radio instead would put four tab stops in a group the arrow keys
     already own, and the trap below would then refuse to leave it. */
  function tabbable() {
    var list = [];
    var seen = Object.create(null);
    var all = sheet.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.type === 'radio') {
        var name = el.name;
        if (seen[name]) continue;
        var group = sheet.querySelectorAll('input[type="radio"][name="' + name + '"]');
        var pick = null;
        for (var j = 0; j < group.length; j++) if (group[j].checked) { pick = group[j]; break; }
        seen[name] = true;
        list.push(pick || group[0]);
        continue;
      }
      list.push(el);
    }
    return list;
  }

  /* The question, not the close mark. The form is the reason the card is
     open, and on a phone this is also what raises the keyboard — which is why
     it waits for the landing rather than happening as the rectangle grows. */
  function focusFirst() {
    var list = tabbable();
    for (var i = 0; i < list.length; i++) {
      var tag = list[i].tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        list[i].focus({ preventScroll: true });
        return;
      }
    }
    if (list.length) list[0].focus({ preventScroll: true });
    else sheet.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------------
     OPEN AND CLOSE
     --------------------------------------------------------------------- */
  function land() {
    morphing = 0;
    sheet.classList.add('is-landed');
    plate.setAttribute('hidden', '');
    plate.style.cssText = '';
    isOpen = true;
    busy = false;
    focusFirst();
  }

  function finishClose() {
    morphing = 0;
    plate.setAttribute('hidden', '');
    plate.style.cssText = '';
    layer.setAttribute('hidden', '');
    origin.setAttribute('aria-expanded', 'false');
    busy = false;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function openSheet(e) {
    if (e) e.preventDefault();
    if (isOpen || busy) return;
    busy = true;
    lastFocus = document.activeElement;
    loadContact();

    rememberScroll();
    layer.removeAttribute('hidden');
    sheet.classList.remove('is-landed');

    /* The lock goes on BEFORE either rect is read. Applying it is what may move
       the page under a phone's returning URL bar, and a line measured on the
       near side of that would have the rectangle growing out of somewhere the
       underline no longer is. Nothing in .touch-open changes layout otherwise:
       the origin and the mark only lose opacity, and `scrollbar-gutter: stable`
       (section 3) covers the desktop scrollbar. */
    html.classList.add('touch-open');
    layer.classList.add('is-open');
    origin.setAttribute('aria-expanded', 'true');

    /* One forced layout, deliberately: `hidden` was on the layer a statement
       ago and the card has to be measured in its resting place. */
    var line = rectOf(rule);
    var card = rectOf(sheet);

    waiting();
    morph(line, card, true, land);
  }

  /* THE CLOSE, IN THE ONLY ORDER THAT WORKS.
     What used to happen: `.is-landed` came off, which took the card's border,
     fill and shadow away on that frame — and the plate that is supposed to
     inherit them was still `hidden`, because morph() does not run until
     CONTENT_OUT later. So the card did not shrink, it BLINKED: 150ms of empty
     page, then a full-size rectangle appearing from nowhere to collapse. That
     was the glitch.

     The rectangle now exists before the card stops being one. The plate is
     placed over the sheet's exact rect and shown while the sheet is still
     wearing its chrome, so the frame where `.is-landed` comes off is a frame
     where two identical rectangles are stacked and one of them is removed.
     Nothing changes on screen. Only then does the content fade, and only then
     does the geometry start moving. */
  function closeSheet() {
    if (!isOpen || busy) return;
    busy = true;
    isOpen = false;
    origin.setAttribute('aria-expanded', 'false');

    /* The keyboard goes down before anything else happens, and the card stays
       fully drawn while it does. Collapsing underneath a keyboard that is still
       sliding away means measuring rects against a viewport that is still
       moving, which is the whole of the bug this fixes. See afterKeyboard(). */
    afterKeyboard(function () {
      /* Measured now, against the settled viewport, and before a single class
         changes so nothing that reflows can move the rect out from under the
         plate. */
      var card = rectOf(sheet);
      rest(card);
      sheet.classList.remove('is-landed');

      closeTimer = window.setTimeout(function () {
        closeTimer = 0;
        /* Late, not early. Taking .touch-open off starts the footer coming back
           (delayed in section 10 to land with the plate) and unlocks the scroll;
           doing it at the top of the close would have both happening under a
           card that is still fully drawn. `scrollbar-gutter: stable` on html is
           what stops the unlock shifting the page sideways. */
        html.classList.remove('touch-open');
        /* Before the rule is measured, not after: the plate has to land on the
           underline where it will actually be, not where it was while the page
           was locked. */
        restoreScroll();
        layer.classList.remove('is-open');
        /* Re-read rather than reusing `card`: the unlock above can move the
           sheet if the URL bar came back with it, and the plate must start from
           where the card actually is on this frame. */
        morph(rectOf(sheet), rectOf(rule), false, finishClose);
      }, CONTENT_OUT);
    });
  }

  /* contact.min.js closes the card from its own Sent state, and has no other
     way to reach this file. */
  window.PPTouch = { close: closeSheet, isDialog: true };

  origin.addEventListener('click', openSheet);
  veil.addEventListener('click', closeSheet);
  if (closer) closer.addEventListener('click', closeSheet);

  ['pointerenter', 'focus', 'touchstart'].forEach(function (type) {
    origin.addEventListener(type, function () { loadContact(); }, { passive: true });
  });

  layer.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== 'Tab' || !isOpen) return;
    var list = tabbable();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  /* Once the card has landed there is nothing here to keep in sync: the plate
     is gone and the sheet is laid out by the same CSS as the rest of the page,
     so it follows a rotation or a resize on its own. The one case that needs
     catching is a resize DURING the morph, where both rects were read before
     the viewport changed and the plate would now be playing to a rectangle
     that has moved. Cut it short and let whichever end it was heading for
     arrive immediately.

     `morphing` is deliberately only set while a player is live, so this does
     NOT fire during the keyboard wait or the content fade. A resize in those
     two windows is expected — on a phone it is usually the keyboard itself —
     and aborting the close there is exactly what must not happen. */
  window.addEventListener('resize', function () {
    if (!morphing) return;
    var opening = morphing > 0;
    if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = 0; }
    stopPlayers();
    if (opening) land(); else finishClose();
  });
})();
