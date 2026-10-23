import test from "node:test";
import assert from "node:assert/strict";
import { watchability, closeAndLate, liveHeat, upsetBrewing, periodOf, slotOf } from "../src/lib/watchability.mjs";

const live = (o) => ({ state: "LIVE", period: 3, periodType: "REG", homeScore: 2, awayScore: 2, ...o });

test("watchability rewards stakes and an even game, and falls back to stakes alone", () => {
  assert.equal(watchability(80, 0.5), Math.round(0.65 * 80 + 35));
  assert.ok(watchability(80, 0.5) > watchability(80, 0.9));
  assert.equal(watchability(70, null), 70);
  assert.equal(watchability(undefined, null), 50);
  assert.ok(watchability(100, 0.5) <= 100);
});

test("close and late: a one-goal game in the 3rd period or overtime", () => {
  assert.equal(closeAndLate(live({ homeScore: 3, awayScore: 2 })).both, true);
  assert.equal(closeAndLate(live({ period: 2 })).both, false);
  assert.equal(closeAndLate(live({ homeScore: 4, awayScore: 1 })).both, false);
  assert.match(closeAndLate(live({ period: 4, periodType: "OT" })).label, /overtime/);
  assert.equal(closeAndLate({ state: "FUT" }).both, false);
  assert.equal(closeAndLate({ state: "FINAL", homeScore: 1, awayScore: 0, period: 3 }).both, false);
});

test("heat: closer and later is hotter, capped at 100, and a game not live keeps its score", () => {
  assert.equal(liveHeat(60, { state: "FUT" }), 60);
  assert.ok(liveHeat(60, live({})) > liveHeat(60, live({ period: 1, homeScore: 0, awayScore: 0 })));
  assert.ok(liveHeat(60, live({ homeScore: 5, awayScore: 1 })) < liveHeat(60, live({})));
  assert.ok(liveHeat(60, live({ period: 4, periodType: "OT" })) > liveHeat(60, live({})));
  assert.equal(liveHeat(99, live({ period: 4, periodType: "OT" })), 100);
});

test("upset brewing: the underdog leading late, or tied in overtime", () => {
  assert.equal(upsetBrewing(live({ homeScore: 1, awayScore: 2 }), 0.7), "away"); // home favoured, away leads
  assert.equal(upsetBrewing(live({ homeScore: 2, awayScore: 1 }), 0.3), "home");
  assert.equal(upsetBrewing(live({ homeScore: 2, awayScore: 1 }), 0.7), null); // the favourite is ahead
  assert.equal(upsetBrewing(live({ period: 2, homeScore: 2, awayScore: 1 }), 0.3), null); // too early
  assert.equal(upsetBrewing(live({ homeScore: 2, awayScore: 2 }), 0.3), null); // tied in regulation
  assert.equal(upsetBrewing(live({ period: 4, periodType: "OT", homeScore: 2, awayScore: 2 }), 0.3), "home");
  assert.equal(upsetBrewing(live({ homeScore: 2, awayScore: 1 }), 0.5), null); // no clear underdog
});

test("periods and slots", () => {
  assert.equal(periodOf({ period: 3, periodType: "REG" }), 3);
  assert.equal(periodOf({ period: 4, periodType: "OT" }), 4);
  assert.equal(periodOf({ period: 3, periodType: "SO" }), 4);
  assert.equal(slotOf("2026-10-22T23:37:10Z"), "2026-10-22T23:00:00.000Z");
});
