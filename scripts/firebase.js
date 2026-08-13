// PowerPod Platform — Firebase initialization.
//
// Source module for the vendored bundle at scripts/vendor/firebase.min.js.
// This file is never served directly; `npm run build:firebase` bundles it
// with esbuild into an IIFE that assigns `window.PPFirebase`, matching how
// every other script on this page (guard.js, perf.js, cinema.js, …) attaches
// itself to the global scope rather than using ES modules.
//
// Only `app` (Firebase core) and Analytics are initialized here. Firestore
// lives in scripts/contact.js, injected on the first hint that Get in touch is
// wanted, so a visitor who never opens the form never pays to parse it.
//
// That bundle does NOT read the app from here. It carries its own copy of the
// SDK and initialises its own app from the same config; the note at the top of
// scripts/contact.js says why it has to. `window.PPFirebase.app` is exported
// anyway because it costs nothing and the film page's Analytics is here.
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);

// isSupported() resolves false (rather than throwing) under tracking
// blockers, in unsupported browsers, and when the page is opened via
// file:// — all real cases for a static site with no server to fall back on.
const analyticsReady = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export { app, analyticsReady };
