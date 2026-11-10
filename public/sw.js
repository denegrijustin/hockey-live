// Iceboard service worker: lets the app open with no signal. It never touches /api (live scores always come from the
// network; the app falls back to its saved /data copy by itself) and never serves a stale page when the network is up,
// so a new deploy shows at once. Routing lives in sw-routes.js (testable); this file is the only worker.
importScripts("/sw-routes.js");
// Replaced at build time by the vite "sw-version" plugin with a hash of the build, so each deploy gets its own cache and
// the activate step deletes the old ones. The literal placeholder only appears when the file is served unbuilt.
const BUILD = "__BUILD_ID__";
const CACHE = `iceboard-${BUILD}`;
const SHELL_WAIT_MS = 4000;
const MAX_ENTRIES = 150; // runtime cache cap: the oldest entries go first

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("message", (event) => { if (event.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("iceboard-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}
async function put(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}
// Network first; the saved copy answers only when the network fails or is slow to reply.
async function networkFirst(request, key = request, waitMs = SHELL_WAIT_MS) {
  const saved = caches.match(key);
  try {
    const fresh = fetch(request).then((r) => put(key, r));
    const timeout = new Promise((_, reject) => setTimeout(reject, waitMs));
    return await Promise.race([fresh, timeout]);
  } catch {
    return (await saved) ?? fetch(request);
  }
}
// Cached copy first (hashed assets and logos never change under one URL), refreshed on a miss.
async function cacheFirst(request) {
  return (await caches.match(request)) ?? put(request, await fetch(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const route = self.iceboardRoutes.routeFor(request.method, request.url, request.mode, location.origin);
  if (route === "navigate") event.respondWith(networkFirst(request, "/"));
  else if (route === "static") event.respondWith(cacheFirst(request));
  else if (route === "data") event.respondWith(networkFirst(request));
});
