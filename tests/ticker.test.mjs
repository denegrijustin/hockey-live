import test from "node:test";
import assert from "node:assert/strict";
import { tickerSlate, tickerStatus } from "../src/lib/ticker.mjs";

const g = (id, date, hour, state, extra = {}) => ({ id, date, start: `${date}T${String(hour).padStart(2, "0")}:00:00Z`, state, scheduleState: "OK", end: "REG", ...extra });

test("status text says final, final in overtime, live with period and clock, intermission, or the start time", () => {
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "FINAL")), "FINAL");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "OFF", { end: "OT" })), "FINAL / OT");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "FINAL", { end: "SO" })), "FINAL / SO");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "LIVE", { period: 2, clock: "12:31" })), "LIVE P2 12:31");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "LIVE", { period: 4, periodType: "OT", clock: "03:10" })), "LIVE OT 03:10");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "CRIT", { period: 3, clock: "00:45" })), "LIVE P3 00:45");
  assert.equal(tickerStatus(g(1, "2026-10-10", 23, "LIVE", { period: 1, intermission: true })), "INT 1");
  assert.match(tickerStatus(g(1, "2026-10-10", 23, "FUT")), /^\d{1,2}:\d{2}\s?(AM|PM)$/);
});

test("the day's slate lists live games first, then upcoming in start order, then finals latest first", () => {
  const games = [
    g(1, "2026-10-10", 18, "FINAL"),
    g(2, "2026-10-10", 23, "FUT"),
    g(3, "2026-10-10", 20, "LIVE", { period: 1, clock: "10:00" }),
    g(4, "2026-10-10", 17, "FINAL"),
    g(5, "2026-10-10", 21, "FUT"),
    g(6, "2026-10-11", 18, "FUT"),
    g(7, "2026-10-09", 18, "FINAL"),
  ];
  const { date, items } = tickerSlate(games, "2026-10-10");
  assert.equal(date, "2026-10-10");
  assert.deepEqual(items.map((x) => x.id), [3, 5, 2, 1, 4]);
});

test("a day with no games shows the next day that has some, and nothing when there are none", () => {
  const games = [g(1, "2026-10-09", 18, "FINAL"), g(2, "2026-10-12", 19, "FUT"), g(3, "2026-10-12", 17, "FUT"), g(4, "2026-10-13", 18, "FUT")];
  const next = tickerSlate(games, "2026-10-10");
  assert.equal(next.date, "2026-10-12");
  assert.deepEqual(next.items.map((x) => x.id), [3, 2]);
  assert.deepEqual(tickerSlate(games, "2026-10-14"), { date: "2026-10-14", items: [] });
});
