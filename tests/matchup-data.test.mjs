import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLeagueMatchups, rankBadge, sharedRank } from "../src/lib/matchup-data.mjs";

test("shared ranking preserves ties and higher/lower-is-better direction", () => {
  assert.deepEqual(sharedRank(3, [5, 3, 3, 1], true), { rank: 2, tied: true, pool: 4, best: false, worst: false });
  assert.deepEqual(sharedRank(1, [5, 3, 3, 1], false), { rank: 1, tied: false, pool: 4, best: true, worst: false });
});

test("ranking badges cover best, top and bottom boundaries", () => {
  assert.equal(rankBadge({ rank: 1, pool: 32, best: true, worst: false })?.label, "Best in League");
  assert.equal(rankBadge({ rank: 5, pool: 32, best: false, worst: false })?.label, "Top 5");
  assert.equal(rankBadge({ rank: 10, pool: 32, best: false, worst: false })?.label, "Top 10");
  assert.equal(rankBadge({ rank: 23, pool: 32, best: false, worst: false })?.label, "Bottom 10");
  assert.equal(rankBadge({ rank: 28, pool: 32, best: false, worst: false })?.label, "Bottom 5");
  assert.equal(rankBadge({ rank: 32, pool: 32, best: false, worst: true })?.label, "Worst");
});

test("normalization derives shooting/save percentage and preserves missing values", () => {
  const snapshot = normalizeLeagueMatchups([
    { teamId: 1, gamesPlayed: 2, goalsForPerGame: 3, goalsAgainstPerGame: 2, shotsForPerGame: 30, shotsAgainstPerGame: 20, powerPlayPct: .2, penaltyKillPct: .8 },
    { teamId: 2, gamesPlayed: 0, goalsForPerGame: null, goalsAgainstPerGame: null, shotsForPerGame: null, shotsAgainstPerGame: null, powerPlayPct: null, penaltyKillPct: null },
  ], [], { "1": "AAA", "2": "BBB" }, 20262027, "2026-10-08T00:00:00Z");
  assert.equal(snapshot.teams.AAA.metrics.shootingPct.value, .1);
  assert.equal(snapshot.teams.AAA.metrics.savePct.value, .9);
  assert.equal(snapshot.teams.BBB.metrics.shootingPct.value, null);
  assert.equal(snapshot.teams.BBB.metrics.shootingPct.rank, null);
});
