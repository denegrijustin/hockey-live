import test from "node:test";
import assert from "node:assert/strict";
import { headToHead, formStrip, rankTracks, goalTimeline, pairColors } from "../src/lib/intel-visuals.mjs";

const game = { id: 2026020100, away: "EDM", home: "TOR", type: 2, season: 20262027 };
const row = (gp, pts, gf, ga, outcomes) => ({ gp, pts, gf, ga, results: outcomes.map((o) => ({ outcome: o })) });
const before = { EDM: row(20, 28, 70, 55, ["W", "W", "L", "OT", "W", "W"]), TOR: row(20, 22, 55, 60, ["L", "L", "W", "L", "OT"]) };
const snapshot = { teams: { EDM: { gamesPlayed: 20, metrics: { powerPlayPct: { value: 0.285, rank: 3, pool: 32 }, penaltyKillPct: { value: 0.79, rank: 20, pool: 32 } } }, TOR: { gamesPlayed: 20, metrics: { powerPlayPct: { value: 0.182, rank: 24, pool: 32 }, penaltyKillPct: { value: 0.841, rank: 6, pool: 32 } } } } };

test("head-to-head rows: values, who is ahead, and lower-is-better for goals against", () => {
  const rows = headToHead(before, game, snapshot);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(by), ["pts", "gf", "ga", "pp", "pk"]);
  assert.equal(by.pts.better, "away"); assert.equal(by.pts.away.text, "70.0%");
  assert.equal(by.gf.better, "away"); assert.equal(by.gf.away.text, "3.50");
  assert.equal(by.ga.better, "away"); assert.equal(by.ga.away.text, "2.75");
  assert.ok(by.ga.share > 0.5, "the team allowing fewer goals takes the larger share");
  assert.equal(by.pk.better, "home");
  assert.equal(by.pp.away.text, "28.5%"); assert.equal(by.pk.home.text, "84.1%");
  for (const r of rows) assert.ok(r.share >= 0 && r.share <= 1);
});
test("rows with missing inputs are left out, never filled in", () => {
  assert.deepEqual(headToHead(null, game, null), []);
  assert.deepEqual(headToHead({ EDM: row(2, 3, 5, 5, []), TOR: row(2, 3, 5, 5, []) }, game, null), []);
  assert.deepEqual(headToHead(before, game, null).map((r) => r.key), ["pts", "gf", "ga"]);
});
test("an even matchup on a row is called even", () => {
  const even = { EDM: row(20, 24, 60, 60, []), TOR: row(20, 24, 60, 60, []) };
  assert.ok(headToHead(even, game, null).every((r) => r.better === "even"));
});
test("form strip: last five results, oldest first, needs a real sample", () => {
  assert.deepEqual(formStrip(before, game).away, ["W", "L", "OT", "W", "W"]);
  assert.equal(formStrip({ EDM: row(20, 1, 1, 1, ["W"]), TOR: row(20, 1, 1, 1, ["W"]) }, game), null);
});
test("rank tracks carry both teams' rank and percentage for the power play and the penalty kill", () => {
  const t = rankTracks(snapshot, game);
  assert.deepEqual(t.map((x) => x.key), ["pp", "pk"]);
  assert.ok(Math.abs(t[0].away.pct - 28.5) < 1e-9);
  assert.equal(t[0].away.rank, 3); assert.equal(t[0].home.rank, 24); assert.equal(t[0].pool, 32);
  assert.deepEqual(rankTracks(null, game), []);
});
test("goal timeline: goals on a game-time axis, extended for overtime, shootout goals excluded", () => {
  const goal = (order, team, period, time, score, periodType = "REG") => ({ type: "goal", order, team, period, time, periodType, player: "P", score });
  const plays = [goal(1, "EDM", 1, "05:00", { home: 0, away: 1 }), goal(2, "TOR", 2, "10:00", { home: 1, away: 1 }), goal(3, "TOR", 4, "01:30", { home: 2, away: 1 }, "OT"), goal(4, "EDM", 5, "00:00", { home: 2, away: 2 }, "SO")];
  const t = goalTimeline(plays, { ...game, state: "FINAL", homeScore: 3, awayScore: 2, end: "SO" });
  assert.ok(t);
  assert.equal(t.marks.length, 3);
  assert.deepEqual(t.marks.map((m) => m.side), ["away", "home", "home"]);
  assert.equal(t.marks[0].elapsed, 300); assert.equal(t.marks[1].elapsed, 1200 + 600);
  assert.equal(t.overtime, true); assert.ok(t.end > 3600);
  assert.equal(goalTimeline([], game), null);
});
test("two near-identical team colours get told apart", () => {
  assert.notEqual(pairColors("#1d428a", "#1f4a95")[1], "#1f4a95");
  assert.deepEqual(pairColors("#c8102e", "#003087"), ["#c8102e", "#003087"]);
});
