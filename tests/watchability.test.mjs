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

import { tierOf, watchBreakdown, pickWatchNow, recap } from "../src/lib/watchability.mjs";

test("tiers", () => {
  assert.deepEqual([80, 75, 60, 49].map((n) => tierOf(n).key), ["high", "high", "mid", "low"]);
});

test("the breakdown adds up to the forecast, and a live game reports its bonus separately", () => {
  const b = watchBreakdown(80, 0.5);
  assert.equal(b.score, 87);
  assert.equal(b.parts.reduce((n, p) => n + p.points, 0), b.score);
  const hot = watchBreakdown(60, 0.5, live({}));
  assert.equal(hot.parts.reduce((n, p) => n + p.points, 0), hot.score); // the parts explain the forecast, not the live bonus
  assert.ok(hot.bonus > 0 && hot.total === hot.score + hot.bonus);
  assert.equal(b.bonus, 0);
  assert.equal(watchBreakdown(60, null).parts.length, 1);
});

test("watch now: hottest live first, then the best starting within the hour, capped", () => {
  const now = Date.parse("2026-10-22T23:00:00Z");
  const mk = (id, state, startMin, score, heat = score) => ({ game: { id, state, start: new Date(now + startMin * 60000).toISOString() }, score, heat });
  const items = [mk(1, "LIVE", -30, 50, 70), mk(2, "LIVE", -40, 60, 90), mk(3, "FUT", 20, 80), mk(4, "FUT", 45, 90), mk(5, "FUT", 90, 99), mk(6, "FINAL", -200, 99), mk(7, "LIVE", -10, 40, 55), mk(8, "LIVE", -5, 30, 35)];
  const tiles = pickWatchNow(items, now, { max: 5 });
  assert.deepEqual(tiles.map((t) => t.game.id), [2, 1, 7, 8, 4]); // 3 and 4 are soon; 4 is the better one; 5 starts in 90 minutes; 6 is over
  assert.equal(pickWatchNow(items, now, { max: 3 }).length, 3);
  assert.deepEqual(pickWatchNow(items, now, { max: 3 }).map((t) => t.kind), ["live", "live", "live"]);
  assert.equal(tiles.at(-1).minutes, 45);
});

test("recap says who won, whether it was an upset, and how the shots went", () => {
  const names = { home: "Maple Leafs", away: "Bruins" };
  const g = { state: "FINAL", homeScore: 3, awayScore: 2, end: "OT", homeShots: 24, awayShots: 31 };
  assert.match(recap(g, 0.35, names), /Maple Leafs beat Bruins 3–2 in overtime\. An upset: Maple Leafs had just a 35% chance/);
  assert.match(recap(g, 0.35, names), /won despite being outshot 31–24/);
  assert.match(recap({ ...g, end: "REG", homeShots: null }, 0.7, names), /favorite \(70% before the game\)/);
  assert.match(recap({ ...g, end: "REG" }, 0.5, names), /near coin flip/);
  assert.equal(recap({ state: "LIVE", homeScore: 1, awayScore: 0 }, 0.5, names), "");
});

import { upsetWon } from "../src/lib/watchability.mjs";
test("upsetWon: the winner had a 40% chance or less before the game", () => {
  const fin = (h, a) => ({ state: "OFF", homeScore: h, awayScore: a });
  assert.equal(upsetWon(fin(3, 2), 0.35), 0.35); // home underdog won
  assert.ok(Math.abs(upsetWon(fin(2, 3), 0.7) - 0.3) < 1e-9); // away underdog won
  assert.equal(upsetWon(fin(3, 2), 0.6), null); // the favourite won
  assert.equal(upsetWon(fin(3, 2), 0.41), null); // a near coin flip is not an upset
  assert.equal(upsetWon({ state: "LIVE", homeScore: 3, awayScore: 2 }, 0.3), null); // not finished
  assert.equal(upsetWon(fin(2, 2), 0.3), null);
  assert.equal(upsetWon(fin(3, 2), null), null);
});
