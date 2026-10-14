import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, normalizeTeams, normalizeGoalies, normalizeSkaters } from "../src/lib/moneypuck.mjs";
import {
  per60, share, svPct, gsax, teamMetrics, rankBy, goalieMetrics, skaterMetrics, rolling, teamGameLog, goalieGameLog, chanceFlow, timelineEnd,
  clockLabel, shotTotals, gameDataStatus, isStale, ageHours, matchupPairs, matchupDetail, teamTable, leagueAverage, periodLength,
} from "../src/lib/nhlplus.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/moneypuck/${name}`, import.meta.url), "utf8");
const ids = new Set(["EDM", "CAR", "NYR"]);
const summary = { teams: normalizeTeams(parseCsv(fixture("teams-edm-car.csv")), 2026, ids, { minTeams: 2 }) };

test("per-60 uses the time of the same situation and keeps missing values missing", () => {
  assert.equal(per60(9.77, 14392).toFixed(4), "2.4439"); // EDM 5v5 xGF/60 from teams.csv
  assert.equal(per60(4.53, 1675).toFixed(3), "9.736"); // EDM power play: power-play time, not all-situations time
  assert.equal(per60(5, 0), null);
  assert.equal(per60(null, 100), null);
  assert.equal(per60(5, null), null);
  assert.equal(per60(0, 100), 0);
});

test("expected-goals share and save percentage", () => {
  assert.equal(share(9.77, 7.43).toFixed(4), "0.5680");
  assert.equal(share(0, 0), null);
  assert.equal(share(null, 1), null);
  assert.equal(svPct(8, 109).toFixed(4), "0.9266");
  assert.equal(svPct(0, 0), null);
  assert.equal(gsax(12.95, 8).toFixed(2), "4.95");
  assert.equal(gsax(null, 8), null);
});

test("team metrics: EDM 5-on-5 and power play from the Oct 13 download", () => {
  const five = teamMetrics(summary.teams.EDM["5on5"]);
  assert.equal(five.gp, 5);
  assert.equal(five.xGF60.toFixed(3), "2.444");
  assert.equal(five.xGA60.toFixed(3), "1.859");
  assert.equal(five.xGPct.toFixed(4), "0.5680");
  assert.equal(five.GF, 17);
  assert.equal(five.shPct.toFixed(4), (17 / 92).toFixed(4));
  assert.equal(five.CFPct.toFixed(4), (205 / (205 + summary.teams.EDM["5on5"].CA)).toFixed(4));
  const pp = teamMetrics(summary.teams.EDM["5on4"]);
  assert.equal(pp.toi, 1675);
  assert.equal(pp.xGF60.toFixed(3), "9.736");
  const pk = teamMetrics(summary.teams.EDM["4on5"]);
  assert.equal(pk.xGA60.toFixed(3), (1.82 * 3600 / 995).toFixed(3));
  assert.equal(teamMetrics(null), null);
});

test("ranks share ties and skip missing values", () => {
  const rows = [{ team: "A", v: 3 }, { team: "B", v: 3 }, { team: "C", v: 1 }, { team: "D", v: null }];
  assert.deepEqual(rankBy(rows, "v", true), { A: 1, B: 1, C: 3, D: null });
  assert.deepEqual(rankBy(rows, "v", false), { A: 2, B: 2, C: 1, D: null });
  assert.equal(leagueAverage(rows, "v"), 7 / 3);
});

test("goalies: totals and rates are separate numbers", () => {
  const g = normalizeGoalies(parseCsv(fixture("goalies-shesterkin.csv")), 2026, ids)[0];
  const m = goalieMetrics(g.sit.all);
  assert.equal(m.gsax.toFixed(2), "4.95"); // total
  assert.equal(m.gsaxPer60.toFixed(3), (4.95 * 3600 / 16061).toFixed(3)); // rate
  assert.equal(m.svPct.toFixed(4), (1 - 8 / 109).toFixed(4));
  assert.equal(m.xSvPct.toFixed(4), (1 - 12.95 / 109).toFixed(4));
  assert.equal(m.SOGPer60.toFixed(2), (109 * 3600 / 16061).toFixed(2));
  assert.equal(m.hdAtt, 6);
  assert.equal(m.hdGsax.toFixed(2), (1.42 - 0).toFixed(2));
});

