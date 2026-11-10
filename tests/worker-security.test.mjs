import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Loads src/worker.js with its relative imports made absolute (and JSON imports given the attribute Node requires) so the real routing runs.
const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
let code = readFileSync(join(src, "worker.js"), "utf8");
code = code.replace(/from "(\.[^"]+)"/g, (_, rel) => `from "${pathToFileURL(join(src, rel)).href}"${rel.endsWith(".json") ? ' with { type: "json" }' : ""}`);
const file = join(mkdtempSync(join(tmpdir(), "worker-")), "worker.mjs");
writeFileSync(file, code);
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); return new Response("{}", { status: 500 }); };
const worker = (await import(pathToFileURL(file).href)).default;

const kvReads = [];
const env = {
  ASSETS: { fetch: async (req) => (new URL(req.url).pathname === "/data/manifest.json" ? Response.json({ seasons: [20262027, 20252026], current: 20262027 }) : new Response("nope", { status: 404 })) },
  TEAM_STATS: { get: async (k) => { kvReads.push(k); return null; }, put: async () => {}, delete: async () => {} },
};
const ctx = { waitUntil() {} };
const call = (path, method = "GET") => worker.fetch(new Request(`https://x.test${path}`, { method }), env, ctx);

test("only GET reaches the API: every other method is 405 and touches nothing", async () => {
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    for (const p of ["/api/live", "/api/player/8478402", "/api/moneypuck/20262027/status?refresh=1"]) assert.equal((await call(p, m)).status, 405, `${m} ${p}`);
  }
  assert.equal(kvReads.length, 0);
  assert.equal(calls.length, 0);
});
test("ids that do not match the strict patterns never reach KV or the upstream", async () => {
  const hostile = [
    "/api/player/123456", "/api/player/12345678", "/api/player/..%2f..%2fx", "/api/player/8478402/log/2026", "/api/player/8478402/log/20262027/../x",
    "/api/game/2026020001x", "/api/game/abc", "/api/boxscore/2026020001%0a", "/api/boxscore/%2e%2e",
    "/api/edge/20262027/edm", "/api/edge/20262027/EDM%00", "/api/edge/20262027/../EDM", "/api/players/20262027/E:M", "/api/players/2026/EDM",
    "/api/moneypuck/20262027/shots/123", "/api/moneypuck/20262027/..%2fstatus", "/api/season/2026%2f2027", "/api/season/20262027x", "/api/injuries/x",
  ];
  const before = [kvReads.length, calls.length];
  for (const p of hostile) assert.equal((await call(p)).status, 404, p);
  assert.deepEqual([kvReads.length, calls.length], before);
});
test("unknown teams and seasons are 400 before any KV key is built or upstream call made", async () => {
  const before = [kvReads.length, calls.length];
  for (const p of ["/api/edge/20262027/ZZZ", "/api/edge/20991231/EDM", "/api/players/20262027/ZZZ", "/api/players/20990101/EDM", "/api/season/20990101", "/api/league-matchups/20990101", "/api/moneypuck/20990101/summary"]) assert.equal((await call(p)).status, 400, p);
  assert.deepEqual([kvReads.length, calls.length], before);
});
test("the legacy team-stats route validates team and season before building its KV key", async () => {
  const before = kvReads.length;
  for (const q of ["team=EDM&season=../../x", "team=EDM&season=2026%0a", "team=EDM:evil&season=20252026", "team=EDM&season=abc", "season=20252026"]) assert.equal((await call(`/api/team-stats?${q}`)).status, 400, q);
  assert.equal(kvReads.length, before);
  assert.equal((await call("/api/team-stats?team=EDM&season=20252026")).status, 404); // valid: reads KV, none saved
  assert.deepEqual(kvReads.slice(before), ["EDM-20252026"]);
});
test("errors are generic JSON with nosniff (no upstream detail, no stack)", async () => {
  const r = await call("/api/live");
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await r.json(), { error: "NHL data is temporarily unavailable. Please retry." });
});
test("worker source has no embedded secrets or tokens", () => {
  assert.doesNotMatch(readFileSync(join(src, "worker.js"), "utf8"), /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}/i);
});
