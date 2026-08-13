// PowerPod Platform — the Firebase project, in one place.
//
// Imported by BOTH bundle sources (scripts/firebase.js and scripts/contact.js)
// and inlined into each by esbuild. It is a source module, never served.
//
// It exists because the two bundles genuinely do each need their own Firebase
// app — see the note at the top of scripts/contact.js — and the one thing they
// must agree on is which project they are talking to.
//
// This object is meant to be public. `apiKey` identifies the project to
// Google's servers, it does not authorize anything. Submissions are protected
// by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCmAYl2aRzsAakeIvTw7Sc00MJcQiAlo_M',
  authDomain: 'powerpod-platform.firebaseapp.com',
  projectId: 'powerpod-platform',
  storageBucket: 'powerpod-platform.firebasestorage.app',
  messagingSenderId: '304505564073',
  appId: '1:304505564073:web:faec52bc763b84dee532b8',
  measurementId: 'G-XPWQLQM6GX',
};