test("skaters: individual and on-ice stay separate; goals minus individual xG", () => {
  const p = normalizeSkaters(parseCsv(fixture("skaters-mcdavid.csv")), 2026, ids, { minSkaters: 1 })[0];
  const m = skaterMetrics(p.sit.all);
  assert.equal(m.individual.G, 3);
  assert.equal(m.individual.A, 10);
  assert.equal(m.individual.goalsVsIxG.toFixed(2), "0.73");
  assert.equal(m.onIce.xGPct.toFixed(4), (10.73 / (10.73 + 3.37)).toFixed(4));
  assert.equal(m.toiPerGame.toFixed(2), (7186 / 60 / 5).toFixed(2));
});

const game = (id, team, xGF, xGA, GF, GA) => ({ id, home: team, away: "X", periods: 3, overtime: false, goals: { home: GF, away: GA }, shots: 1, teams: { [team]: { all: { xGF, xGA, GF, GA, SOGF: 0, SOGA: 0 } } }, goalies: [{ id: 7, name: "G", team, xGA: xGA, GA, SOG: 10 }] });
const games = { games: Object.fromEntries([game(3, "EDM", 3, 1, 2, 1), game(1, "EDM", 1, 2, 0, 3), game(2, "EDM", 2, 2, 4, 1)].map((g) => [g.id, g])) };

test("game logs come back in order and rolling windows sum before taking shares", () => {
  const log = teamGameLog(games, "EDM");
  assert.deepEqual(log.map((g) => g.id), [1, 2, 3]);
  const r = rolling(log, 2);
  assert.equal(r.length, 2); // the first window is complete at game 2
  assert.equal(r[0].xGF, 3); assert.equal(r[0].xGA, 4);
  assert.equal(r[0].xGPct, 3 / 7);
  assert.equal(r[1].goalsVsXFor, (4 + 2) - (2 + 3));
  assert.equal(rolling(log, 5).length, 0);
  assert.equal(rolling(log, 5, { partial: true }).length, 3);
  assert.equal(goalieGameLog(games, 7).length, 3);
  assert.equal(goalieGameLog(games, 7)[0].gsax, 2 - 3);
});

const shots = [
  { t: 100, p: 1, team: "BOS", xg: 0.1, g: 0, sog: 1, sit: "5on5" },
  { t: 700, p: 1, team: "TOR", xg: 0.3, g: 1, sog: 1, sit: "5on4" },
  { t: 2500, p: 3, team: "BOS", xg: 0.2, g: 0, sog: 0, sit: "5on5" },
  { t: 3700, p: 4, team: "TOR", xg: 0.4, g: 0, sog: 1, sit: "5on5" },
];

test("chance flow is cumulative, starts at zero, and stops at 'through' so future time stays unfilled", () => {
  const full = chanceFlow(shots, "BOS", "TOR");
  assert.deepEqual(full.map((p) => [p.t, +p.home.toFixed(2), +p.away.toFixed(2)]), [[0, 0, 0], [100, 0.1, 0], [700, 0.1, 0.3], [2500, 0.3, 0.3], [3700, 0.3, 0.7]]);
  const partial = chanceFlow(shots, "BOS", "TOR", { through: 1000 });
  assert.equal(partial.at(-1).t, 700);
  assert.equal(partial.length, 3);
  const pp = chanceFlow(shots, "BOS", "TOR", { sit: "5on4" });
  assert.equal(pp.at(-1).away, 0.3);
  assert.equal(pp.at(-1).home, 0);
  const totals = shotTotals(shots, "TOR");
  assert.equal(totals.GF, 1); assert.equal(totals.SOGF, 2); assert.equal(+totals.xGF.toFixed(2), 0.7);
});

