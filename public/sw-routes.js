// Which strategy the service worker uses for a request. Pure (no worker globals) so a node test can check it:
// /api/* is never handled (live scores always go to the network), other origins and non-GET are left alone.
(function (root) {
  function routeFor(method, href, mode, origin) {
    if (method !== "GET") return null;
    var url = new URL(href);
    if (url.origin !== origin) return null;
    var p = url.pathname;
    if (p === "/api" || p.indexOf("/api/") === 0) return null;
    if (mode === "navigate") return "navigate";
    if (p.indexOf("/assets/") === 0 || p.indexOf("/logos/") === 0 || p.indexOf("/network-logos/") === 0) return "static";
    if (p.indexOf("/data/") === 0) return "data";
    return null;
  }
  // A hashed script, stylesheet, font or image is never an HTML page. During a deploy the host can answer a not-yet-published
  // /assets/ URL with the app's index.html (single-page fallback); that must never be cached or handed to the page.
  function isPageForAsset(href, contentType) {
    var p = new URL(href).pathname;
    var asset = p.indexOf("/assets/") === 0 || p.indexOf("/logos/") === 0 || p.indexOf("/network-logos/") === 0;
    return asset && /text\/html/i.test(String(contentType || ""));
  }
  var api = { routeFor: routeFor, isPageForAsset: isPageForAsset };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.iceboardRoutes = api;
})(typeof self !== "undefined" ? self : this);
