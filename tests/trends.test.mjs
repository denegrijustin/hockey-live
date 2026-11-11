import test from "node:test";
import assert from "node:assert/strict";
import { MIN_SAMPLE, teamResults, streak, formLast, goalDiffTrend, homeAwaySplit, specialTeamsRank, matchupLens } from "../src/lib/trends.mjs";

let id = 1;
const g = (home, away, hs, as, o = {}) => ({ id: id++, type: 2, state: "FINAL", scheduleState: "OK", end: "REG", home, away, homeScore: hs, awayScore: as, start: `2026-10-${String(10 + id).padStart(2, "0")}T23:00:00Z`, date: `2026-10-${10 + id}`, ...o });
const edm = (outcomes) => outcomes.map((o) => (o === "W" ? g("EDM", "CGY", 3, 1) : o === "L" ? g("CGY", "EDM", 4, 2) : g("EDM", "CGY", 2, 3, { end: "OT" })));

test("teamResults counts only completed games, in play order", () => {
  const games = [
    g("EDM", "CGY", 3, 1),
    g("EDM", "VAN", null, null, { state: "FUT" }),
    g("EDM", "VAN", 0, 0, { state: "LIVE" }),
    g("EDM", "SEA", 2, 1, { scheduleState: "PPD" }),
    g("EDM", "SEA", 1, 1), // no ties exist: ignored rather than guessed
    g("EDM", "LAK", 2, 1, { type: 1 }), // preseason
    g("LAK", "EDM", 3, 2, { end: "SO" }),
    g("VAN", "SEA", 5, 0),
  ];
  const r = teamResults(games, "EDM");
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.outcome), ["W", "OTL"]);
  assert.equal(r[1].home, false);
  assert.equal(r[1].gf, 2);
  assert.deepEqual(teamResults([], "EDM"), []);
  assert.deepEqual(teamResults(null, "EDM"), []);
});

test("streak: wins run, no-win run counts OT losses, empty is null", () => {
  assert.deepEqual(streak([]), { kind: null, n: 0 });
  assert.deepEqual(streak(teamResults(edm(["L", "W", "W", "W"]), "EDM")), { kind: "W", n: 3 });
  assert.deepEqual(streak(teamResults(edm(["W", "L", "OTL"]), "EDM")), { kind: "L", n: 2 });
});

test("formLast: record, points, chips, label and sample", () => {
  const r = teamResults(edm(["L", "W", "W", "OTL", "W", "W", "L"]), "EDM");
  const f = formLast(r, 5);
  assert.deepEqual([f.value.w, f.value.l, f.value.otl, f.value.pts, f.value.gp], [3, 1, 1, 7, 5]);
  assert.deepEqual(f.value.chips, ["W", "W", "OTL", "W", "W"].slice(0, 0).concat(["W", "OTL", "W", "W", "L"]));
  assert.equal(f.label, "last 5");
  assert.equal(f.sample, 5);
  assert.deepEqual(f.value.streak, { kind: "L", n: 1 });
  assert.equal(formLast(r, 10).label, "last 7");
});

test("formLast is null below the minimum sample, with the sample reported", () => {
  assert.equal(formLast([], 5).value, null);
  assert.equal(formLast([], 5).sample, 0);
  const two = teamResults(edm(["W", "W"]), "EDM");
  assert.equal(MIN_SAMPLE, 3);
  assert.deepEqual(formLast(two, 5), { value: null, sample: 2, label: "last 5" });
  assert.equal(formLast(null, 5).value, null);
  assert.ok(formLast(teamResults(edm(["W", "W", "W"]), "EDM"), 5).value);
});

test("goalDiffTrend: cumulative series, total and per game", () => {
  const r = teamResults(edm(["W", "L", "OTL", "W"]), "EDM"); // +2, -2, -1, +2
  const d = goalDiffTrend(r);
  assert.deepEqual(d.value.series, [2, 0, -1, 1]);
  assert.equal(d.value.total, 1);
  assert.equal(d.value.perGame, 0.25);
  assert.equal(d.label, "season to date");
  assert.equal(goalDiffTrend(r.slice(0, 2)).value, null);
  assert.equal(goalDiffTrend([]).sample, 0);
});

