import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRecap, deservedToWin, estimateXg, HIGH_XG } from "../src/lib/game-recap.mjs";

const live = JSON.parse(readFileSync(new URL("./fixtures/live-game.json", import.meta.url), "utf8"));
const mp = JSON.parse(readFileSync(new URL("./fixtures/shots/2026020050.json", import.meta.url), "utf8"));

test("the estimate: close and in front is worth far more than far and wide, and stays a probability", () => {
  const slot = estimateXg(80, 3), point = estimateXg(40, 5), wide = estimateXg(85, 35);
  assert.ok(slot > point * 3);
  assert.ok(slot > wide);
  for (const [x, y] of [[0, 0], [89, 0], [100, 42], [-60, -20]]) { const p = estimateXg(x, y); assert.ok(p > 0 && p < 1); }
  assert.equal(estimateXg(-80, 3), estimateXg(80, 3)); // either end of the rink
});

test("deserved to win: the side with the better chances is favoured, an even game is 50/50, and a tie is split", () => {
  const even = deservedToWin([0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);
  assert.ok(Math.abs(even.home - 0.5) < 1e-9 && Math.abs(even.away - 0.5) < 1e-9);
  const better = deservedToWin([0.3, 0.3, 0.3, 0.3], [0.05, 0.05]);
  assert.ok(better.home > 0.8);
  assert.ok(Math.abs(better.home + better.away - 1) < 1e-9);
  assert.ok(deservedToWin([], []).home === 0.5);
});

test("a live game is built from the feed: estimated chances, shots, hits and faceoffs side by side", () => {
  const r = buildRecap({ game: live });
  assert.equal(r.source, "estimate");
  assert.equal(r.list.length, live.shots.length);
  assert.ok(r.xg.home >= 0 && r.xg.away >= 0);
  assert.equal(r.sog.home, live.homeShots);
  assert.deepEqual(r.hits, { home: 21, away: 14 });
  assert.deepEqual(r.faceoffs, { home: 15, away: 7 });
  assert.ok(Math.abs(r.deserved.home + r.deserved.away - 1) < 1e-9);
  assert.equal(r.performers, null); // no names to build stars from
  assert.ok(r.topChances.length <= 3);
});

test("a finished game with MoneyPuck uses its expected goals, lists the goals with their value, and finds the stars", () => {
  const game = { id: 2026020050, season: 20262027, type: 2, home: mp.home, away: mp.away, homeScore: mp.shots.filter((s) => s.g && s.team === mp.home).length, awayScore: mp.shots.filter((s) => s.g && s.team === mp.away).length, state: "FINAL", end: "REG" };
  const r = buildRecap({ game, mp });
  assert.equal(r.source, "moneypuck");
  assert.ok(Math.abs(r.xg.home + r.xg.away - mp.shots.reduce((s, x) => s + x.xg, 0)) < 1e-6);
  assert.equal(r.goals.length, game.homeScore + game.awayScore);
  assert.ok(r.goals.every((g, i) => g.n === i + 1 && g.xg > 0));
  assert.equal(r.performers.stars.length, 3);
  assert.ok(r.performers.goalies.length <= 2);
  assert.ok(r.series.home.at(-1).v === r.xg.home);
  assert.equal(r.marks.length, r.goals.length);
});

test("a game still in the second period spans only what has been played: no third period on the race chart", () => {
  const inSecond = { ...live, period: 2, periodType: "REG", clock: "08:00", intermission: false, state: "LIVE" }; // 12:00 into the 2nd: 32 minutes played
  const r = buildRecap({ game: inSecond });
  assert.ok(r.series.end >= 1920 && r.series.end < 2400, `end ${r.series.end}`);
  assert.equal(r.series.home.at(-1).t, r.series.end); // the lines stop at "now"
  const finalGame = { ...live, state: "FINAL", end: "REG" };
  assert.equal(buildRecap({ game: finalGame }).series.end, 3600); // a finished game spans the full three periods
  const inThird = { ...live, period: 3, periodType: "REG", clock: "10:00", intermission: false, state: "LIVE" };
  assert.ok(buildRecap({ game: inThird }).series.end >= 3000);
});

test("high-chance shots are those worth 0.20 xG or more, in time order, goals flagged", () => {
  const r = buildRecap({ game: live });
  assert.ok(HIGH_XG === 0.2);
  assert.ok(r.chances.every((c) => c.xg >= HIGH_XG));
  assert.ok(r.chances.every((c, i, a) => i === 0 || a[i - 1].t <= c.t));
  assert.equal(r.chances.length, r.list.filter((a) => a.xg >= HIGH_XG).length);
});
