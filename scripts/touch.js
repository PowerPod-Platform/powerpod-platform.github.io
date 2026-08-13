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
 * Behind it, the film is held on one frame (see PPFilm in scripts/scroll.js):
 * by the closing footer the drawing has fully dissolved, and bare ceramic is
 * not what should be behind this.
 *
 * href="contact.html" on the origin is the real destination. This file only
 * intercepts when it can. JavaScript off still navigates.
 */
(function () {
  'use strict';

  /* NOT the house curve. cubic-bezier(0.2, 0.7, 0.2, 1) is what the index
     ticks, the veil and the bloom all use, and it is heavily front-loaded: a
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

  /* The frame the film is held on. ANCHORS in scripts/scroll.js puts t 0.952
     at the pod, the dashboard and the phone at 1:1 and t 0.972 at all three
     receding; 0.968 is late in that recession, and it is the only place in the
     film where the three subjects are both small enough to fit around a card
     and far enough apart to frame it. Chosen with the card in front of it, not
     off the anchor table: at 0.952 the trio is too large and the pod is
     entirely behind the sheet, and by 0.98 cinema.js has started the final
     dissolve.

     The css transform in .film-hold does the rest — a 1.2 push-in that puts
     the pod's handle just above the card's top edge and the two devices in the
     bottom corners.

     dim well under 1: this is what is behind the form, not what is being read.
     lift 0: the subject belongs in the middle of the frame here, as it does
     under the hero and the roster, not lifted clear of a band of copy that is
     not there. */
  var FILM_T = 0.968;
  var FILM_DIM = 0.85;
  var FILM_OUT_MS = 1400;   /* covers the longest transition in film-hold */

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
  var morphing = 0;     // 1 while growing, -1 while collapsing, 0 at rest
  var loading = null;
  var lastFocus = null;
  var player = null;      // the geometry player, the one that owns onfinish
  var players = [];       // every player on the plate, for cancelling
  var filmTimer = 0;
  var closeTimer = 0;

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
  function morph(from, to, opening, done) {
    stopPlayers();
    plate.removeAttribute('hidden');

    var line = opening ? from : to;
    var card = opening ? to : from;
    var geom = [box(line, '1px'), box(card, cardRadius())];
    var skin = [lineSkin(), cardSkin()];
    if (!opening) { geom.reverse(); skin.reverse(); }

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
     THE FILM

     One held frame, not a loop: scripts/scroll.js keeps the only rAF in the
     page and re-renders this frame by itself on a resize. The opacity written
     inline by cinema.js is what the .film-hold transition in styles/site.css
     picks up, which is why the class goes on first and comes off last.
     --------------------------------------------------------------------- */
  function filmHold() {
    if (!window.PPFilm) return;
    window.clearTimeout(filmTimer);
    html.classList.add('film-hold');
    window.PPFilm.hold(FILM_T, FILM_DIM, 0);
  }

  function filmRelease() {
    if (!window.PPFilm) return;
    window.PPFilm.release();
    filmTimer = window.setTimeout(function () {
      html.classList.remove('film-hold');
    }, FILM_OUT_MS);
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
    isOpen = true;
    busy = false;
    focusFirst();
  }

  function finishClose() {
    morphing = 0;
    plate.setAttribute('hidden', '');
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
    morphing = 1;
    lastFocus = document.activeElement;
    loadContact();

    /* The bloom is thrown from the line, so its origin is measured before the
       origin is faded and while the rule is still where it was pressed. */
    var line = rectOf(rule);
    layer.style.setProperty('--bloom-x', (line.left + line.width / 2) + 'px');
    layer.style.setProperty('--bloom-y', (line.top + line.height / 2) + 'px');

    layer.removeAttribute('hidden');
    sheet.classList.remove('is-landed');
    /* One forced layout, deliberately: the card has to be measured in its
       resting place before .touch-open can move anything, and `hidden` was
       still on it a statement ago. */
    var card = rectOf(sheet);

    html.classList.add('touch-open');
    layer.classList.add('is-open');
    origin.setAttribute('aria-expanded', 'true');
    filmHold();
    waiting();

    morph(line, card, true, land);
  }

  function closeSheet() {
    if (!isOpen || busy) return;
    busy = true;
    morphing = -1;
    isOpen = false;
    /* .touch-open comes off at the top of the close, not the bottom: the
       underline fades back in over 0.45s while the plate spends 0.52s
       collapsing onto it, so the line the visitor gets back is the one the
       rectangle just turned into. `scrollbar-gutter: stable` on html (section
       3) is what stops that same statement shifting the page sideways. */
    sheet.classList.remove('is-landed');
    html.classList.remove('touch-open');
    layer.classList.remove('is-open');
    filmRelease();

    var card = rectOf(sheet);
    closeTimer = window.setTimeout(function () {
      closeTimer = 0;
      morph(card, rectOf(rule), false, finishClose);
    }, CONTENT_OUT);
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
     arrive immediately. */
  window.addEventListener('resize', function () {
    if (!morphing) return;
    var opening = morphing > 0;
    if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = 0; }
    stopPlayers();
    if (opening) land(); else finishClose();
  });
})();
