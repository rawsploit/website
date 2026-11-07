/* Service worker: makes the site installable, keeps the app shell
   available offline, and shows a "No signal" page when offline.
   Bump VERSION whenever the shell files change. */
const VERSION = "suite-v1";
const SHELL = [
  "./", "index.html", "login.html", "portal.html", "catalog.html", "setup.html", "offline.html",
  "assets/site.css", "assets/site.js", "assets/config.js", "assets/people.js", "assets/install.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-64.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // backends and modules always go to the network

  if (req.mode === "navigate") {                          // pages: fresh when online, cached or "No signal" when not
    e.respondWith(fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("offline.html"); });
    }));
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {   // files: cached first, refreshed in the background
    const net = fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
