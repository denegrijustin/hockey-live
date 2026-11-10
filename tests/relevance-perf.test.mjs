import test from "node:test";
import assert from "node:assert/strict";
import teams from "../src/data/teams.json" with { type: "json" };
import { rankGames } from "../src/lib/relevance.mjs";

// Personalization cost: a full slate ranked with the largest allowed context (32 favorites, 32 followed teams, 100 saved games).
const NOW = Date.parse("2026-11-10T18:00:00Z");
const ids = teams.map((t) => t.id);
const slate = Array.from({ length: 16 }, (_, i) => ({ id: 2026020000 + i, season: 20262027, type: 2, date: "2026-11-10", start: "2026-11-10T23:00:00Z", state: i % 4 === 0 ? "LIVE" : "FUT", scheduleState: "OK", venue: "", home: ids[i * 2], away: ids[i * 2 + 1], homeScore: i % 4 === 0 ? 1 : null, awayScore: i % 4 === 0 ? 2 : null, end: "", broadcasts: [], round: null, period: 2, clock: "10:00" }));
const ctx = { teams, now: NOW, favorites: ids, followedTeams: ids, saved: Array.from({ length: 100 }, (_, i) => 2026020000 + i), allGames: slate };
const order = (r) => r.map((x) => x.game?.id ?? x.id);

test("ranking a full slate with a maxed-out personal context stays under 10 ms per Home render (median of 200)", () => {
  rankGames(slate, ctx); // warm up
  const times = [];
  for (let i = 0; i < 200; i++) { const t = performance.now(); rankGames(slate, ctx); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  const median = times[100], p95 = times[190];
  console.log(`rankGames 16 games, 32 favorites, 100 saved: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
  assert.ok(median < 10, `median ${median} ms`);
  assert.ok(p95 < 50, `p95 ${p95} ms`);
});
test("a maxed-out context ranks deterministically and keeps every live or upcoming game", () => {
  const a = order(rankGames(slate, ctx));
  assert.deepEqual(a, order(rankGames(slate, ctx)));
  assert.equal(a.length, slate.length);
});
