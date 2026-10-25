import test from "node:test";
import assert from "node:assert/strict";
import { EXIT_PATH, EXIT_S, FINISH_S, INTERMISSION_MS, exitProgress, resurfaceProgress, zamboniColors, zamboniPose, clockText, intermissionLeft, parseClock, resurfacePath, resurfacingMotion } from "../src/lib/intermission.mjs";

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
test("the Zamboni's route stays on the ice: six passes with continuous rounded turns", () => {
  const d = resurfacePath();
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 200));
  assert.equal((d.match(/M/g) ?? []).length, 1);
  assert.equal((d.match(/H/g) ?? []).length, 6); // six parallel passes
  assert.equal((d.match(/C/g) ?? []).length, 10); // two tangent curves per U-turn
  assert.ok(!d.includes("L")); // no diagonal lap joins
});
test("the Zamboni is paced to the clock: laps from the start, off the ice with 10 seconds left", () => {
  assert.equal(FINISH_S, 10);
  assert.equal(EXIT_S, 8);
  assert.equal(resurfaceProgress(1020), 0);
  assert.equal(resurfaceProgress(18), 1); // the last lap is done as it heads for the gate
  assert.equal(resurfaceProgress(0), 1);
  assert.equal(resurfaceProgress(2000), 0);
  assert.equal(exitProgress(40), 0); // still lapping
  assert.equal(exitProgress(18), 0);
  assert.equal(exitProgress(14), 0.5);
  assert.equal(exitProgress(10), 1); // gone
  assert.equal(exitProgress(0), 1);
  let last = -1, lastExit = -1;
  for (let left = 1020; left >= 0; left -= 3) {
    const p = resurfaceProgress(left), q = exitProgress(left);
    assert.ok(p >= last && q >= lastExit);
    [last, lastExit] = [p, q];
  }
  // The exit runs off the left edge of the rink.
  const xs = EXIT_PATH.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.min(...xs) < -15);
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

test("straight motion is constant-speed and paint ends at the rear blade", () => {
  const motion = resurfacingMotion(s => ({ x:s, y:20 }), 100);
  for (const p of [0, .25, .5, .75, 1]) {
    const pose = motion.at(p);
    assert.ok(Math.abs(pose.x - p*100) < 1e-8);
    assert.equal(pose.deg, 0);
    assert.ok(Math.abs(pose.fresh - 100*(1-p)) < 1e-8);
  }
  assert.ok(motion.trail.startsWith("M-10.000 20.000"));
  assert.ok(motion.trail.endsWith("L90.000 20.000"));
});
test("heading unwraps continuously through the west-facing angle", () => {
  const motion = resurfacingMotion(s => ({ x:50+20*Math.cos(s/20), y:40+20*Math.sin(s/20) }), 60);
  let previous = motion.at(0).deg;
  for (let i=1;i<=100;i++) {
    const pose=motion.at(i/100);
    assert.ok(Math.abs(pose.deg-previous)<3);
    previous=pose.deg;
  }
});
