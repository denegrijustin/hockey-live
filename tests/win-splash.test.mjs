import test from "node:test";
import assert from "node:assert/strict";
import { oilersWon } from "../src/lib/win-splash.mjs";

const fin = (away, home, a, h, extra = {}) => ({ id: 1, season: 20262027, type: 2, date: "2026-11-15", start: "2026-11-15T01:00:00Z", state: "FINAL", end: "REG", scheduleState: "OK", away, home, awayScore: a, homeScore: h, ...extra });

test("an Edmonton win, home or away, in regulation, overtime or a shootout", () => {
  assert.equal(oilersWon(fin("CGY", "EDM", 2, 3)), true);
  assert.equal(oilersWon(fin("EDM", "VAN", 4, 1)), true);
  assert.equal(oilersWon(fin("EDM", "VAN", 2, 1, { end: "OT" })), true);
  assert.equal(oilersWon(fin("EDM", "VAN", 2, 1, { end: "SO" })), true);
});

test("not an Edmonton win: a loss, another team's game, a game not finished, a missing score", () => {
  assert.equal(oilersWon(fin("CGY", "EDM", 3, 2)), false);
  assert.equal(oilersWon(fin("CGY", "VAN", 3, 2)), false);
  assert.equal(oilersWon(fin("EDM", "VAN", 2, 1, { state: "LIVE", end: "", period: 3, clock: "05:00", periodType: "REG" })), false);
  assert.equal(oilersWon(fin("EDM", "VAN", 2, 1, { state: "FUT", end: "" })), false);
  assert.equal(oilersWon(fin("EDM", "VAN", null, null)), false);
  assert.equal(oilersWon(null), false);
});
