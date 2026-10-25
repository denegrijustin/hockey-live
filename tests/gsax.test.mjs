import test from "node:test";
import assert from "node:assert/strict";
import { gsaxBoard, gsaxByGame, rollingMean } from "../src/lib/gsax.mjs";

const summary = { teams: {
  AAA: { all: { gp: 10, xGA: 30, GA: 20 } }, BBB: { all: { gp: 10, xGA: 25, GA: 28 } }, CCC: { all: { gp: 5, xGA: 12, GA: 12 } },
  DDD: { all: { gp: 10, xGA: 30, GA: 20 } }, EEE: { all: {} },
} };

test("the board ranks teams by xGA minus GA; ties share a rank; teams without numbers are left out", () => {
  const b = gsaxBoard(summary);
  assert.deepEqual(b.map((r) => r.team), ["AAA", "DDD", "CCC", "BBB"]);
  assert.deepEqual(b.map((r) => r.rank), [1, 1, 3, 4]);
  assert.equal(b[0].gsax, 10);
  assert.equal(b[0].perGame, 1);
  assert.equal(b.at(-1).gsax, -3);
  assert.deepEqual(gsaxBoard(null), []);
});

test("per-game values follow the team's finished games in order", () => {
  const games = [
    { id: 2, type: 2, state: "FINAL", date: "2026-10-02", start: "2026-10-02T23:00:00Z", home: "AAA", away: "BBB" },
    { id: 1, type: 2, state: "FINAL", date: "2026-10-01", start: "2026-10-01T23:00:00Z", home: "CCC", away: "AAA" },
    { id: 3, type: 2, state: "FUT", date: "2026-10-03", start: "2026-10-03T23:00:00Z", home: "AAA", away: "CCC" },
  ];
  const part = { games: { 1: { teams: { AAA: { all: { xGA: 3, GA: 1 } } } }, 2: { teams: { AAA: { all: { xGA: 2, GA: 3 } } } } } };
  assert.deepEqual(gsaxByGame(part, games, "AAA").map((x) => x.value), [2, -1]);
  assert.deepEqual(gsaxByGame(part, games, "BBB").map((x) => x.value), [null]); // a game the source does not have
});

test("a rolling mean skips missing games", () => {
  const pts = [{ date: "a", value: 2 }, { date: "b", value: null }, { date: "c", value: 4 }];
  assert.deepEqual(rollingMean(pts, 1).map((p) => p.value), [2, 0, 4]);
  assert.deepEqual(rollingMean(pts, 3).map((p) => p.value), [2, 2, 3]);
});
