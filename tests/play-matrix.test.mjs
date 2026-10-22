import test from "node:test";
import assert from "node:assert/strict";
import { playBand, resultBand, playMatrix } from "../src/lib/play-matrix.mjs";

test("bands use the stated thresholds", () => {
  assert.deepEqual([52.5, 50, 47.5, 47.4].map(playBand), ["well", "even", "even", "out"]);
  assert.deepEqual([0.6, 0.5, 0.45, 0.449].map(resultBand), ["winning", "water", "water", "losing"]);
});

test("teams land in the cell for their play and results, best play first; teams without games are left out", () => {
  const m = playMatrix(
    [{ team: "CAR", xGPct: 56 }, { team: "TBL", xGPct: 54 }, { team: "SEA", xGPct: 45 }, { team: "CHI", xGPct: 44 }, { team: "ANA", xGPct: 50 }, { team: "XXX", xGPct: 50 }, { team: "NYI", xGPct: null }],
    { CAR: { gp: 10, pts: 14 }, TBL: { gp: 10, pts: 12 }, SEA: { gp: 10, pts: 13 }, CHI: { gp: 10, pts: 6 }, ANA: { gp: 10, pts: 10 }, NYI: { gp: 10, pts: 10 }, XXX: { gp: 0, pts: 0 } },
  );
  assert.deepEqual(m["well/winning"].map((t) => t.team), ["CAR", "TBL"]);
  assert.deepEqual(m["out/winning"].map((t) => t.team), ["SEA"]);
  assert.deepEqual(m["out/losing"].map((t) => t.team), ["CHI"]);
  assert.deepEqual(m["even/water"].map((t) => t.team), ["ANA"]);
  assert.equal(Object.values(m).flat().length, 5);
});
