// PowerPod Platform — Firebase initialization.
//
// Source module for the vendored bundle at scripts/vendor/firebase.min.js.
// This file is never served directly; `npm run build:firebase` bundles it
// with esbuild into an IIFE that assigns `window.PPFirebase`, matching how
// every other script on this page (guard.js, perf.js, cinema.js, …) attaches
// itself to the global scope rather than using ES modules.
//
// Only `app` (Firebase core) and Analytics are initialized here. Firestore
// lives in scripts/contact.js, injected on first Get in touch tap, and reads
// the app from window.PPFirebase.app. A visitor who never opens the form
// never pays to parse Firestore.
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyCmAYl2aRzsAakeIvTw7Sc00MJcQiAlo_M',
  authDomain: 'powerpod-platform.firebaseapp.com',
  projectId: 'powerpod-platform',
  storageBucket: 'powerpod-platform.firebasestorage.app',
  messagingSenderId: '304505564073',
  appId: '1:304505564073:web:faec52bc763b84dee532b8',
  measurementId: 'G-XPWQLQM6GX',
};

const app = initializeApp(firebaseConfig);

// isSupported() resolves false (rather than throwing) under tracking
// blockers, in unsupported browsers, and when the page is opened via
// file:// — all real cases for a static site with no server to fall back on.
const analyticsReady = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export { app, analyticsReady };
