import test from "node:test";
import assert from "node:assert/strict";
import { shootingPct, perGame, savePct, gaa, parseToi, formatToi, lastN, pointStreak, goalStreak, teamShare, rankOn, seasonLabel, rangeLabel, fmtRatio, fmt } from "../src/lib/player-stats.mjs";

test("rates are null-safe and never NaN", () => {
  assert.equal(shootingPct(10, 49), 10 / 49);
  for (const v of [shootingPct(1, 0), shootingPct(null, 5), shootingPct(undefined, undefined), perGame(5, 0), perGame("x", 2), savePct(5, 0), savePct(30, 20), gaa(3, 0), gaa(null, 60)]) assert.equal(v, null);
  assert.equal(perGame(47, 18), 47 / 18);
  assert.ok(Math.abs(savePct(330, 361) - 0.9141) < 1e-4);
  assert.equal(gaa(32, 732 * 60 + 20), (32 * 3600) / 43940);
  assert.equal(gaa(2, 3600), 2);
});
test("toi parse and format", () => {
  assert.equal(parseToi("25:15"), 1515);
  assert.equal(parseToi("732:20"), 43940);
  assert.equal(parseToi("1:00:05"), 3605);
  assert.equal(parseToi("bad"), null);
  assert.equal(parseToi(null), null);
  assert.equal(formatToi(1515), "25:15");
  assert.equal(formatToi(43940), "732:20");
  assert.equal(formatToi(null), null);
  assert.equal(formatToi(-1), null);
});
const G = (d, goals, assists) => ({ gameDate: `2026-11-0${d}`, goals, assists, points: goals + assists });
const games = [G(7, 0, 3), G(5, 1, 0), G(6, 0, 0), G(3, 2, 1), G(4, 0, 1)]; // newest-first and unordered on purpose
test("lastN orders by date and takes the most recent", () => {
  assert.deepEqual(lastN(games, 2).map((g) => g.gameDate), ["2026-11-06", "2026-11-07"]);
  assert.deepEqual(lastN(null, 3), []);
  assert.deepEqual(lastN(games, 0), []);
  assert.equal(lastN(games, 10).length, 5);
});
test("streaks count consecutive recent games", () => {
  assert.equal(pointStreak(games), 1); // 7th scored points, 6th did not
  assert.equal(pointStreak([G(1, 0, 1), G(2, 1, 0)]), 2);
  assert.equal(goalStreak(games), 0);
  assert.equal(goalStreak([G(1, 1, 0), G(2, 1, 0)]), 2);
  assert.equal(pointStreak([]), 0);
});
test("team share and rank", () => {
  assert.equal(teamShare(10, 40), 0.25);
  assert.equal(teamShare(10, 0), null);
  assert.equal(teamShare(null, 10), null);
  const items = [{ id: 1, g: 5 }, { id: 2, g: 9 }, { id: 3, g: 5 }, { id: 4, g: null }];
  assert.deepEqual(rankOn(items, 1, (i) => i.g), { rank: 2, of: 3 });
  assert.deepEqual(rankOn(items, 3, (i) => i.g), { rank: 2, of: 3 });
  assert.equal(rankOn(items, 4, (i) => i.g), null);
  assert.equal(rankOn(items, 9, (i) => i.g), null);
});
test("labels", () => {
  assert.equal(seasonLabel(20262027), "Season 2026–27, regular season");
  assert.equal(seasonLabel(null), "Season unavailable");
  assert.equal(rangeLabel(games, 5), "Last 5 games played: Nov 3–Nov 7");
  assert.equal(rangeLabel(games, 1), "Last 1 game played: Nov 7");
  assert.equal(rangeLabel([], 5), null);
  assert.equal(fmtRatio(0.911357, "sv"), ".911");
  assert.equal(fmtRatio(0.204082), "20.4%");
  assert.equal(fmtRatio(null), "—");
  assert.equal(fmt(undefined), "—");
  assert.equal(fmt(2.6217, 2), "2.62");
});
