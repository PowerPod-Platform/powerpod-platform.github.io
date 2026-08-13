// PowerPod Platform — Get in touch.
//
// Source for scripts/vendor/contact.min.js (`npm run build:contact`). Never
// served as a module. Firestore + App Check + the form, and nothing else.
//
// THIS BUNDLE INITIALISES ITS OWN FIREBASE APP, and must. It carries its own
// copy of the SDK, and a second copy cannot borrow the first one's app object:
// `_registerComponent` writes the Firestore component into the registry of the
// copy that runs it, and the app scripts/firebase.js created carries
// scripts/firebase.js's own container. Handing that app to this copy's
// getFirestore() throws `Service firestore is not available` — which is
// exactly what shipped, on both the film page and contact.html, for as long as
// the two bundles tried to share one app.
//
// So: two SDK copies, two app objects, one project id (scripts/firebase-config.js).
// They share nothing. Analytics lives over there, Firestore lives here, and
// neither needs to know about the other. The split is still worth it — it is
// what keeps ~350kb of Firestore off a visit that never opens the form.
//
// Injected by scripts/touch.js on the first hint that the form is wanted.
// contact.html loads it directly.
//
// ONE QUESTION AT A TIME. The card this renders into is a fixed size and never
// changes shape (styles/site.css section 15), which is what lets the underline
// morph know its target rect before this bundle has even downloaded. So the
// form cannot be a column of nine fields: it is one question, centred, in the
// reel's own typography, arriving from below and departing upward, with the
// station index's own ticks underneath for how far along it is.
//
// The consequence for this file is that the DOM holds one field at a time and
// therefore cannot be the source of truth. `values` is. Everything reads from
// it — validation, the showIf skips, the ticks and the submitted answers — and
// the only writes are `readStep()` on the way out of a question.
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { firebaseConfig } from './firebase-config.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

// Public reCAPTCHA v3 site key for Firebase App Check. Empty until the key
// is registered in Firebase Console → App Check; initializeAppCheck is then
// skipped and submits still work until enforcement is turned on.
const APP_CHECK_SITE_KEY = '';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const ALLOWED_TYPES = { text: true, email: true, tel: true, select: true };

// Visitor-facing copy. No em dashes here or in config/form: the commas are
// deliberate and they are the house style for the whole site.
const COPY = {
  loadFail: 'Could not load the form. Try again.',
  retry: 'Try again',
  next: 'Next',
  back: 'Back',
  send: 'Send',
  close: 'Close',
  sending: 'Sending',
  sentTitle: 'Sent.',
  sentLine: "We'll come back to you.",
  sendFail: 'Could not send. Try again.',
  required: 'Please fill this in.',
  email: 'Enter a valid email.',
  phone: 'Enter a phone number.',
  option: 'Choose one.',
  progress: (n, of) => `Question ${n} of ${of}`,
};

// How long a pointer-chosen option stays lit before the card moves on. Long
// enough to see the mark land, short enough that nobody waits for it.
const ADVANCE_MS = 300;

function isLocalHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

// Idempotent within this copy of the SDK: getApps() reads this copy's registry,
// which is empty until the line below runs and never sees the app that
// scripts/firebase.js made.
function getApp() {
  const [existing] = getApps();
  return existing || initializeApp(firebaseConfig);
}

function initAppCheck(app) {
  if (!APP_CHECK_SITE_KEY) return;
  if (isLocalHost()) {
    // Firebase prints a UUID in the console on first run. Register it under
    // App Check → Apps → Manage debug tokens so local preview can write.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* Private mode, or App Check already initialised. Submits still run. */
  }
}

function getDb(app) {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}

function parseSchema(raw) {
  if (!raw || !Array.isArray(raw.fields)) return null;
  const version = raw.version;
  if (!Number.isInteger(version) || version < 1) return null;

  const fields = [];
  const seen = Object.create(null);
  for (const item of raw.fields) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!KEY_RE.test(id) || seen[id]) continue;
    const type = ALLOWED_TYPES[item.type] ? item.type : 'text';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) continue;

    const field = {
      id,
      type,
      label,
      required: item.required === true,
      maxLength: Number.isInteger(item.maxLength) && item.maxLength > 0
        ? Math.min(item.maxLength, 2000)
        : type === 'email' ? 254 : type === 'tel' ? 32 : 200,
    };

    if (type === 'select') {
      const options = [];
      const optionIds = Object.create(null);
      if (Array.isArray(item.options)) {
        for (const opt of item.options) {
          if (!opt || typeof opt !== 'object') continue;
          const oid = typeof opt.id === 'string' ? opt.id : '';
          const olabel = typeof opt.label === 'string' ? opt.label.trim() : '';
          if (!oid || !olabel || optionIds[oid]) continue;
          optionIds[oid] = true;
          options.push({ id: oid, label: olabel });
        }
      }
      if (!options.length) continue;
      field.options = options;
    }

    if (item.showIf && typeof item.showIf === 'object') {
      const dep = typeof item.showIf.field === 'string' ? item.showIf.field : '';
      const equals = typeof item.showIf.equals === 'string' ? item.showIf.equals : '';
      if (KEY_RE.test(dep) && equals) field.showIf = { field: dep, equals };
    }

    seen[id] = true;
    fields.push(field);
  }

  return fields.length ? { version, fields } : null;
}