test("timeline length and clock labels cover regulation, overtime and playoff overtime", () => {
  assert.equal(timelineEnd(shots), 3900); // one 5-minute regular-season overtime
  assert.equal(timelineEnd([{ p: 3 }]), 3600);
  assert.equal(timelineEnd([{ p: 4 }], { playoff: true }), 4800);
  assert.equal(timelineEnd([{ p: 5 }], { playoff: true }), 6000);
  assert.equal(periodLength(4, false), 300);
  assert.equal(periodLength(4, true), 1200);
  assert.equal(clockLabel(0), "P1 0:00");
  assert.equal(clockLabel(1200), "P1 20:00");
  assert.equal(clockLabel(1201), "P2 0:01");
  assert.equal(clockLabel(3600), "P3 20:00");
  assert.equal(clockLabel(3700), "OT1 1:40");
  assert.equal(clockLabel(4801, true), "OT2 0:01");
});

test("which data a game gets: pregame, live, intermission, final in the download, final pending, shootout", () => {
  const part = { games: { 5: {} } };
  assert.equal(gameDataStatus({ id: 5, state: "FUT" }, part), "pregame");
  assert.equal(gameDataStatus({ id: 5, state: "PRE" }, part), "pregame");
  assert.equal(gameDataStatus({ id: 5, state: "LIVE", intermission: true }, part), "live"); // intermission is still not MoneyPuck-live
  assert.equal(gameDataStatus({ id: 5, state: "CRIT" }, part), "live");
  assert.equal(gameDataStatus({ id: 5, state: "FINAL", end: "OT" }, part), "final-available");
  assert.equal(gameDataStatus({ id: 6, state: "OFF", end: "SO" }, part), "final-pending");
  assert.equal(gameDataStatus({ id: 6, state: "FINAL" }, null), "final-pending");
});

test("stale means older than 36 hours or unknown", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  assert.equal(isStale("2026-10-13T10:31:35Z", now), false);
  assert.equal(isStale("2026-10-12T10:00:00Z", now), true);
  assert.equal(isStale(null, now), true);
  assert.equal(ageHours("2026-10-13T12:00:00Z", now), 12);
});

test("matchup pairs line up creation against suppression in the same situation", () => {
  const rows = matchupPairs(summary, "EDM", "CAR");
  assert.equal(rows.length, 4);
  const edm5 = rows.find((r) => r.id === "EDM-5v5");
  assert.equal(edm5.offense.toFixed(3), (9.77 * 3600 / 14392).toFixed(3));
  assert.equal(edm5.defense.toFixed(3), (summary.teams.CAR["5on5"].xGA * 3600 / summary.teams.CAR["5on5"].toi).toFixed(3));
  const pp = rows.find((r) => r.id === "EDM-special");
  assert.equal(pp.defense.toFixed(3), (summary.teams.CAR["4on5"].xGA * 3600 / summary.teams.CAR["4on5"].toi).toFixed(3));
  assert.equal(matchupPairs({ teams: {} }, "EDM", "CAR").every((r) => r.offense === null && r.defense === null), true);
});

test("the matchup detail needs a real sample and never invents one", () => {
  assert.match(matchupDetail(summary, "EDM", "CAR"), /xG/);
  assert.equal(matchupDetail(summary, "EDM", "CAR", { minToi5v5: 10 ** 9 }) === null || /power play/.test(matchupDetail(summary, "EDM", "CAR", { minToi5v5: 10 ** 9 })), true);
  assert.equal(matchupDetail({ teams: {} }, "EDM", "CAR"), null);
});

test("team table drops teams without games and carries every metric", () => {
  const rows = teamTable(summary, "5on5");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.xGPct != null && r.xGF60 != null));
});
