import test from "node:test";
import assert from "node:assert/strict";
import { FINISH_S, INTERMISSION_MS, resurfaceProgress, zamboniColors, zamboniPose, clockText, intermissionLeft, parseClock, resurfacePath } from "../src/lib/intermission.mjs";

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
test("the Zamboni's route stays on the ice: four laps, each inside the last", () => {
  const d = resurfacePath();
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 200));
  assert.equal((d.match(/M/g) ?? []).length, 1);
  assert.equal((d.match(/H/g) ?? []).length, 8); // two straights per lap
  assert.ok(d.includes("L")); // joined lap to lap
});
test("the Zamboni is paced to the clock: it starts with the intermission and finishes with 10 seconds left", () => {
  assert.equal(FINISH_S, 10);
  assert.equal(resurfaceProgress(1020), 0);
  assert.equal(resurfaceProgress(10), 1);
  assert.equal(resurfaceProgress(0), 1);
  assert.ok(Math.abs(resurfaceProgress(515) - 0.5) < 0.001);
  assert.equal(resurfaceProgress(2000), 0);
  // Always moving forward as the clock runs down.
  let last = -1;
  for (let left = 1020; left >= 0; left -= 15) {
    const p = resurfaceProgress(left);
    assert.ok(p >= last);
    last = p;
  }
});
test("the Zamboni wears the home team's colors, lifted when the color is too dark to show on ice", () => {
  assert.equal(zamboniColors("#c8102e").body, "#c8102e");
  const navy = zamboniColors("#041e42");
  assert.notEqual(navy.body, "#041e42");
  assert.ok(parseInt(navy.body.slice(1, 3), 16) > 0x04);
  assert.equal(zamboniColors(null).body, "#e6ae2f"); // no color: the stock gold
  for (const c of ["#c8102e", "#041e42", "#fcb514"]) for (const v of Object.values(zamboniColors(c))) assert.match(v, /^#[0-9a-f]{6}$/);
});
test("the Zamboni faces the way it drives, and the fresh ice grows with its progress", () => {
  const east = zamboniPose({ x: 10, y: 5 }, { x: 11, y: 5 }, 0);
  assert.equal(east.deg, 0);
  assert.equal(east.fresh, 100);
  const south = zamboniPose({ x: 10, y: 5 }, { x: 10, y: 6 }, 0.5);
  assert.equal(south.deg, 90);
  assert.equal(south.fresh, 50);
  assert.equal(zamboniPose({ x: 0, y: 0 }, { x: 1, y: 0 }, 1).fresh, 0);
});
