import test from "node:test";
import assert from "node:assert/strict";
import { heatGrid, hotZones, iceTiltReading, zoneName, COLS } from "../src/lib/heat-ice.mjs";

const shot = (id, team, x, y, period, time, type = "shot-on-goal") => ({ id, type, team, x, y, period, periodType: "REG", time });
const base = { home: "TOR", away: "BOS", type: 2, state: "FINAL", period: 3, periodType: "REG", clock: "00:00" };

test("zones are named by where they are in front of the net", () => {
  assert.equal(zoneName(80, 5), "the slot");
  assert.equal(zoneName(30, 0), "the point");
  assert.equal(zoneName(70, 30), "the circles");
  assert.equal(zoneName(65, 10), "the high slot");
});

test("heat sits where the attempts were: the home team's at the right net, the away team's at the left, whichever end they really attacked", () => {
  const game = { ...base, plays: [shot(1, "TOR", 80, 4, 1, "05:00"), shot(2, "TOR", -82, -3, 2, "05:00"), shot(3, "BOS", -80, 2, 1, "10:00"), shot(4, "BOS", 85, 0, 3, "10:00")] };
  const g = heatGrid(game);
  assert.equal(g.shots, 4);
  const sum = (cells, test) => cells.reduce((s, v, i) => s + (test(((i % COLS) + 0.5) * 5 - 100) ? v : 0), 0);
  assert.ok(sum(g.home, (x) => x > 0) > 0 && sum(g.home, (x) => x < 0) === 0); // TOR: all at the right net
  assert.ok(sum(g.away, (x) => x < 0) > 0 && sum(g.away, (x) => x > 0) === 0); // BOS: all at the left net
  const z = hotZones(g, game);
  assert.equal(z.home.zone, "the slot");
  assert.equal(z.away.zone, "the slot");
});

test("while a game is on, older attempts cool: the map shows where it is hot now", () => {
  const live = { ...base, state: "LIVE", period: 3, clock: "10:00", plays: [shot(1, "TOR", 80, 30, 1, "02:00"), shot(2, "TOR", 40, 0, 3, "08:00")] }; // 3rd, 10:00 left: minute 50
  const g = heatGrid(live);
  const z = hotZones(g, live);
  assert.equal(z.home.zone, "the point"); // the recent one, not the early slot-side attempt
  const done = heatGrid({ ...live, state: "FINAL", clock: "00:00" });
  const heat = (grid, x, y) => grid.home[Math.floor((y + 42.5) / 5) * COLS + Math.floor((x + 100) / 5)];
  assert.ok(heat(done, 80, 30) > heat(g, 80, 30)); // a finished game does not cool
});

test("tilt: whose attempts dominate the last ten minutes, and who is gaining", () => {
  const plays = [];
  // minutes 30-40: BOS 6, TOR 2 (the ten minutes before); minutes 40-50: TOR 6, BOS 1.
  for (let i = 0; i < 6; i++) plays.push(shot(100 + i, "BOS", -70, i, 2, `${10 + i}:00`)); // period 2: minutes 30-39
  for (let i = 0; i < 2; i++) plays.push(shot(110 + i, "TOR", 70, i, 2, `${12 + i}:00`));
  for (let i = 0; i < 6; i++) plays.push(shot(120 + i, "TOR", 70, i, 3, `0${1 + i}:00`)); // period 3 minutes 41-46
  plays.push(shot(130, "BOS", -70, 0, 3, "05:00"));
  const live = { ...base, state: "LIVE", period: 3, clock: "10:00", plays };
  const t = iceTiltReading(live);
  assert.equal(t.team, "TOR");
  assert.equal(t.pct, 86);
  assert.equal(t.minutes, 10);
  assert.equal(t.gaining.team, "TOR");
  assert.ok(t.gaining.points >= 50);
  assert.equal(iceTiltReading({ ...live, plays: plays.slice(0, 2) }), null); // too few attempts to say
  const even = iceTiltReading({ ...base, plays: [shot(1, "TOR", 70, 0, 1, "01:00"), shot(2, "BOS", -70, 0, 1, "02:00"), shot(3, "TOR", 70, 0, 2, "01:00"), shot(4, "BOS", -70, 0, 2, "02:00")] });
  assert.equal(even.team, null);
  assert.equal(even.live, false);
  assert.equal(even.gaining, null);
});
