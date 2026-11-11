import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeScores, isUpcoming, isCalledOff, isFreshLive, byStartThenId } from "../src/lib/game-data.mjs";
import { gameStatus } from "../src/lib/game-status.mjs";
import { blankStandings, playoffChances } from "../src/lib/model.mjs";
import { simulatePlayoffs } from "../src/lib/playoff-sim.mjs";

const g = (o) => ({ id: 1, type: 2, state: "FUT", scheduleState: "OK", start: "2026-11-10T00:00:00Z", date: "2026-11-09", home: "EDM", away: "CGY", homeScore: null, awayScore: null, ...o });

test("mergeScores carries scheduleState, start and date changes", () => {
  const before = [g({})];
  const out = mergeScores(before, { games: [g({ scheduleState: "PPD", start: "2026-11-12T00:00:00Z", date: "2026-11-11" })] });
  assert.notEqual(out, before);
  assert.equal(out[0].scheduleState, "PPD");
  assert.equal(out[0].start, "2026-11-12T00:00:00Z");
  assert.equal(out[0].date, "2026-11-11");
  assert.equal(mergeScores(before, { games: [g({})] }), before, "no change keeps the reference");
});

test("isUpcoming agrees with gameStatus().upcoming for every kind of game", () => {
  const cases = [g({}), g({ state: "LIVE" }), g({ state: "CRIT" }), g({ state: "OFF" }), g({ state: "FINAL" }),
    g({ scheduleState: "PPD" }), g({ scheduleState: "CNCL" }), g({ scheduleState: "SUSP" }), g({ state: "LIVE", scheduleState: "PPD" }), g({ state: "OFF", scheduleState: "PPD" })];
  for (const c of cases) assert.equal(isUpcoming(c), gameStatus(c).upcoming, JSON.stringify([c.state, c.scheduleState]));
  assert.equal(isCalledOff(g({ scheduleState: "ppd" })), true);
  assert.equal(isCalledOff(g({})), false);
});

test("a live game stuck more than 8 hours past puck drop is not fresh", () => {
  const start = "2026-11-10T00:00:00Z", t = Date.parse(start);
  assert.equal(isFreshLive(g({ state: "LIVE", start }), t + 3 * 3600_000), true);
  assert.equal(isFreshLive(g({ state: "LIVE", start }), t + 9 * 3600_000), false);
  assert.equal(isFreshLive(g({ state: "FUT", start }), t), false);
});

test("byStartThenId breaks identical start times by id", () => {
  const rows = [g({ id: 3 }), g({ id: 1 }), g({ id: 2, start: "2026-11-09T00:00:00Z" })];
  assert.deepEqual(rows.sort(byStartThenId).map((x) => x.id), [2, 1, 3]);
});

const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
test("postponed and canceled games do not count as remaining in the model or the simulator", () => {
  const [a, b] = teams.filter((t) => t.conference === "W");
  const sched = (extra) => [{ id: 1, type: 2, state: "FUT", scheduleState: "OK", start: "2026-11-10T00:00:00Z", home: a.id, away: b.id }, ...extra];
  const called = { id: 2, type: 2, state: "FUT", scheduleState: "PPD", start: "2026-11-11T00:00:00Z", home: a.id, away: b.id };
  const table = blankStandings(teams);
  const base = playoffChances(table, sched([]), teams)[a.id].chance;
  const rem = (games) => playoffChances(table, games, teams);
  assert.equal(rem(sched([called]))[a.id].chance, base, "model ignores a postponed game");
  assert.equal(rem(sched([{ ...called, scheduleState: "CNCL" }]))[a.id].chance, base);
  assert.equal(simulatePlayoffs({ games: sched([]), teams, table, sims: 50 }).remainingGames, 1);
  assert.equal(simulatePlayoffs({ games: sched([called]), teams, table, sims: 50 }).remainingGames, 1);
  assert.equal(simulatePlayoffs({ games: sched([{ ...called, scheduleState: "OK" }]), teams, table, sims: 50 }).remainingGames, 2);
});
