import test from "node:test";
import assert from "node:assert/strict";
import { autoDay, inRange, resolveDate, nearestDay, stepDay, stepWeek, withDateParam, searchFor } from "../src/lib/date-nav.mjs";

const days = ["2026-10-07", "2026-10-08", "2026-10-10", "2026-10-11", "2026-10-20"];

test("autoDay: today, else next game day, else last", () => {
  assert.equal(autoDay(days, "2026-10-10"), "2026-10-10");
  assert.equal(autoDay(days, "2026-10-09"), "2026-10-10");
  assert.equal(autoDay(days, "2026-12-01"), "2026-10-20");
  assert.equal(autoDay([], "2026-10-09"), "2026-10-09");
});
test("resolveDate: pick beats address beats auto; out-of-range and invalid are ignored", () => {
  const base = { days, today: "2026-10-09" };
  assert.equal(resolveDate({ ...base, picked: null, urlDate: null }), "2026-10-10");
  assert.equal(resolveDate({ ...base, picked: "2026-10-08", urlDate: "2026-10-11" }), "2026-10-08");
  assert.equal(resolveDate({ ...base, picked: null, urlDate: "2026-10-11" }), "2026-10-11");
  assert.equal(resolveDate({ ...base, picked: null, urlDate: "2026-10-09" }), "2026-10-09"); // an empty day inside the range is allowed
  assert.equal(resolveDate({ ...base, picked: null, urlDate: "2027-01-01" }), "2026-10-10");
  assert.equal(resolveDate({ ...base, picked: null, urlDate: "2026-02-30" }), "2026-10-10");
  assert.equal(resolveDate({ ...base, picked: null, urlDate: "nope" }), "2026-10-10");
});
test("resolveDate follows the auto day across the midnight rollover while nothing is picked", () => {
  assert.equal(resolveDate({ days, today: "2026-10-10", picked: null, urlDate: null }), "2026-10-10");
  assert.equal(resolveDate({ days, today: "2026-10-11", picked: null, urlDate: null }), "2026-10-11");
  assert.equal(resolveDate({ days, today: "2026-10-11", picked: "2026-10-10", urlDate: null }), "2026-10-10");
});
test("inRange", () => {
  assert.ok(inRange(days, "2026-10-09"));
  assert.ok(!inRange(days, "2026-10-06"));
  assert.ok(inRange([], "2026-10-06"));
});
test("stepDay skips empty days and clamps", () => {
  assert.equal(stepDay(days, "2026-10-08", 1), "2026-10-10");
  assert.equal(stepDay(days, "2026-10-10", -1), "2026-10-08");
  assert.equal(stepDay(days, "2026-10-07", -1), "2026-10-07");
  assert.equal(stepDay(days, "2026-10-20", 1), "2026-10-20");
  assert.equal(stepDay(days, "2026-10-07", 99), "2026-10-20");
  assert.equal(stepDay(days, "2026-10-09", 1), "2026-10-10"); // an empty day steps to the nearest game day that way
  assert.equal(stepDay(days, "2026-10-09", -1), "2026-10-08");
  assert.equal(stepDay(days, "2026-10-15", 2), "2026-10-20");
  assert.equal(stepDay(days, "2026-10-15", -2), "2026-10-10");
  assert.equal(stepDay(days, "2026-10-25", 1), "2026-10-25");
  assert.equal(stepDay([], "2026-10-09", 1), "2026-10-09");
});
test("stepWeek and nearestDay", () => {
  assert.equal(nearestDay(days, "2026-10-09"), "2026-10-10");
  assert.equal(stepWeek(days, "2026-10-08", 1), "2026-10-11"); // 10-15 is nearest to 10-11
  assert.equal(stepWeek(days, "2026-10-20", -1), "2026-10-11"); // 10-13 is nearest to 10-11
  assert.equal(stepWeek(days, "2026-10-10", -1), "2026-10-07"); // clamps to the first day
  assert.equal(stepWeek(days, "2026-10-20", 1), "2026-10-20");
});
test("address helpers keep other params and only carry the date where it means something", () => {
  assert.equal(withDateParam("?view=games", "2026-10-10"), "?view=games&date=2026-10-10");
  assert.equal(withDateParam("?view=games&date=2026-10-10", null), "?view=games");
  assert.equal(withDateParam("", null), "");
  assert.equal(searchFor("scoreboard", null), "");
  assert.equal(searchFor("scoreboard", "2026-10-10"), "?date=2026-10-10");
  assert.equal(searchFor("games", "2026-10-10"), "?view=games&date=2026-10-10");
  assert.equal(searchFor("standings", "2026-10-10"), "?view=standings");
  assert.equal(searchFor("games", "garbage"), "?view=games");
});
