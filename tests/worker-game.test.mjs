import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// /api/game/:id edge TTL by game state, 404 for an unpublished game (never 502), and one cache key per game (query ignored).
// Upstream bodies are the REAL recorded raw-live-game.json with only gameState/gameScheduleState changed (derived).
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../src");
let code = readFileSync(join(src, "worker.js"), "utf8");
code = code.replace(/from "(\.[^"]+)"/g, (_, rel) => `from "${pathToFileURL(join(src, rel)).href}"${rel.endsWith(".json") ? ' with { type: "json" }' : ""}`);
const file = join(mkdtempSync(join(tmpdir(), "worker-game-")), "worker.mjs");
writeFileSync(file, code);
const stored = new Map();
globalThis.caches = { default: { match: async (r) => stored.get(r.url)?.clone(), put: async (r, res) => { stored.set(r.url, res); } } };
const raw = JSON.parse(readFileSync(join(here, "fixtures/raw-live-game.json"), "utf8"));
let upstream = () => new Response("{}", { status: 500 });
const upstreamCalls = [];
globalThis.fetch = async (url) => { upstreamCalls.push(String(url)); return upstream(String(url)); };
const worker = (await import(pathToFileURL(file).href)).default;
const env = { ASSETS: { fetch: async () => new Response("nope", { status: 404 }) }, TEAM_STATS: { get: async () => null, put: async () => {} } };
const call = async (path) => { const waits = []; const res = await worker.fetch(new Request(`https://x.test${path}`), env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return res; };
const serve = (patch) => { upstream = () => Response.json({ ...raw, ...patch }); };
const ttl = (res) => /max-age=(\d+)/.exec(res.headers.get("Cache-Control"))[1];

test("TTL: 15 s live, 120 s FINAL, 3600 s only OFF, 15 s before the game", async () => {
  for (const [state, want, id] of [["LIVE", "15", 2026020101], ["CRIT", "15", 2026020102], ["FINAL", "120", 2026020103], ["OFF", "3600", 2026020104], ["FUT", "15", 2026020105], ["PRE", "15", 2026020106]]) {
    serve({ gameState: state });
    const res = await call(`/api/game/${id}`);
    assert.equal(res.status, 200, state);
    assert.equal(ttl(res), want, state);
  }
});

test("an unpublished game is 404 with a short TTL, not 502; other upstream failures stay 502", async () => {
  upstream = () => new Response("{}", { status: 404 });
  const res = await call("/api/game/2026020201");
  assert.equal(res.status, 404);
  assert.equal(ttl(res), "15");
  assert.match((await res.json()).error, /not published/);
  upstream = () => new Response("{}", { status: 500 });
  assert.equal((await call("/api/game/2026020202")).status, 502);
});

test("one cache entry per game: the old ?score= query does not split it", async () => {
  serve({ gameState: "LIVE" });
  upstreamCalls.length = 0;
  await call("/api/game/2026020301?score=1-0");
  await call("/api/game/2026020301?score=2-0");
  await call("/api/game/2026020301");
  assert.equal(upstreamCalls.length, 1);
});

test("the response keeps its shape and the scoreboard clock fields", async () => {
  serve({ gameState: "LIVE" });
  const body = await (await call("/api/game/2026020401")).json();
  for (const k of ["plays", "goals", "shots", "roster", "clockRunning", "clockSeconds", "period", "periodType", "intermission", "state"]) assert.ok(k in body, k);
  assert.equal(body.clockRunning, false);
  assert.equal(body.clockSeconds, 692);
});

test("one failed NHL request is retried once, and the second try's answer is used", async () => {
  let n = 0;
  upstream = () => (++n === 1 ? new Response("{}", { status: 503 }) : Response.json({ ...raw, gameState: "LIVE" }));
  upstreamCalls.length = 0;
  const res = await call("/api/game/2026020501");
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 2);
});

test("when the NHL feed fails twice, the last good copy is served instead of an error; with no copy it is still a 502", async () => {
  serve({ gameState: "LIVE" });
  const ok = await call("/api/game/2026020502");
  assert.equal(ok.status, 200);
  const good = await ok.json();
  stored.delete("https://x.test/api/game/2026020502"); // the normal cache entry has expired, the last-good copy has not
  upstream = () => new Response("{}", { status: 503 });
  const res = await call("/api/game/2026020502");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Iceboard-Stale"), "1");
  assert.equal(ttl(res), "5");
  assert.equal((await res.json()).id, good.id);
  assert.equal((await call("/api/game/2026020599")).status, 502);
});
