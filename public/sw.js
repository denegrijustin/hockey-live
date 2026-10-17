// Iceboard service worker: lets the app open with no signal. It never touches /api (the app already falls back to the
// saved /data copy by itself) and never serves a stale page when the network is up, so a new deploy shows at once.
const CACHE = "iceboard-v1";
const SHELL_WAIT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function put(request, response) {
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}
// Network first; the saved copy answers when the network fails or is slow to reply.
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
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
  } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/logos/") || url.pathname.startsWith("/network-logos/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(request));
  }
});