test("homeAwaySplit derives sides from the game objects and ignores postponed games", () => {
  const games = [g("EDM", "CGY", 3, 1), g("EDM", "VAN", 1, 2), g("CGY", "EDM", 2, 3, { end: "OT" }), g("VAN", "EDM", 0, 4), g("EDM", "SEA", 5, 0, { scheduleState: "PPD" }), g("EDM", "SEA", null, null, { state: "FUT" })];
  const s = homeAwaySplit(games, "EDM");
  assert.deepEqual([s.value.home.w, s.value.home.l, s.value.home.gp, s.value.home.pts], [1, 1, 2, 2]);
  assert.deepEqual([s.value.away.w, s.value.away.l, s.value.away.gp, s.value.away.gd], [2, 0, 2, 5]);
  assert.equal(s.value.home.ptsPct, 0.5);
  assert.equal(s.sample, 4);
  assert.equal(homeAwaySplit(games.slice(0, 2), "EDM").value, null);
});

test("homeAwaySplit: a side with no games has null points %, never NaN", () => {
  const s = homeAwaySplit([g("EDM", "A", 1, 0), g("EDM", "B", 1, 0), g("EDM", "C", 1, 0)], "EDM");
  assert.equal(s.value.away.gp, 0);
  assert.equal(s.value.away.ptsPct, null);
});

const snap = { teams: { EDM: { gamesPlayed: 12, metrics: { powerPlayPct: { value: 0.28, rank: 2, pool: 32 }, penaltyKillPct: { value: 0.8, rank: 21, pool: 32, tied: true } } }, CGY: { gamesPlayed: 12, metrics: { powerPlayPct: { value: null, rank: null, pool: 32 } } } } };
test("specialTeamsRank only reports what the snapshot has", () => {
  const s = specialTeamsRank(snap, "EDM");
  assert.deepEqual(s.value.pp, { pct: 0.28, rank: 2, pool: 32, tied: false });
  assert.equal(s.value.pk.tied, true);
  assert.equal(s.sample, 12);
  assert.equal(specialTeamsRank(snap, "CGY").value, null);
  assert.equal(specialTeamsRank(snap, "XXX").value, null);
  assert.equal(specialTeamsRank(undefined, "EDM").value, null);
});

test("matchupLens: every bullet is backed by numbers; unsupported bullets are omitted", () => {
  const games = [...edm(["W", "W", "L", "W", "W"]), g("CGY", "EDM", 1, 3)];
  const table = { EDM: { gp: 12, gf: 40, ga: 30 }, CGY: { gp: 12, gf: 25, ga: 35 } };
  const lens = matchupLens("EDM", "CGY", table, games, { homeId: "CGY", names: { EDM: "Oilers" }, matchups: { teams: { EDM: snap.teams.EDM, CGY: { gamesPlayed: 12, metrics: { powerPlayPct: { value: 0.2, rank: 20, pool: 32 }, penaltyKillPct: { value: 0.85, rank: 3, pool: 32 } } } } } });
  const ids = lens.value.bullets.map((b) => b.id);
  assert.ok(ids.includes("form") && ids.includes("goal-diff") && ids.includes("series") && ids.includes("st-EDM") && ids.includes("st-CGY"));
  for (const b of lens.value.bullets) { assert.ok(b.text.length > 10); assert.ok(b.numbers && b.numbers.unit); assert.ok(b.sample); }
  assert.match(lens.value.bullets.find((b) => b.id === "goal-diff").text, /Oilers \+0\.83, CGY -0\.83/);
  assert.match(lens.value.bullets.find((b) => b.id === "series").text, /Oilers lead the season series 5-1/);
  assert.match(lens.value.bullets.find((b) => b.id === "st-EDM").text, /2nd of 32 \(28\.0%\).*3rd of 32 \(85\.0%\)/);
  assert.ok(!ids.includes("home-away")); // CGY has no home games in this set
});

test("matchupLens returns null value with no data and no special-teams bullet without a snapshot", () => {
  assert.equal(matchupLens("EDM", "CGY", null, [], {}).value, null);
  const l = matchupLens("EDM", "CGY", { EDM: { gp: 5, gf: 10, ga: 9 }, CGY: { gp: 5, gf: 9, ga: 10 } }, []);
  assert.deepEqual(l.value.bullets.map((b) => b.id), ["goal-diff"]);
  assert.ok(!JSON.stringify(l).includes("NaN"));
});

test("matchupLens ordinal suffixes (11th, 12th, 22nd)", () => {
  const mk = (rank) => ({ teams: { A: { gamesPlayed: 9, metrics: { powerPlayPct: { value: 0.2, rank, pool: 32 } } }, B: { gamesPlayed: 9, metrics: { penaltyKillPct: { value: 0.8, rank: 1, pool: 32 } } } } });
  for (const [rank, word] of [[11, "11th"], [12, "12th"], [22, "22nd"], [3, "3rd"]]) assert.match(matchupLens("A", "B", null, [], { matchups: mk(rank) }).value.bullets[0].text, new RegExp(`power play is ${word} of 32`));
});