function visible(field, values) {
  if (!field.showIf) return true;
  return values[field.showIf.field] === field.showIf.equals;
}

function collapseText(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function validateField(field, values) {
  if (!visible(field, values)) return '';
  const raw = typeof values[field.id] === 'string' ? values[field.id] : '';
  const trimmed = raw.trim();
  if (field.required && !trimmed) {
    return field.type === 'select' ? COPY.option : COPY.required;
  }
  if (!trimmed) return '';
  if (field.type === 'email' && !EMAIL_RE.test(trimmed.toLowerCase())) return COPY.email;
  if (field.type === 'tel' && trimmed.replace(/\D/g, '').length < 7) return COPY.phone;
  if (field.type === 'select') {
    const ok = field.options.some((o) => o.id === trimmed);
    if (!ok) return COPY.option;
  }
  if (trimmed.length > field.maxLength) return COPY.required;
  return '';
}

function buildAnswers(schema, values) {
  const answers = Object.create(null);
  for (const field of schema.fields) {
    // A question that was skipped, or that was answered and then skipped by a
    // later change of mind further up, is not an answer.
    if (!visible(field, values)) continue;
    let value = typeof values[field.id] === 'string' ? values[field.id] : '';
    if (field.type === 'email') value = value.trim().toLowerCase();
    else if (field.type === 'tel') value = collapseText(value);
    else if (field.type === 'text') value = collapseText(value);
    else value = value.trim();
    if (!value) continue;
    answers[field.id] = value;
  }
  return answers;
}

function el(tag, attrs) {
  const node = document.createElement(tag);
  if (!attrs) return node;
  for (const key in attrs) {
    if (attrs[key] == null || attrs[key] === false) continue;
    if (key === 'text') node.textContent = attrs[key];
    else if (key === 'className') node.className = attrs[key];
    else if (attrs[key] === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(attrs[key]));
  }
  return node;
}

function autocompleteFor(field) {
  if (field.id === 'name') return 'name';
  if (field.id === 'companyName') return 'organization';
  if (field.id === 'designation') return 'organization-title';
  if (field.type === 'email') return 'email';
  if (field.type === 'tel') return 'tel';
  return 'off';
}

function paintRetry(mount, onRetry) {
  mount.replaceChildren();
  const note = el('p', { className: 'touch__status', text: COPY.loadFail });
  const btn = el('button', { type: 'button', className: 'cta', text: COPY.retry });
  btn.addEventListener('click', onRetry);
  mount.append(note, btn);
}

/* =========================================================================
   THE STEPPER
   ========================================================================= */
function renderForm(mount, schema, db) {
  const values = Object.create(null);
  const first = schema.fields.findIndex((f) => visible(f, values));
  // Every question hidden behind an answer nobody can give yet. Not reachable
  // from a seeded schema, and not something to render an empty card for.
  if (first < 0) return null;

  const form = el('form', { className: 'touch__form', novalidate: true, autocomplete: 'on' });
  const step = el('div', { className: 'touch__step' });
  const actions = el('div', { className: 'touch__actions' });
  const back = el('button', { type: 'button', className: 'touch__back', text: COPY.back });
  const submit = el('button', { type: 'submit', className: 'cta touch__submit', text: COPY.next });
  const formError = el('p', { className: 'touch__form-error', role: 'status', 'aria-live': 'polite' });
  const ticks = el('div', { className: 'touch__ticks', 'aria-hidden': 'true' });
  const live = el('p', { className: 'touch__live', role: 'status', 'aria-live': 'polite' });

  actions.append(back, submit, formError);
  /* Ticks first: they are the head of the card, above the question, not a
     footnote under the buttons. .touch__form's rows are in this order too. */
  form.append(ticks, step, actions, live);

  let current = -1;
  let sending = false;
  let sent = false;
  let swapTimer = 0;
  let advanceTimer = 0;

  /* ---- where the questions are ------------------------------------------
     Never a fixed list. A showIf field appears and disappears as the answer it
     depends on changes, and the ticks are supposed to show that happening. */
  function shown() {
    return schema.fields.filter((f) => visible(f, values));
  }

  function seek(from, dir) {
    for (let i = from; i >= 0 && i < schema.fields.length; i += dir) {
      if (visible(schema.fields[i], values)) return i;
    }
    return -1;
  }

  /* ---- the current question, read out of the DOM -------------------------
     The one place `values` is written from the page. */
  function readStep() {
    const field = schema.fields[current];
    if (!field) return;
    if (field.type === 'select') {
      const picked = step.querySelector('.touch__radio:checked');
      values[field.id] = picked ? picked.value : '';
      return;
    }
    const control = step.querySelector('.touch__control');
    values[field.id] = control ? control.value : '';
  }

  function showError(message) {
    const err = step.querySelector('.touch__error');
    if (err) err.textContent = message;
    const control = step.querySelector('.touch__control');
    if (control) control.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  /* ---- ticks ------------------------------------------------------------- */
  function paintTicks() {
    const list = shown();
    const at = list.findIndex((f) => f.id === (schema.fields[current] || {}).id);
    while (ticks.children.length > list.length) ticks.lastChild.remove();
    while (ticks.children.length < list.length) {
      ticks.append(el('span', { className: 'touch__tick' }));
    }
    for (let i = 0; i < list.length; i++) {
      const tick = ticks.children[i];
      tick.className = 'touch__tick'
        + (sent || (at >= 0 && i < at) ? ' is-done' : '')
        + (!sent && i === at ? ' is-current' : '');
    }
    if (at >= 0) live.textContent = COPY.progress(at + 1, list.length);
  }

  /* ---- painting a question ----------------------------------------------- */
  function askOf(field) {
    return el('h3', { className: 'touch__ask', id: 'ask-' + field.id, text: field.label });
  }

  function buildChoices(field) {
    const wrap = el('div', {
      className: 'touch__choices',
      role: 'radiogroup',
      'aria-labelledby': 'ask-' + field.id,
    });
    field.options.forEach((opt, i) => {
      const choice = el('label', { className: 'touch__choice' });
      choice.style.setProperty('--i', String(i));
      const radio = el('input', {
        className: 'touch__radio',
        type: 'radio',
        name: field.id,
        value: opt.id,
      });
      radio.checked = values[field.id] === opt.id;
      choice.append(
        radio,
        el('span', { className: 'touch__choice-mark', 'aria-hidden': 'true' }),
        el('span', { className: 'touch__choice-label', text: opt.label })
      );
      wrap.append(choice);
    });
    return wrap;
  }

  function buildControl(field) {
    const control = el('input', {
      className: 'touch__control',
      id: 'f-' + field.id,
      name: field.id,
      type: field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text',
      maxlength: field.maxLength,
      autocomplete: autocompleteFor(field),
      spellcheck: field.type === 'text' ? 'true' : 'false',
      inputmode: field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : null,
      'aria-labelledby': 'ask-' + field.id,
      'aria-describedby': 'e-' + field.id,
    });
    control.value = typeof values[field.id] === 'string' ? values[field.id] : '';
    return control;
  }

  function fill(index, focus) {
    const field = schema.fields[index];
    current = index;
    step.replaceChildren();
    step.append(askOf(field));
    step.append(field.type === 'select' ? buildChoices(field) : buildControl(field));
    step.append(el('p', { className: 'touch__error', id: 'e-' + field.id, role: 'status' }));

    back.hidden = seek(index - 1, -1) < 0;
    submit.textContent = seek(index + 1, 1) < 0 ? COPY.send : COPY.next;
    formError.textContent = '';
    paintTicks();

    // Restart the arrival: same class, so it has to leave the element first.
    step.classList.remove('is-in');
    void step.offsetWidth;
    step.classList.add('is-in');

    if (!focus) return;
    const first = step.querySelector('.touch__control, .touch__radio');
    if (first) first.focus({ preventScroll: true });
  }

  /* Out, swap, in. One element rather than two crossfading: the outgoing
     question is at opacity 0 by the time its replacement is measured, so the
     card never shows a question mid-relayout. The animations are gated on the
     card having landed (see styles/site.css), so on the very first question —
     where the schema often beats the morph — there is nothing to wait for and
     the timer is the one that resolves it. */
  function go(index, dir, focus) {
    window.clearTimeout(swapTimer);
    window.clearTimeout(advanceTimer);
    if (current < 0) {
      step.dataset.dir = dir;
      fill(index, focus);
      return;
    }
    step.dataset.dir = dir;
    step.classList.remove('is-in');
    step.classList.add('is-out');

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(swapTimer);
      step.removeEventListener('animationend', onEnd);
      step.classList.remove('is-out');
      fill(index, focus);
    };
    const onEnd = (e) => { if (e.target === step) finish(); };
    step.addEventListener('animationend', onEnd);
    swapTimer = window.setTimeout(finish, 320);
  }

  function advance() {
    if (sending || sent) return;
    readStep();
    const field = schema.fields[current];
    const message = validateField(field, values);
    if (message) {
      showError(message);
      const first = step.querySelector('.touch__control, .touch__radio');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    const next = seek(current + 1, 1);
    if (next < 0) { send(); return; }
    go(next, 'next', true);
  }

  function retreat() {
    if (sending || sent) return;
    readStep();
    const prev = seek(current - 1, -1);
    if (prev < 0) return;
    go(prev, 'back', true);
  }

  /* ---- send -------------------------------------------------------------- */
  function paintSent() {
    sent = true;
    step.classList.remove('is-in');
    void step.offsetWidth;
    step.replaceChildren(
      el('p', { className: 'touch__sent', text: COPY.sentTitle }),
      el('p', { className: 'touch__sent-line', text: COPY.sentLine })
    );
    step.dataset.dir = 'next';
    step.classList.add('is-in');

    back.hidden = true;
    if (window.PPTouch && typeof window.PPTouch.close === 'function') {
      submit.type = 'button';
      submit.disabled = false;
      submit.textContent = COPY.close;
      submit.addEventListener('click', () => window.PPTouch.close(), { once: true });
    } else {
      actions.hidden = true;
    }
    paintTicks();
    live.textContent = COPY.sentTitle + ' ' + COPY.sentLine;
  }

  async function send() {
    sending = true;
    submit.disabled = true;
    submit.textContent = COPY.sending;
    formError.textContent = '';
    try {
      await addDoc(collection(db, 'submissions'), {
        answers: buildAnswers(schema, values),
        formVersion: schema.version,
        createdAt: serverTimestamp(),
        source: 'website',
      });
      sending = false;
      paintSent();
    } catch {
      sending = false;
      submit.disabled = false;
      submit.textContent = COPY.send;
      formError.textContent = COPY.sendFail;
    }
  }

  /* ---- input ------------------------------------------------------------- */
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    advance();
  });

  back.addEventListener('click', retreat);

  form.addEventListener('input', (event) => {
    if (sending || sent) return;
    if (event.target.matches('.touch__control')) showError('');
  });

  /* Choosing an option with a pointer moves the card on by itself: there is
     one answer per screen and asking for a second press to confirm the first
     is a press too many.
     `detail > 0` is what separates a real click from the one the browser
     synthesises for Space, and arrow keys inside a radio group fire `change`
     with no click at all — so a keyboard visitor can walk the options without
     the card sliding out from under them, and confirms with Enter like every
     other question. */
  form.addEventListener('click', (event) => {
    if (sending || sent || !event.detail) return;
    const choice = event.target.closest('.touch__choice');
    if (!choice || !step.contains(choice)) return;
    window.clearTimeout(advanceTimer);
    advanceTimer = window.setTimeout(advance, ADVANCE_MS);
  });

  /* A changed answer can strip a question further down the form (or add one),
     and the ticks are supposed to say so while the answer is being given. */
  form.addEventListener('change', (event) => {
    if (sending || sent) return;
    if (event.target.matches('.touch__radio')) {
      readStep();
      showError('');
      paintTicks();
    }
  });

  mount.replaceChildren(form);
  /* No focus on the first question. In the card it would raise a phone's
     keyboard over a rectangle that is still growing, and scripts/touch.js
     takes the focus itself the moment it has landed; on contact.html there is
     nothing to trap focus for. Every question after this one is the direct
     result of a press and takes the focus with it. */
  go(first, 'next', false);
  return form;
}

function start() {
  if (window.PPContactStarted) return;
  const mount = document.getElementById('touch-mount');
  if (!mount) return;

  window.PPContactStarted = true;
  const app = getApp();
  initAppCheck(app);
  const db = getDb(app);
  const formRef = doc(db, 'config', 'form');

  let boundForm = null;
  let unsub = null;

  function fail() {
    boundForm = null;
    paintRetry(mount, attach);
  }

  function attach() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    unsub = onSnapshot(
      formRef,
      (snap) => {
        if (!snap.exists()) {
          fail();
          return;
        }
        // The listener stays live so a schema that lands late still arrives,
        // but the first one to render wins for the rest of the visit. The DOM
        // holds one question at a time now: re-rendering under an answer part
        // way through would throw away every value already given, and after
        // Send it would throw away the confirmation. An edit in the console
        // reaches the next visitor, not this one.
        if (boundForm) return;
        const schema = parseSchema(snap.data());
        if (!schema) {
          fail();
          return;
        }
        boundForm = renderForm(mount, schema, db);
        if (!boundForm) fail();
      },
      fail
    );
  }

  attach();
}

start();
