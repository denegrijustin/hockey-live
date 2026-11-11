import { test } from "node:test";
import assert from "node:assert/strict";
import { powerRankings, luckNote } from "../src/lib/power-rankings.mjs";

const sit = (gp, xGF, xGA, GF, GA) => ({ all: { gp, xGF, xGA, GF, GA }, "5on5": { gp, xGF: xGF * 0.8, xGA: xGA * 0.8, GF: GF * 0.8, GA: GA * 0.8 } });
const teams = { AAA: sit(10, 30, 20, 35, 15), BBB: sit(10, 25, 25, 20, 30), CCC: sit(10, 20, 30, 18, 24), DDD: { all: { gp: 0 } }, EEE: { all: { gp: 5, xGF: null, xGA: 1, GF: 1, GA: 1 } } };

test("the three parts always add up to the power score, which is goal differential per game", () => {
  const { rows } = powerRankings(teams, "all");
  for (const r of rows) {
    assert.ok(Math.abs(r.chances + r.goaltending + r.finishing - r.power) < 1e-9);
    assert.ok(Math.abs(r.power - (r.GF - r.GA) / r.gp) < 1e-9);
  }
});
test("per-game values, ranks, xG% and ordering", () => {
  const { rows } = powerRankings(teams, "all");
  assert.deepEqual(rows.map((r) => r.team), ["AAA", "CCC", "BBB"].sort((a, b) => rows.find((r) => r.team === a).rank - rows.find((r) => r.team === b).rank));
  const a = rows.find((r) => r.team === "AAA");
  assert.equal(a.rank, 1);
  assert.ok(Math.abs(a.chances - 1) < 1e-9 && Math.abs(a.goaltending - 0.5) < 1e-9 && Math.abs(a.finishing - 0.5) < 1e-9 && Math.abs(a.power - 2) < 1e-9);
  assert.ok(Math.abs(a.xGPct - 0.6) < 1e-9);
});
test("teams with no games or missing numbers are left out, not shown as zero", () => {
  const { rows } = powerRankings(teams, "all");
  assert.equal(rows.some((r) => r.team === "DDD" || r.team === "EEE"), false);
  assert.deepEqual(powerRankings(null, "all").rows, []);
  assert.deepEqual(powerRankings(teams, "nope").rows, []);
});
test("the situation changes the numbers and the column scale is the largest magnitude", () => {
  const all = powerRankings(teams, "all"), five = powerRankings(teams, "5on5");
  assert.ok(Math.abs(five.rows.find((r) => r.team === "AAA").power - 1.6) < 1e-9);
  assert.ok(Math.abs(all.maxAbs.power - 2) < 1e-9);
});
test("results far from chances are flagged", () => {
  assert.equal(luckNote({ power: 1.2, chances: 0.4 }), "results ahead of chances");
  assert.equal(luckNote({ power: -0.5, chances: 0.1 }), "results behind chances");
  assert.equal(luckNote({ power: 0.5, chances: 0.4 }), null);
});
