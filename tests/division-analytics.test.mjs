import test from "node:test";
import assert from "node:assert/strict";
import { analyticsRows, divisionView, sortRows, cellColors, ordinal, formatMetric, rankOf } from "../src/lib/division-analytics.mjs";

const teams = ["A", "B", "C", "D"].map((id, i) => ({ id, name: `Team ${id}`, division: i < 3 ? "Pacific" : "Central" }));
const table = {
  A: { gp: 20, pts: 31, gf: 70, ga: 46 }, // +1.20 a game
  B: { gp: 21, pts: 29, gf: 66, ga: 51 },
  C: { gp: 19, pts: 21, gf: 50, ga: 49 },
  D: { gp: 20, pts: 10, gf: 40, ga: 60 },
};
const sit = (xGF, xGA, GF, GA) => ({ xGF, xGA, GF, GA, gp: 20 });
const summary = { teams: {
  A: { "5on5": sit(33, 36, 42, 33), all: sit(0, 0, 0, 0), "5on4": sit(0, 0, 20, 2), "4on5": sit(0, 0, 1, 11) },
  B: { "5on5": sit(40, 34, 30, 28), all: sit(0, 0, 0, 0), "5on4": sit(0, 0, 15, 1), "4on5": sit(0, 0, 0, 9) },
  C: { "5on5": sit(30, 40, 20, 30), all: sit(0, 0, 0, 0), "5on4": sit(0, 0, 8, 0), "4on5": sit(0, 0, 0, 12) },
  D: { "5on5": sit(20, 40, 10, 25), all: sit(0, 0, 0, 0), "5on4": sit(0, 0, 5, 0), "4on5": sit(0, 0, 0, 15) },
} };
summary.teams.A.all = { xGA: 40, GA: 33, gp: 20 }; summary.teams.B.all = { xGA: 30, GA: 36, gp: 21 }; summary.teams.C.all = { xGA: 35, GA: 35, gp: 19 }; summary.teams.D.all = { xGA: 50, GA: 70, gp: 20 };

test("rankOf: 1 is best, equal values share a rank, a missing value has none", () => {
  assert.equal(rankOf(5, [1, 5, 9]), 2);
  assert.equal(rankOf(5, [1, 5, 9], false), 2);
  assert.equal(rankOf(5, [5, 5, 9]), 2);
  assert.equal(rankOf(null, [1, 2]), null);
});

test("the metrics: goal diff a game, 5v5 xG and goal share, GSAx, net special-teams goals a game", () => {
  const r = Object.fromEntries(analyticsRows(teams, table, summary).map((x) => [x.id, x]));
  assert.equal(+r.A.gd.toFixed(2), 1.2);
  assert.equal(+r.A.xg.toFixed(4), +(33 / 69).toFixed(4));
  assert.equal(+r.A.goals.toFixed(4), +(42 / 75).toFixed(4));
  assert.equal(r.A.gsax, 7); // 40 expected against, 33 allowed
  assert.equal(+r.A.special.toFixed(2), +((20 + 1 - 2 - 11) / 20).toFixed(2));
  assert.equal(r.A.ranks.gd, 1); assert.equal(r.D.ranks.gd, 4);
  assert.equal(r.B.ranks.xg, 1);
});

test("a team with no MoneyPuck numbers has no value and no rank for them, but keeps its standings numbers", () => {
  const rows = analyticsRows(teams, table, { teams: { A: summary.teams.A } });
  const b = rows.find((x) => x.id === "B");
  assert.equal(b.xg, null); assert.equal(b.ranks.xg, null); assert.equal(b.special, null);
  assert.equal(b.pts, 29); assert.ok(b.gd != null);
});

test("division view: standings position, rank on 5v5 play, and the change between them", () => {
  const rows = analyticsRows(teams, table, summary);
  const order = (a, b) => table[b].pts - table[a].pts; // points order
  const v = divisionView(rows, "Pacific", order);
  assert.deepEqual(v.map((x) => x.id), ["A", "B", "C"]);
  assert.deepEqual(v.map((x) => x.pos), [1, 2, 3]);
  // by xG share inside the division: B (.54) first, A (.48) second, C (.43) third
  assert.deepEqual(v.map((x) => x.xgRank), [2, 1, 3]);
  assert.deepEqual(v.map((x) => x.change), [-1, 1, 0]); // A slips one, B climbs one, C holds
});

test("sorting by a column: best first, reversed on demand, missing values last, ties in standings order", () => {
  const rows = analyticsRows(teams, table, summary);
  const v = divisionView(rows, "Pacific", (a, b) => table[b].pts - table[a].pts);
  assert.deepEqual(sortRows(v, "xg").map((x) => x.id), ["B", "A", "C"]);
  assert.deepEqual(sortRows(v, "xg", true).map((x) => x.id), ["C", "A", "B"]);
  assert.deepEqual(sortRows(v, "xgRank").map((x) => x.id), ["B", "A", "C"]);
  assert.deepEqual(sortRows(v, "team").map((x) => x.id), ["A", "B", "C"]);
  assert.deepEqual(sortRows(v, "pos", true).map((x) => x.id), ["C", "B", "A"]);
  const gap = v.map((x) => (x.id === "A" ? { ...x, xg: null } : x));
  assert.deepEqual(sortRows(gap, "xg").map((x) => x.id), ["B", "C", "A"]);
  assert.deepEqual(sortRows(gap, "xg", true).map((x) => x.id), ["C", "B", "A"]); // still last when reversed
});

test("cell colours: strong green for the best, pale in the middle, strong red for the worst; light text only on the strong ones", () => {
  const best = cellColors(1, 32), mid = cellColors(16, 32), worst = cellColors(32, 32), nine = cellColors(9, 32);
  assert.equal(best.fg, "#ffffff"); assert.equal(worst.fg, "#ffffff"); assert.equal(mid.fg, "#0b1626");
  assert.ok(best.strength > 0.95 && worst.strength > 0.95 && mid.strength < 0.1);
  assert.ok(nine.strength < best.strength && nine.strength > mid.strength);
  assert.notEqual(best.c1, worst.c1);
  assert.equal(cellColors(null, 32).fg, "#e8f0f8"); // no value: a neutral dark tile
});

test("ordinals and number formats", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 32].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "32nd"]);
  assert.equal(formatMetric("gd", 1.2), "+1.20"); assert.equal(formatMetric("gd", -0.294), "−0.29");
  assert.equal(formatMetric("xg", 0.48), "48.0%"); assert.equal(formatMetric("gsax", -0.6), "−0.6"); assert.equal(formatMetric("gsax", 2.6), "+2.6");
  assert.equal(formatMetric("special", null), "—");
});
