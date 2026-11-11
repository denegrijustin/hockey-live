import test from "node:test";
import assert from "node:assert/strict";
import { phaseOf, transition, pollPlan, staleAfter, STALE_LIVE_MS, PHASES, clockSeconds } from "../src/lib/game-state.mjs";
import { isLive, isFreshLive, isCalledOff, normalizeScoreboard } from "../src/lib/game-data.mjs";
import { gameStatus } from "../src/lib/game-status.mjs";

const NOW = Date.parse("2026-11-10T03:00:00Z");
const START = "2026-11-10T00:00:00Z"; // 3 h before NOW
const g = (o) => ({ id: 1, away: "MTL", home: "NYR", start: START, state: "LIVE", scheduleState: "OK", period: 2, periodType: "REG", clock: "12:31", intermission: false, ...o });
const phase = (o) => phaseOf(g(o), { now: NOW }).phase;

test("every phase is reachable and labelled", () => {
  const cases = {
    scheduled: { state: "FUT", period: null, periodType: null, clock: null },
    pregame: { state: "PRE", period: null, periodType: null, clock: null },
    live: {},
    "live-crit": { state: "CRIT", clock: "00:42" },
    intermission: { intermission: true, clock: "17:10" },
    overtime: { period: 4, periodType: "OT", clock: "03:10" },
    shootout: { period: 5, periodType: "SO", clock: null },
    final: { state: "OFF", end: "REG", periodType: "REG", period: 3 },
    "final-ot": { state: "OFF", end: "OT", period: 4, periodType: "OT" },
    "final-so": { state: "FINAL", end: "SO", period: 5, periodType: "SO" },
    postponed: { state: "FUT", scheduleState: "PPD" },
    suspended: { state: "FUT", scheduleState: "SUSP" },
    cancelled: { state: "FUT", scheduleState: "CNCL" },
  };
  const seen = new Set();
  for (const [name, o] of Object.entries(cases)) {
    const info = phaseOf(g(o), { now: NOW });
    const want = name === "live-crit" ? "live" : name;
    assert.equal(info.phase, want, name);
    assert.ok(info.label.length > 0);
    seen.add(info.phase);
  }
  assert.deepEqual([...seen].sort(), [...PHASES].sort());
});

test("flags: live covers live, intermission, overtime and shootout; final covers the three finals", () => {
  const flags = (o) => { const i = phaseOf(g(o), { now: NOW }); return [i.live, i.final]; };
  assert.deepEqual(flags({}), [true, false]);
  assert.deepEqual(flags({ intermission: true }), [true, false]);
  assert.deepEqual(flags({ periodType: "OT" }), [true, false]);
  assert.deepEqual(flags({ periodType: "SO" }), [true, false]);
  assert.deepEqual(flags({ state: "OFF", end: "OT" }), [false, true]);
  assert.deepEqual(flags({ state: "FUT" }), [false, false]);
  assert.deepEqual(flags({ state: "FUT", scheduleState: "PPD" }), [false, false]);
});

test("a game feed without gameOutcome still reads as final/OT or final/SO from the last period (end is REG there)", () => {
  assert.equal(phase({ state: "OFF", end: "REG", periodType: "OT" }), "final-ot");
  assert.equal(phase({ state: "OFF", end: undefined, periodType: "SO" }), "final-so");
  assert.equal(phase({ state: "OFF", end: "REG", periodType: "REG" }), "final");
});

test("a live game is never read as called off, and a finished game keeps its result whatever the schedule state says", () => {
  assert.equal(phase({ scheduleState: "SUSP" }), "live");
  assert.equal(phase({ state: "OFF", scheduleState: "PPD", end: "REG" }), "final");
});

test("there is no delayed phase: a game past its start still FUT/PRE stays scheduled/pregame", () => {
  assert.equal(phase({ state: "FUT", start: "2026-11-09T00:00:00Z" }), "scheduled");
  assert.equal(phase({ state: "PRE", start: "2026-11-09T00:00:00Z" }), "pregame");
  assert.ok(!PHASES.includes("delayed"));
});

test("clock: remaining from the NHL seconds field, else parsed from mm:ss; running only when the feed says", () => {
  assert.deepEqual(phaseOf(g({ clockSeconds: 692, clockRunning: false, intermission: true }), { now: NOW }).clock, { period: 2, periodType: "REG", remaining: 692, running: false, intermission: true });
  assert.equal(phaseOf(g({ clock: "12:31" }), { now: NOW }).clock.remaining, 751);
  assert.equal(phaseOf(g({ clock: "12:31" }), { now: NOW }).clock.running, null);
  assert.equal(phaseOf(g({ running: true, secondsRemaining: 5 }), { now: NOW }).clock.running, true);
  assert.equal(phaseOf(g({ state: "FUT", clock: "20:00" }), { now: NOW }).clock.remaining, null);
  assert.equal(phaseOf(g({ clock: "garbage" }), { now: NOW }).clock.remaining, null);
  assert.equal(clockSeconds("00:00"), 0);
});

test("stale: live more than 8 hours after puck drop, never for other phases", () => {
  const late = Date.parse(START) + STALE_LIVE_MS;
  const stale = phaseOf(g({}), { now: late + 1 });
  assert.equal(stale.stale, true);
  assert.equal(stale.phase, "live");
  assert.match(stale.reason, /8 hours/);
  assert.equal(phaseOf(g({}), { now: late - 1 }).stale, false);
  assert.equal(phaseOf(g({ state: "OFF", end: "REG" }), { now: late + 1 }).stale, false);
  assert.equal(phaseOf(g({ start: undefined }), { now: late + 1 }).stale, false);
  assert.equal(phaseOf(g({ intermission: true }), { now: late + 1 }).stale, true);
});

