// Ignis Snaps service worker: PWA installability only. Plain JS, served from
// the site root as a static asset (not bundled), so its scope is "/". Authored
// by hand — kept minimal and exempt from the app lint.
/* global self */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A pass-through fetch handler is part of the Android install criteria.
self.addEventListener("fetch", () => {});
