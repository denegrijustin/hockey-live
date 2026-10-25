import test from "node:test";
import assert from "node:assert/strict";
import { lastNightDate, finalsOn, gameScore, nightsOf, bestAndWorst, goalieOfTheNight, lineOf } from "../src/lib/last-night.mjs";

const g = (id, date, state = "FINAL", hs = 3, as = 2, end = "REG", start = `${date}T23:00:00Z`) => ({ id, type: 2, date, state, homeScore: hs, awayScore: as, end, start, home: "TOR", away: "BOS" });
const now = Date.parse("2026-10-25T15:00:00Z"); // 11 a.m. Eastern on the 25th

test("last night is the latest day before today with finished games", () => {
  const games = [g(1, "2026-10-23"), g(2, "2026-10-24"), g(3, "2026-10-24"), g(4, "2026-10-25", "FUT", null, null), g(5, "2026-10-26", "FUT", null, null)];
  assert.equal(lastNightDate(games, now), "2026-10-24");
  assert.equal(lastNightDate([g(4, "2026-10-25")], now), null); // today's games are not last night
  assert.equal(lastNightDate([], now), null);
});

test("finals come in start order and carry the overtime tag", () => {
  const games = [g(2, "2026-10-24", "FINAL", 2, 3, "OT", "2026-10-25T02:00:00Z"), g(1, "2026-10-24", "FINAL", 1, 4, "REG", "2026-10-24T23:00:00Z"), g(3, "2026-10-24", "LIVE", 0, 0)];
  const f = finalsOn(games, "2026-10-24");
  assert.deepEqual(f.map((x) => x.id), [1, 2]);
  assert.equal(f[1].end, "OT");
  assert.equal(f[0].end, "");
});

test("a game score rewards goals and assists most, charges penalties, and keeps its parts", () => {
  const star = gameScore({ goals: 2, assists: 1, shots: 5, plusMinus: 2, pim: 0, hits: 1 });
  const dud = gameScore({ goals: 0, assists: 0, shots: 0, plusMinus: -3, pim: 2, giveaways: 2 });
  assert.ok(star.total > 2.5);
  assert.ok(dud.total < -0.5);
  assert.ok(Math.abs(star.total - Object.values(star.parts).reduce((s, v) => s + v, 0)) < 1e-9);
  assert.ok(dud.parts.penalties < 0 && dud.parts.onIce < 0 && star.parts.points > star.parts.onIce);
});

test("nights skip goalies and players with almost no ice time; best and worst come from the ends", () => {
  const sk = (id, o) => ({ id, name: `P${id}`, team: "TOR", position: "C", toi: "15:00", goals: 0, assists: 0, shots: 0, plusMinus: 0, pim: 0, ...o });
  const box = { id: 9, players: [sk(1, { goals: 2 }), sk(2, { plusMinus: -3 }), sk(3, {}), sk(4, { goals: 5, toi: "02:00" }), { ...sk(5, { goals: 3 }), position: "G" }] };
  const nights = nightsOf([box]);
  assert.deepEqual(nights.map((n) => n.id), [1, 3, 2]);
  const { best, worst } = bestAndWorst(nights, 1);
  assert.equal(best[0].id, 1);
  assert.equal(worst[0].id, 2);
  assert.deepEqual(bestAndWorst(nights, 2).worst.map((n) => n.id), [2]); // only three nights: one is left for the worst list
  assert.equal(lineOf(nights[0]), "2G");
  assert.equal(lineOf(nights[2]), "no points");
});

test("the goalie of the night has the most goals saved above expected, with enough shots", () => {
  const mp = { games: { 1: { goalies: [{ id: 1, name: "A", team: "CAR", xGA: 1.9, GA: 0, SOG: 24 }, { id: 2, name: "B", team: "STL", xGA: 2.5, GA: 4, SOG: 20 }] }, 2: { goalies: [{ id: 3, name: "C", team: "NJD", xGA: 5, GA: 0, SOG: 6 }, { id: 4, name: "D", team: "BOS", xGA: 3.2, GA: 1, SOG: 30 }] } } };
  const best = goalieOfTheNight(mp, [1, 2]);
  assert.equal(best.name, "D"); // +2.2 beats +1.9; the 6-shot shutout is too small to count
  assert.equal(best.saves, 29);
  assert.equal(goalieOfTheNight(null, [1]), null);
});