test("transition: phase changes only; first observation and no-change are null", () => {
  const p = (o) => phaseOf(g(o), { now: NOW });
  assert.equal(transition(null, p({})), null);
  assert.equal(transition(p({}), p({ clock: "10:00" })), null);
  assert.deepEqual(transition(p({ state: "FUT" }), p({ state: "PRE" })), { from: "scheduled", to: "pregame" });
  assert.deepEqual(transition(p({ state: "PRE" }), p({})), { from: "pregame", to: "live" });
  assert.deepEqual(transition(p({}), p({ intermission: true })), { from: "live", to: "intermission" });
  assert.deepEqual(transition(p({ intermission: true }), p({ period: 4, periodType: "OT" })), { from: "intermission", to: "overtime" });
  assert.deepEqual(transition(p({ periodType: "OT" }), p({ periodType: "SO" })), { from: "overtime", to: "shootout" });
  assert.deepEqual(transition(p({ periodType: "OT" }), p({ state: "OFF", periodType: "OT" })), { from: "overtime", to: "final-ot" });
  assert.deepEqual(transition(p({ periodType: "SO" }), p({ state: "OFF", end: "SO" })), { from: "shootout", to: "final-so" });
  assert.deepEqual(transition(p({}), p({ state: "OFF", end: "REG", periodType: "REG" })), { from: "live", to: "final" });
  assert.deepEqual(transition(p({ state: "FUT" }), p({ state: "FUT", scheduleState: "PPD" })), { from: "scheduled", to: "postponed" });
  // accepts bare names and raw games too
  assert.deepEqual(transition("live", "final"), { from: "live", to: "final" });
  assert.deepEqual(transition(g({}), g({ intermission: true })), { from: "live", to: "intermission" });
  assert.equal(transition(undefined, undefined), null);
});

test("pollPlan: 15 s live, 30 s intermission, pregame 30 s within 30 min else 60 s, final one recheck, called off once", () => {
  const plan = (o, now = NOW) => pollPlan(phaseOf(g(o), { now }), g(o), { now });
  assert.deepEqual(plan({}), { every: 15000, recheck: 0, expected: 15000 });
  assert.equal(plan({ periodType: "OT" }).every, 15000);
  assert.equal(plan({ periodType: "SO" }).every, 15000);
  assert.equal(plan({ intermission: true }).every, 30000);
  const soon = { state: "PRE", start: new Date(NOW + 20 * 60_000).toISOString() };
  const far = { state: "FUT", start: new Date(NOW + 3 * 3600_000).toISOString() };
  assert.equal(plan(soon).every, 30000);
  assert.equal(plan({ ...soon, start: new Date(NOW + 30 * 60_000).toISOString() }).every, 30000);
  assert.equal(plan({ ...soon, start: new Date(NOW + 31 * 60_000).toISOString() }).every, 60000);
  assert.equal(plan(far).every, 60000);
  assert.equal(plan({ state: "PRE", start: new Date(NOW - 5 * 60_000).toISOString() }).every, 30000); // past puck drop, still not live
  assert.deepEqual(plan({ state: "OFF", end: "REG" }), { every: 0, recheck: 180000, expected: 0 });
  assert.deepEqual(plan({ state: "FUT", scheduleState: "PPD" }), { every: 0, recheck: 0, expected: 0 });
});

test("staleAfter: twice the expected interval, at least 45 s, 0 when age says nothing", () => {
  assert.equal(staleAfter(15000), 45000);
  assert.equal(staleAfter(30000), 60000);
  assert.equal(staleAfter(60000), 120000);
  assert.equal(staleAfter(0), 0);
});

test("legacy helpers behave as before, now implemented on phaseOf", () => {
  const late = Date.parse(START) + STALE_LIVE_MS + 1;
  assert.equal(isLive(g({})), true);
  assert.equal(isLive(g({ state: "CRIT" })), true);
  assert.equal(isLive(g({ intermission: true })), true);
  assert.equal(isLive(g({ state: "FUT" })), false);
  assert.equal(isFreshLive(g({}), NOW), true);
  assert.equal(isFreshLive(g({}), late), false);
  assert.equal(isCalledOff(g({ state: "FUT", scheduleState: "ppd" })), true);
  assert.equal(isCalledOff(g({ state: "LIVE", scheduleState: "PPD" })), false);
  assert.equal(gameStatus(g({ state: "OFF", end: "OT" }), { now: NOW }).label, "Final/OT");
  assert.equal(gameStatus(g({ state: "OFF", end: "SO", awayScore: 2, homeScore: 3 }), { now: NOW }).short, "F/SO");
  assert.equal(gameStatus(g({ state: "OFF", end: "REG", periodType: "OT" }), { now: NOW }).short, "F/OT");
  assert.equal(gameStatus(g({}), { now: late }).label, "Updating");
  assert.equal(gameStatus(g({ state: "FUT", scheduleState: "CNCL" }), { now: NOW }).label, "Canceled");
});

test("normalizeScoreboard keeps the NHL clock state (running, secondsRemaining)", () => {
  const raw = { currentDate: "2026-11-10", games: [{ id: 2026020300, season: 20262027, gameType: 2, gameState: "LIVE", startTimeUTC: START, homeTeam: { abbrev: "NYR", score: 1 }, awayTeam: { abbrev: "MTL", score: 2 }, periodDescriptor: { number: 2, periodType: "REG" }, clock: { timeRemaining: "12:31", secondsRemaining: 751, running: true, inIntermission: false } }] };
  const row = normalizeScoreboard(raw).games[0];
  assert.equal(row.clockRunning, true);
  assert.equal(row.clockSeconds, 751);
  assert.equal(phaseOf(row, { now: NOW }).clock.remaining, 751);
});
