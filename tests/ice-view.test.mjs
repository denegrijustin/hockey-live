import test from "node:test";
import assert from "node:assert/strict";
import { HIGH_DANGER_FT, NET_X, iceShots, iceSummary, isHighDanger } from "../src/lib/ice-view.mjs";

const game = {
  home: "BOS", away: "TOR", homeShots: 3, awayShots: 2, period: 2, periodType: "REG", clock: "10:00", intermission: false, type: 2, state: "LIVE",
  plays: [
    // BOS shoots at the net on the right in P1 and the left in P2: both land at the same end of the picture.
    { id: 1, order: 1, type: "shot-on-goal", team: "BOS", period: 1, periodType: "REG", time: "03:00", x: 80, y: 3 },
    { id: 2, order: 2, type: "goal", team: "BOS", period: 2, periodType: "REG", time: "01:00", x: -85, y: -2 },
    { id: 3, order: 3, type: "missed-shot", team: "BOS", period: 2, periodType: "REG", time: "02:00", x: -50, y: 30 },
    { id: 4, order: 4, type: "shot-on-goal", team: "TOR", period: 1, periodType: "REG", time: "05:00", x: -60, y: 20 },
    { id: 5, order: 5, type: "shot-on-goal", team: "TOR", period: 2, periodType: "REG", time: "05:00", x: 74, y: -5 },
    { id: 6, order: 6, type: "blocked-shot", team: "TOR", period: 2, periodType: "REG", time: "06:00", x: 60, y: 0 },
    { id: 7, order: 7, type: "hit", team: "TOR", period: 2, periodType: "REG", time: "07:00", x: 0, y: 0 },
    { id: 8, order: 8, type: "shot-on-goal", team: "BOS", period: 4, periodType: "SO", time: "00:00", x: 80, y: 0 },
    { id: 9, order: 9, type: "shot-on-goal", team: "TOR", period: 2, periodType: "REG", time: "08:00", x: null, y: null },
  ],
};

test("a shot is high-danger from within 24 feet of the net, at either end", () => {
  assert.equal(NET_X, 89);
  assert.equal(HIGH_DANGER_FT, 24);
  assert.ok(isHighDanger(80, 3));
  assert.ok(isHighDanger(-85, -2));
  assert.ok(isHighDanger(70, 10));
  assert.ok(!isHighDanger(50, 30));
  assert.ok(!isHighDanger(0, 0));
  assert.ok(!isHighDanger(null, 4));
});
test("the away team's shots are drawn at the left net and the home team's at the right (the order the scoreboard lists them), whichever way they were attacking", () => {
  const shots = iceShots(game);
  assert.deepEqual(shots.map((s) => s.id), [1, 2, 3, 4, 5]); // no block, hit, shootout attempt or shot without a spot
  for (const s of shots) assert.ok(s.home ? s.x > 0 : s.x < 0);
  assert.deepEqual(shots.map((s) => s.kind), ["sog", "goal", "miss", "sog", "sog"]);
  assert.deepEqual(shots.filter((s) => s.hd).map((s) => s.id), [1, 2, 5]);
});
test("the summary counts shots on goal, high-danger chances and attempts", () => {
  const s = iceSummary(game);
  assert.deepEqual(s.sog, { home: 3, away: 2 });
  assert.deepEqual(s.hd, { home: 2, away: 1 }); // a miss is not counted as a chance on goal
  assert.deepEqual(s.attempts, { home: 3, away: 4 });
  assert.equal(s.goals.length, 1);
});
test("with no plays it falls back to the feed's shots, and with nothing it is empty", () => {
  const s = iceSummary({ home: "BOS", away: "TOR", shots: [{ id: 1, type: "shot-on-goal", team: "TOR", x: 70, y: 0, period: 1, periodType: "REG", time: "01:00" }] });
  assert.equal(s.shots.length, 1);
  assert.equal(s.attempts, null);
  assert.equal(s.tilt, null);
  assert.equal(iceSummary({ home: "A", away: "B" }).shots.length, 0);
});
