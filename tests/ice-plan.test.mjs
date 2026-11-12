import test from "node:test";
import assert from "node:assert/strict";
import { BLADE, FINISH_LEFT, INTERMISSION_S, PREGAME_S, RINK, icePrepActive, poseAt, route, smoothLeft, stateAt, sweptQuads } from "../src/lib/ice-plan.mjs";

const rinkCell = (x, y) => { const R = RINK.corner, ix = Math.min(x, RINK.w - x), iy = Math.min(y, RINK.h - y); return ix < R && iy < R ? Math.hypot(R - ix, R - iy) <= R - 0.3 : ix > 0.3 && iy > 0.3; };

test("the route is one connected path: no jumps, headings that change smoothly, no turn tighter than the blade's half width", () => {
  const r = route();
  let prev = poseAt(0), minRadius = Infinity, maxStep = 0;
  for (let s = 0.5; s <= r.length; s += 0.5) {
    const p = poseAt(s);
    maxStep = Math.max(maxStep, Math.hypot(p.bx - prev.bx, p.by - prev.by));
    const d = Math.abs(Math.atan2(Math.sin(p.heading - prev.heading), Math.cos(p.heading - prev.heading)));
    if (d > 1e-4) minRadius = Math.min(minRadius, 0.5 / d);
    prev = p;
  }
  assert.ok(maxStep < 0.6, `the blade never jumps (${maxStep})`);
  assert.ok(minRadius >= BLADE / 2 - 0.2, `tightest turn radius ${minRadius.toFixed(2)} ft`);
});

test("the blade covers the whole sheet: at least 99.5% of the ice, corners and boards included", () => {
  const r = route(), res = 0.5, nx = RINK.w / res, ny = RINK.h / res, cov = new Uint8Array(nx * ny);
  for (const q of sweptQuads(r.enterEnd, r.spiralEnd, 0.5)) {
    const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
    for (let gy = Math.max(0, Math.floor(Math.min(...ys) / res)); gy <= Math.min(ny - 1, Math.ceil(Math.max(...ys) / res)); gy++)
      for (let gx = Math.max(0, Math.floor(Math.min(...xs) / res)); gx <= Math.min(nx - 1, Math.ceil(Math.max(...xs) / res)); gx++) {
        const x = (gx + 0.5) * res, y = (gy + 0.5) * res; let inside = false;
        for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside; }
        if (inside) cov[gy * nx + gx] = 1;
      }
  }
  let total = 0, hit = 0;
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) { const x = (gx + 0.5) * res, y = (gy + 0.5) * res; if (!rinkCell(x, y)) continue; total++; hit += cov[gy * nx + gx]; }
  assert.ok(hit / total >= 0.995, `coverage ${(100 * hit / total).toFixed(2)}%`);
});

test("the timeline: in through the gate, steady working speed, every inch cleaned with 45 seconds left, then out through the gate", () => {
  const r = route();
  let prev = -1;
  for (let left = INTERMISSION_S; left >= 0; left -= 0.1) { const st = stateAt(left); assert.ok(st.s >= prev - 1e-9, "never backwards"); prev = st.s; }
  assert.equal(stateAt(INTERMISSION_S).phase, "enter");
  assert.equal(stateAt(INTERMISSION_S - 30).phase, "clean");
  const at45 = stateAt(FINISH_LEFT + 0.01);
  assert.equal(at45.phase, "clean"); assert.ok(Math.abs(at45.clean - r.spiralEnd) < 1, "all the ice is clean at 45 s");
  assert.equal(stateAt(FINISH_LEFT - 1).phase, "exit");
  assert.equal(stateAt(FINISH_LEFT - 1).bladeDown < 1, true, "the blade is rising as it leaves");
  assert.equal(stateAt(FINISH_LEFT - 25).phase, "gone", "off the ice well before play resumes");
  assert.ok(Math.abs(stateAt(100).s - stateAt(101).s - stateAt(500).s + stateAt(501).s) < 1e-6, "the working speed is steady");
  const gone = poseAt(stateAt(10).s); assert.ok(gone.y > RINK.h + 5, "out past the near boards");
});

test("speed is continuous at every boundary (no jerk entering, working or leaving)", () => {
  const v = (l) => (stateAt(l - 0.01).s - stateAt(l + 0.01).s) / 0.02;
  const work = v(500);
  assert.ok(Math.abs(v(INTERMISSION_S - 18) - work) < 0.15);
  assert.ok(Math.abs(v(FINISH_LEFT) - work) < 0.15);
  assert.ok(v(INTERMISSION_S - 0.5) < work, "it starts from rest at the gate");
});

test("a pregame is the same plan over 20 minutes", () => {
  assert.equal(stateAt(PREGAME_S, PREGAME_S).phase, "enter");
  assert.ok(Math.abs(stateAt(FINISH_LEFT + 0.01, PREGAME_S).clean - route().spiralEnd) < 1);
});

test("countdown corrections are absorbed without going backwards: a jump ahead is caught up at a bounded rate, a jump back changes nothing", () => {
  assert.equal(smoothLeft(null, 500, 0.016), 500);
  assert.ok(Math.abs(smoothLeft(500, 499.9, 0.1) - 499.9) < 1e-9, "normal time passing");
  const ahead = smoothLeft(500, 400, 0.1); assert.ok(ahead < 499.9 && ahead > 499.5, `bounded catch-up (${ahead})`);
  const back = smoothLeft(400, 500, 0.1); assert.ok(Math.abs(back - 399.9) < 1e-9, "never later than before");
});

test("the ice-preparation window opens 20 minutes before puck drop and closes when the feed says play started", () => {
  const start = Date.parse("2026-11-12T00:00:00Z"), g = (extra) => ({ state: "FUT", scheduleState: "OK", start: new Date(start).toISOString(), ...extra });
  assert.equal(icePrepActive(g(), start - 21 * 60_000), false);
  assert.equal(icePrepActive(g(), start - 20 * 60_000), true);
  assert.equal(icePrepActive(g({ state: "PRE" }), start - 5 * 60_000), true);
  assert.equal(icePrepActive(g(), start + 10 * 60_000), true, "a delayed start keeps the ice ready");
  assert.equal(icePrepActive(g({ state: "LIVE" }), start + 60_000), false);
  assert.equal(icePrepActive(g({ state: "FINAL" }), start), false);
  assert.equal(icePrepActive(g({ scheduleState: "PPD" }), start - 60_000), false);
  assert.equal(icePrepActive(g(), start + 4 * 3600_000), false);
  assert.equal(icePrepActive(g({ start: "nope" }), start), false);
});
