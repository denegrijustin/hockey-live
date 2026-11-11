import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
const ctx = { self: {}, URL };
vm.runInNewContext(readFileSync(new URL("../public/sw-routes.js", import.meta.url), "utf8"), ctx); // the worker loads it as a classic script
const { routeFor } = ctx.self.iceboardRoutes;
const O = "https://iceboard.test";
const r = (path, mode = "no-cors", method = "GET", origin = O) => routeFor(method, origin + path, mode, O);

test("/api/* is never handled by the worker", () => {
  for (const p of ["/api/live", "/api/game/1?score=1-2", "/api/", "/api"]) assert.equal(r(p), null, p);
  assert.equal(r("/api/live", "navigate"), null);
});
test("navigations, hashed assets, logos and saved data get their strategies", () => {
  assert.equal(r("/", "navigate"), "navigate");
  assert.equal(r("/?view=games", "navigate"), "navigate");
  assert.equal(r("/assets/index-abc.js"), "static");
  assert.equal(r("/logos/EDM.svg"), "static");
  assert.equal(r("/network-logos/espn.svg"), "static");
  assert.equal(r("/data/manifest.json"), "data");
});
test("other origins, non-GET and unknown paths are left to the network", () => {
  assert.equal(r("/data/x.json", "cors", "GET", "https://evil.test"), null);
  assert.equal(r("/data/x.json", "cors", "POST"), null);
  assert.equal(r("/random.txt"), null);
  assert.equal(r("/manifest.webmanifest"), null);
});
test("sw.js uses the shared router, a build-stamped cache name and a capped cache", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /importScripts\("\/sw-routes\.js"\)/);
  assert.match(sw, /__BUILD_ID__/);
  assert.match(sw, /MAX_ENTRIES/);
  assert.doesNotMatch(sw, /startsWith\("\/api/);
});
