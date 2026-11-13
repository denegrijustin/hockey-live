import test from "node:test";
import assert from "node:assert/strict";
import { winHistory } from "../src/lib/win-history.mjs";

const game = { id: 1, state: "LIVE", type: 2, home: "CAR", away: "FLA", period: 2, periodType: "REG", clock: "10:00", intermission: false, homeScore: 1, awayScore: 0, homeShots: 8, awayShots: 6 };
const feed = {
  ...game,
  plays: [{ id: 1, order: 1, period: 1, periodType: "REG", time: "05:00", type: "goal", team: "CAR", player: null, penalty: null, duration: null }],
  shots: [{ id: 1, period: 1, periodType: "REG", time: "05:00", type: "goal", team: "CAR", x: null, y: null }],
};

test("replays the live model minute by minute through the game so far", () => {
  const h = winHistory(game, {}, {}, feed);
  assert.equal(h.length, 30); // 30 minutes elapsed
  assert.equal(h[0].t, 0);
  assert.ok(h.every((p) => p.home > 0 && p.home < 1));
  assert.ok(h[5].home > h[4].home + 0.1, "the goal at 5:00 lifts the home team's chance");
  assert.ok(h[4].home > 0.4 && h[4].home < 0.7, "an even game starts near a coin flip");
});

test("nothing to replay without a live game or its play-by-play", () => {
  assert.deepEqual(winHistory(game, {}, {}, null), []);
  assert.deepEqual(winHistory(game, {}, {}, { ...feed, state: "FUT" }), []);
  assert.deepEqual(winHistory(game, {}, {}, { ...feed, plays: undefined }), []);
});
