import test from "node:test";
import assert from "node:assert/strict";
import { isDay, etDay, shiftDay, dayDiff, relativeDay } from "../src/lib/dates.mjs";
import { gameStatus, STALE_LIVE_MS } from "../src/lib/game-status.mjs";

test("isDay accepts real calendar days only", () => {
  assert.ok(isDay("2026-11-10")); assert.ok(isDay("2028-02-29"));
  for (const bad of ["2026-02-30", "2026-13-01", "20261110", "", null, "2026-1-1"]) assert.ok(!isDay(bad), String(bad));
});
test("the Eastern day follows Eastern midnight, not the viewer's", () => {
  assert.equal(etDay("2026-11-10T04:30:00Z"), "2026-11-09"); // 11:30 pm Eastern on the 9th
  assert.equal(etDay("2026-11-10T05:30:00Z"), "2026-11-10"); // 12:30 am Eastern
  assert.equal(etDay("2026-07-01T03:59:00Z"), "2026-06-30"); // daylight time: midnight is 04:00Z
});
test("shiftDay and dayDiff are pure calendar arithmetic, across DST and month ends", () => {
  assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDay("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(dayDiff("2026-11-01", "2026-11-10"), 9);
  assert.equal(dayDiff("2026-11-10", "2026-11-01"), -9);
});
test("relativeDay names today, tomorrow and yesterday", () => {
  assert.equal(relativeDay("2026-11-10", "2026-11-10"), "Today");
  assert.equal(relativeDay("2026-11-11", "2026-11-10"), "Tomorrow");
  assert.equal(relativeDay("2026-11-09", "2026-11-10"), "Yesterday");
  assert.match(relativeDay("2026-11-14", "2026-11-10"), /Sat, Nov 14/);
});

const g = (o) => ({ id: 1, away: "BOS", home: "TOR", start: "2026-11-10T00:00:00Z", state: "FUT", scheduleState: "OK", awayScore: null, homeScore: null, ...o });
test("an upcoming game says its local start time", () => {
  const s = gameStatus(g({ start: "2026-11-10T00:30:00Z" }));
  assert.equal(s.kind, "upcoming"); assert.ok(s.upcoming); assert.match(s.label, /\d{1,2}:\d{2} (AM|PM)/);
});
test("live, intermission, overtime and shootout read correctly", () => {
  const live = gameStatus(g({ state: "LIVE", period: 2, periodType: "REG", clock: "12:31", awayScore: 1, homeScore: 0 }), { now: Date.parse("2026-11-10T01:30:00Z") });
  assert.equal(live.kind, "live"); assert.equal(live.label, "P2 · 12:31"); assert.match(live.aria, /BOS 1, TOR 0, live, period 2, 12:31 left/);
  const int = gameStatus(g({ state: "LIVE", period: 1, periodType: "REG", intermission: true, awayScore: 0, homeScore: 0 }), { now: Date.parse("2026-11-10T00:50:00Z") });
  assert.equal(int.kind, "intermission"); assert.equal(int.label, "P1 · Intermission");
  assert.equal(gameStatus(g({ state: "LIVE", period: 4, periodType: "OT", clock: "03:12", awayScore: 2, homeScore: 2 }), { now: Date.parse("2026-11-10T03:00:00Z") }).label, "OT · 3:12".replace("3:12", "03:12"));
  assert.equal(gameStatus(g({ state: "LIVE", period: 5, periodType: "SO", awayScore: 2, homeScore: 2 }), { now: Date.parse("2026-11-10T03:30:00Z") }).label, "SO");
});
test("a LIVE game long past puck drop is flagged stale, not shown as in progress", () => {
  const s = gameStatus(g({ state: "LIVE", period: 3, clock: "02:00" }), { now: Date.parse("2026-11-10T00:00:00Z") + STALE_LIVE_MS + 60_000 });
  assert.ok(s.stale); assert.equal(s.label, "Updating");
});
test("finals name overtime and shootout; postponed, canceled and suspended games are not upcoming", () => {
  assert.equal(gameStatus(g({ state: "FINAL", end: "REG", awayScore: 1, homeScore: 3 })).label, "Final");
  assert.equal(gameStatus(g({ state: "OFF", end: "OT", awayScore: 3, homeScore: 2 })).label, "Final/OT");
  assert.equal(gameStatus(g({ state: "FINAL", end: "SO", awayScore: 3, homeScore: 2 })).short, "F/SO");
  for (const [s, kind] of [["PPD", "postponed"], ["CNCL", "cancelled"], ["SUSP", "suspended"]]) {
    const st = gameStatus(g({ scheduleState: s })); assert.equal(st.kind, kind); assert.ok(!st.upcoming);
  }
});
