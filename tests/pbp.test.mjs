import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventLabel, strengthLabel, groupOf, importance, humanize, sortPlays, groupByPeriod, periodList, applyFilters, goalList, jumpToGoals, playsSignature, eventFlags, mergeVoided, periodInfo, defaultNewestFirst, goalIds, FILTER_GROUPS } from "../src/lib/pbp.mjs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";

const game = { home: "CAR", away: "FLA" };
const g = (id, team, extra = {}) => ({ id, order: id, period: 1, periodType: "REG", time: "01:00", type: "goal", team, ...extra });

test("eventLabel describes known types and humanises unknown ones", () => {
  assert.equal(eventLabel({ type: "goal", shotType: "wrist" }), "Wrist goal");
  assert.equal(eventLabel({ type: "penalty", penalty: "delaying-game-puck-over-glass", duration: 2 }), "Delaying game puck over glass (2 min)");
  assert.equal(eventLabel({ type: "stoppage", reason: "tv-timeout" }), "Stoppage: tv timeout");
  assert.equal(eventLabel({ type: "missed-shot", shotType: "slap", reason: "wide-left" }), "Slap shot missed (wide left)");
  assert.equal(eventLabel({ type: "shootout-attempt-xyz" }), "Shootout attempt xyz");
  assert.equal(eventLabel({ type: "someNewThing" }), "Some new thing");
  assert.equal(eventLabel({ type: "goal", periodType: "SO" }), "Shootout goal");
  assert.equal(eventLabel({ type: "shot-on-goal", periodType: "SO" }), "Shootout attempt saved");
  assert.equal(eventLabel({}), "Event");
  assert.equal(eventLabel(null), "Event");
  assert.equal(humanize(null), "");
});
test("strengthLabel decodes only what the situation code says", () => {
  assert.equal(strengthLabel("1551").label, "5v5");
  assert.equal(strengthLabel("1441").label, "4v4");
  assert.equal(strengthLabel("1331").label, "3v3");
  assert.equal(strengthLabel("1541", "home").label, "Penalty kill 4v5");
  assert.equal(strengthLabel("1541", "away").label, "Power play 5v4");
  assert.equal(strengthLabel("1451", "home").label, "Power play 5v4");
  assert.equal(strengthLabel("1541"), null, "uneven skaters without a side: no label");
  assert.equal(strengthLabel("0651").kind, "empty-net");
  assert.equal(strengthLabel("0651").label, "Empty net 6v5");
  assert.equal(strengthLabel("1560").label, "Empty net 5v6");
  assert.equal(strengthLabel("0660").label, "Both nets empty 6v6");
  for (const bad of [null, undefined, "", "155", "15511", "abcd", "1951", "1051", "2551", 1551]) assert.equal(strengthLabel(bad, "home"), null, String(bad));
});
test("groups and importance", () => {
  assert.equal(FILTER_GROUPS.length, 9);
  assert.equal(groupOf({ type: "goal" }), "goals");
  assert.equal(groupOf({ type: "takeaway" }), "turnovers");
  assert.equal(groupOf({ type: "period-end" }), "other");
  assert.equal(groupOf({ type: "weird" }), "other");
  assert.equal(importance({ type: "goal" }), "high");
  assert.equal(importance({ type: "penalty" }), "medium");
  assert.equal(importance({ type: "shot-on-goal" }), "routine");
  for (const t of ["faceoff", "stoppage", "hit", "giveaway", "zzz"]) assert.equal(importance({ type: t }), "low");
});
test("sortPlays orders by period/order and puts missing values last", () => {
  const s = sortPlays([{ id: 1, period: 2, order: 5 }, { id: 2, period: 1, order: 9 }, { id: 3, period: 1 }, { id: 4, period: 1, order: 2 }, { id: 5 }, { id: 6, period: 1, order: 2, time: "00:10" }]);
  assert.deepEqual(s.map((p) => p.id), [6, 4, 2, 3, 1, 5]);
});
test("periods: labels, grouping, shootout, unknown", () => {
  assert.equal(periodInfo(1, "REG").label, "1st period");
  assert.equal(periodInfo(4, "OT").label, "Overtime");
  assert.equal(periodInfo(5, "OT").label, "2nd overtime");
  assert.equal(periodInfo(5, "SO").label, "Shootout");
  assert.equal(periodInfo(undefined, undefined).label, "Other events");
  const plays = [{ id: 1, period: 1, periodType: "REG" }, { id: 2, period: 4, periodType: "OT" }, { id: 3, period: 5, periodType: "SO" }, { id: 4, period: 5, periodType: "SO" }, { id: 5 }];
  const gr = groupByPeriod(plays);
  assert.deepEqual(gr.map((x) => [x.short, x.plays.length]), [["P1", 1], ["OT", 1], ["SO", 2], ["?", 1]]);
  assert.equal(periodList(plays)[2].firstId, 3);
});
test("filters by group and team incl neutral", () => {
  const plays = [g(1, "CAR"), { id: 2, type: "hit", team: "FLA" }, { id: 3, type: "period-start", team: null }, { id: 4, type: "faceoff", team: "CAR" }];
  assert.deepEqual(applyFilters(plays, {}).map((p) => p.id), [1, 2, 3, 4]);
  assert.deepEqual(applyFilters(plays, { groups: new Set(["goals", "hits"]) }).map((p) => p.id), [1, 2]);
  assert.deepEqual(applyFilters(plays, { team: "CAR" }).map((p) => p.id), [1, 4]);
  assert.deepEqual(applyFilters(plays, { team: "neutral" }).map((p) => p.id), [3]);
  assert.deepEqual(applyFilters(plays, { groups: ["goals"], team: "FLA" }), []);
  assert.deepEqual(applyFilters(null), []);
});
test("goalList uses official score, else derives and flags it", () => {
  const off = goalList([g(1, "CAR", { score: { home: 1, away: 0 } }), g(2, "FLA", { score: { home: 1, away: 1 } })], game);
  assert.deepEqual(off.map((x) => [x.n, x.score, x.derived]), [[1, { home: 1, away: 0 }, false], [2, { home: 1, away: 1 }, false]]);
  const der = goalList([g(1, "CAR"), g(2, "FLA"), g(3, "CAR")], game);
  assert.deepEqual(der.map((x) => [x.score.home, x.score.away, x.derived]), [[1, 0, true], [1, 1, true], [2, 1, true]]);
  assert.equal(goalList([g(1, "CAR", { periodType: "SO" })], game)[0].score, null);
  assert.equal(goalList([g(1, null)], game)[0].score, null);
  const v = goalList([g(1, "CAR"), g(2, "CAR"), g(3, "FLA")], game, { voided: new Set([2]) });
  assert.deepEqual(v.map((x) => [x.n, x.voided]), [[1, false], [null, true], [2, false]]);
  assert.deepEqual(v[2].score, { home: 1, away: 1 });
});
test("jumpToGoals wraps and handles none", () => {
  const plays = [{ id: 1, type: "hit" }, g(2, "CAR"), { id: 3, type: "hit" }, g(4, "FLA")];
  assert.equal(jumpToGoals(plays), 2);
  assert.equal(jumpToGoals(plays, 2), 4);
  assert.equal(jumpToGoals(plays, 4), 2);
  assert.equal(jumpToGoals(plays, 3, -1), 2);
  assert.equal(jumpToGoals(plays, 2, -1), 4);
  assert.equal(jumpToGoals(plays, 99), 2);
  assert.equal(jumpToGoals([{ id: 1, type: "hit" }]), null);
  assert.deepEqual(goalIds(plays), [2, 4]);
  assert.equal(defaultNewestFirst(true), true);
  assert.equal(defaultNewestFirst(false), false);
});
test("voided/changed optional fields and signature", () => {
  const f = eventFlags([{ id: 5 }, 6, { eventId: 7 }], undefined);
  assert.deepEqual([...f.voided], [5, 6, 7]);
  assert.equal(f.changed.size, 0);
  assert.equal(eventFlags().voided.size, 0);
  const merged = mergeVoided([g(1, "CAR"), g(3, "CAR")], [{ id: 2, order: 2, type: "goal", period: 1, team: "CAR" }, 9]);
  assert.deepEqual(merged.map((p) => p.id), [1, 2, 3]);
  assert.notEqual(playsSignature([g(1, "CAR")]), playsSignature([g(1, "CAR", { assists: [{ id: 1 }] })]));
  assert.equal(playsSignature(null), "0|||");
});
test("real raw fixture: every play labelled, grouped and sorted; nothing dropped", () => {
  const feed = normalizeGameFeed(JSON.parse(readFileSync(new URL("./fixtures/raw-live-game.json", import.meta.url))));
  assert.ok(feed.plays.length > 50);
  for (const p of feed.plays) { assert.ok(eventLabel(p).length > 0); assert.ok(importance(p)); }
  assert.equal(applyFilters(feed.plays, { groups: [] }).length, feed.plays.length);
  const sum = FILTER_GROUPS.reduce((n, k) => n + applyFilters(feed.plays, { groups: [k.key] }).length, 0);
  assert.equal(sum, feed.plays.length);
  assert.match(eventLabel(feed.plays.find((p) => p.type === "penalty")), /\(\d min\)/);
  assert.deepEqual(sortPlays(feed.plays).map((p) => p.id), feed.plays.map((p) => p.id));
});
