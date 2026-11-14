import test from "node:test";
import assert from "node:assert/strict";
import { momentum, deserve, modelLine } from "../src/lib/card-metrics.mjs";

const game = { home: "TOR", away: "BOS" };
const shot = (team, period, time, id) => ({ id, team, period, periodType: "REG", time, type: "shot-on-goal", x: 80, y: 0 });
const feed = (shots) => ({ ...game, state: "LIVE", period: 2, periodType: "REG", clock: "10:00", intermission: false, shots, plays: shots });

test("momentum counts the last ten minutes of attempts and names a leader only when it is ahead by two", () => {
  // 2nd period, 10:00 left = 30 minutes elapsed: the window is 20:00-30:00
  const f = feed([shot("BOS", 1, "05:00", 1), shot("TOR", 2, "02:00", 2), shot("TOR", 2, "04:00", 3), shot("TOR", 2, "08:00", 4), shot("BOS", 2, "09:00", 5)]);
  const m = momentum(game, f);
  assert.equal(m.home, 3); assert.equal(m.away, 1); assert.equal(m.leader, "home"); assert.ok(m.balance > 0.4);
  assert.equal(momentum(game, feed([shot("TOR", 2, "02:00", 1), shot("BOS", 2, "03:00", 2)])).leader, null);
});

test("momentum is null when the game is not live or has no shots", () => {
  assert.equal(momentum(game, null), null);
  assert.equal(momentum(game, { ...feed([shot("TOR", 2, "02:00", 1)]), state: "FINAL" }), null);
  assert.equal(momentum(game, feed([])), null);
});

test("deserve needs a few attempts, then splits the win by the chances created", () => {
  assert.equal(deserve(feed([shot("TOR", 2, "02:00", 1)])), null);
  const many = Array.from({ length: 8 }, (_, i) => shot("TOR", 1 + (i % 2), `0${i + 1}:00`, i + 1)).concat([shot("BOS", 2, "09:00", 20)]);
  const d = deserve(feed(many));
  assert.ok(d && d.home > d.away && Math.abs(d.home + d.away - 1) < 1e-9);
});

test("model line names the favourite and rounds the total to a half goal", () => {
  assert.deepEqual(modelLine({ homeWin: 0.62, means: { home: 3.1, away: 2.6 } }), { favourite: "home", total: 5.5 });
  assert.equal(modelLine(null), null);
});
