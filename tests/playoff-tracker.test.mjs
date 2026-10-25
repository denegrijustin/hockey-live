import test from "node:test";
import assert from "node:assert/strict";
import { buildTracker, TIERS } from "../src/lib/playoff-tracker.mjs";

const teams = Array.from({ length: 12 }, (_, i) => ({ id: `T${i}`, conference: i < 6 ? "E" : "W" }));
const ps = [100, 99.96, 92, 55, 30, 0, 100, 60, 3, 0.01, 0, 99.9];
const result = { teams: Object.fromEntries(teams.map((t, i) => [t.id, { pPlayoffs: ps[i] }])) };

test("every team lands in exactly one tier, by its chance", () => {
  const out = buildTracker({ teams, result });
  assert.equal(out.length, 2);
  for (const c of out) {
    assert.equal(c.tiers.reduce((n, t) => n + t.teams.length, 0), 6);
    assert.equal(c.tiers.length, TIERS.length);
  }
  const east = out[0];
  assert.deepEqual(east.tiers.map((t) => t.teams.map((x) => x.id)), [["T0", "T1"], ["T2"], ["T3"], ["T4"], [], ["T5"]]);
  assert.equal(east.inField, 2);
  assert.equal(east.contention, 5); // everyone not eliminated
  const west = out[1];
  assert.deepEqual(west.tiers.find((t) => t.key === "long").teams.map((x) => x.id), ["T9", "T8"].sort((a, b) => ps[+b.slice(1)] - ps[+a.slice(1)]));
});

test("within a tier the likeliest team comes first", () => {
  const out = buildTracker({ teams, result });
  const west = out[1];
  assert.deepEqual(west.tiers[0].teams.map((x) => x.id), ["T6"]);
  assert.deepEqual(west.tiers[1].teams.map((x) => x.id), ["T11"]);
});
