import test from "node:test";
import assert from "node:assert/strict";
import { INTERMISSION_MS, ROUTE_MS, zamboniPose, clockText, intermissionLeft, parseClock, resurfacePath } from "../src/lib/intermission.mjs";

test("an intermission is 17 minutes", () => assert.equal(INTERMISSION_MS, 17 * 60_000));
test("the feed's clock is read as minutes and seconds", () => {
  assert.equal(parseClock("13:48"), 828);
  assert.equal(parseClock("17:00"), 1020);
  assert.equal(parseClock(null), null);
  assert.equal(parseClock("Updating"), null);
  assert.equal(clockText(828), "13:48");
  assert.equal(clockText(-3), "0:00");
});
test("the countdown runs on from the last reading between polls and never goes below zero", () => {
  const at = 1_000_000;
  assert.equal(intermissionLeft({ base: 828, at, seenAt: at, now: at }), 828);
  assert.equal(intermissionLeft({ base: 828, at, seenAt: at, now: at + 30_000 }), 798);
  assert.equal(intermissionLeft({ base: 5, at, seenAt: at, now: at + 60_000 }), 0);
});
test("with no clock in the feed it counts 17 minutes from when the intermission was first seen", () => {
  const t = 5_000_000;
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t }), 1020);
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t + 60_000 }), 960);
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t + 20 * 60_000 }), 0);
});
test("the Zamboni's route stays on the ice: two laps and a pass down the middle", () => {
  const d = resurfacePath();
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 200));
  assert.equal((d.match(/M/g) ?? []).length, 1);
  assert.ok(d.endsWith("H172"));
});
test("the Zamboni faces the way it drives, and the fresh ice grows with its progress", () => {
  assert.equal(ROUTE_MS, 42_000);
  const east = zamboniPose({ x: 10, y: 5 }, { x: 11, y: 5 }, 0);
  assert.equal(east.deg, 0);
  assert.equal(east.fresh, 100); // nothing laid yet
  const south = zamboniPose({ x: 10, y: 5 }, { x: 10, y: 6 }, 0.5);
  assert.equal(south.deg, 90);
  assert.equal(south.fresh, 50);
  assert.equal(zamboniPose({ x: 0, y: 0 }, { x: 1, y: 0 }, 1).fresh, 0);
});
