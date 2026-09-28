// Kill switch — this landing has no service worker.
//
// On 2026-09-28 this domain briefly served the marketplace SPA (the Vercel
// project had been linked to the frontend repo with no root directory), and
// the SPA registers /sw.js. A browser that caught it keeps showing the cached
// marketplace until that worker goes away. Browsers re-fetch /sw.js on the
// next visit; this version wipes the caches, unregisters itself and reloads
// the open tabs onto the real page. Safe to delete once nobody can still hold
// the old worker (a few weeks).
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach(function (c) { c.navigate(c.url); });
  })());
});
