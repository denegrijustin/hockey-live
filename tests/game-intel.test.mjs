import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeSeason } from "../src/lib/model.mjs";
import { buildIntel, decodeSit, flowItems, goalSequence, goalStrength, intelPhase, leadChanges, penaltyCounts, powerPlayStatus, scoringRuns, specialTeamsEdge, standingsImpact, stakesItems } from "../src/lib/game-intel.mjs";
import { derivedGame, derivedGoalPlays, realPenaltyPlays, rawLive } from "./fixtures/derive-intel.mjs";

// Fixtures: goals are real goals rebuilt from recorded MoneyPuck shot files and penalties come from the recorded NHL feed (DERIVED, see derive-intel.mjs).
const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const teams = load("../public/data/teams.json");
const season = load("../public/data/seasons/20252026.json").games;
const BASES = ["official", "derived", "historical", "projection"];
const G50 = derivedGame(2026020050), P50 = derivedGoalPlays(2026020050); // STL 2 at CHI 4, regulation
const G63 = derivedGame(2026020063), P63 = derivedGoalPlays(2026020063); // SJS at STL, decided in overtime
const t = [{ id: "CHI", short: "Blackhawks", conference: "W", division: "Central" }, { id: "STL", short: "Blues", conference: "W", division: "Central" }, { id: "SJS", short: "Sharks", conference: "W", division: "Pacific" }];

test("decodeSit reads away goalie, away skaters, home skaters, home goalie and refuses anything else", () => {
  assert.deepEqual(decodeSit("1541"), { awayGoalie: 1, awaySkaters: 5, homeSkaters: 4, homeGoalie: 1 });
  assert.deepEqual(decodeSit("0651"), { awayGoalie: 0, awaySkaters: 6, homeSkaters: 5, homeGoalie: 1 });
  for (const bad of [null, undefined, "", "155", "15511", "abcd", 1551]) assert.equal(decodeSit(bad), null);
});

test("goal sequence follows the feed's own score after each goal and sorts by order", () => {
  const seq = goalSequence([...P50].reverse(), G50);
  assert.deepEqual(seq.map((s) => [s.away, s.home]), [[1, 0], [1, 1], [1, 2], [1, 3], [2, 3], [2, 4]]);
});

test("lead changes on a real regulation game: STL scored first, CHI came from behind, one lead change, tied once", () => {
  const f = leadChanges(P50, G50);
  assert.equal(f.first.team, "STL");
  assert.equal(f.leadChanges, 1);
  assert.equal(f.ties, 1);
  assert.equal(f.largest.team, "CHI");
  assert.equal(f.largest.margin, 2);
  assert.equal(f.comeback, null); // trailed by one only: below the 2-goal threshold
});

test("real overtime game: two ties, one lead change, the overtime goal counts", () => {
  const f = leadChanges(P63, G63);
  assert.equal(f.ties, 2);
  assert.equal(f.leadChanges, 1);
  assert.equal(f.goals, 5);
  assert.match(f.seq.at(-1).at, /^OT /);
  assert.equal(G63.end, "OT");
});

test("scoring runs need three unanswered goals and carry the clock span", () => {
  const runs = scoringRuns(P50, G50);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].team, "CHI");
  assert.equal(runs[0].count, 3);
  assert.equal(runs[0].from, "P2 05:40");
  assert.match(runs[0].to, /^P3 /);
  assert.equal(runs[0].score.from, "1-1");
  assert.equal(runs[0].score.to, "1-3");
  assert.ok(runs[0].seconds > 1200);
  assert.deepEqual(scoringRuns(P63, G63), []);
});

test("a comeback is reported when the winner trailed by two or more (DERIVED variant: the first two real goals credited to the opponent)", () => {
  const plays = P50.map((p, i) => ({ ...p, team: i < 2 ? "STL" : p.team }));
  let a = 0, h = 0;
  for (const p of plays) { if (p.team === "CHI") h++; else a++; p.score = { home: h, away: a }; }
  const game = { ...G50, homeScore: h, awayScore: a };
  const f = leadChanges(plays, game);
  assert.equal(f.comeback.team, "CHI");
  assert.equal(f.comeback.deficit, 2);
  assert.match(flowItems(plays, game, t, "post").find((i) => i.id === "comeback").text, /Blackhawks won after trailing by 2/);
});

test("without play.score the running count is used, and a count that disagrees with the final score is refused", () => {
  const bare = P50.map(({ score, ...p }) => p);
  assert.equal(goalSequence(bare, G50).at(-1).home, 4);
  assert.equal(goalSequence(bare.slice(0, 3), G50), null); // final says 6 goals, the feed has 3
  assert.ok(goalSequence(bare.slice(0, 3), { ...G50, state: "LIVE" })); // live: the feed and the scoreboard can be a poll apart
});

test("no goals and a 0-0 game yield no flow items", () => {
  assert.equal(leadChanges([], G50), null);
  assert.deepEqual(flowItems([], { ...G50, homeScore: 0, awayScore: 0 }, t, "post"), []);
  assert.deepEqual(scoringRuns(undefined, G50), []);
  assert.equal(leadChanges(null, G50), null);
});

test("shootout final: shootout goals are left out of the flow, no game-winning goal or margin is claimed", () => {
  const so = [
    { id: 1, order: 1, period: 1, periodType: "REG", time: "05:00", type: "goal", team: "CHI", score: { home: 1, away: 0 } },
    { id: 2, order: 2, period: 3, periodType: "REG", time: "15:00", type: "goal", team: "STL", score: { home: 1, away: 1 } },
    { id: 3, order: 3, period: 5, periodType: "SO", time: "00:00", type: "goal", team: "CHI", score: { home: 2, away: 1 } },
  ];
  const game = { ...G50, homeScore: 2, awayScore: 1, end: "SO" };
  const items = flowItems(so, game, t, "post");
  assert.ok(items.length > 0);
  assert.equal(leadChanges(so, game).goals, 2);
  assert.ok(!items.some((i) => ["game-winner", "one-goal", "blowout"].includes(i.id)));
});

test("final lines: game-winning goal and one-goal come from the same flow facts; a feed that disagrees with the score says nothing", () => {
  const items = flowItems(P50, G50, t, "post");
  const gw = items.find((i) => i.id === "game-winner");
  assert.ok(gw.text.includes("Blackhawks"));
  assert.match(gw.detail, /goal number 3/); // STL finished with 2, CHI's third goal is the winner
  assert.ok(!items.some((i) => i.id === "one-goal")); // margin 2
  const ot = flowItems(P63, G63, t, "post");
  assert.ok(ot.some((i) => i.id === "one-goal"));
  assert.ok(ot.find((i) => i.id === "game-winner").text.includes("Sharks"));
  const bare = P50.map(({ score, ...p }) => p);
  assert.deepEqual(flowItems(bare, { ...G50, homeScore: 5, awayScore: 0 }, t, "post"), []);
  const blow = flowItems(P50, { ...G50, homeScore: 4, awayScore: 0 }, t, "post"); // feed has score so flow stands, but the blowout line is only for matching totals
  assert.ok(!blow.some((i) => i.id === "blowout"));
});

test("goal strength: power-play, short-handed and empty-net goals are told apart; unknown codes are ignored", () => {
  const gs = goalStrength(P50, G50);
  assert.equal(gs.pp.CHI, 1);
  assert.equal(gs.en.CHI, 2);
  assert.equal(goalStrength(P63, G63).sh.STL, 1); // STL scored at 4on5
  assert.equal(goalStrength([{ type: "goal", team: "CHI", sit: "weird" }], G50).known, 0);
  assert.deepEqual(goalStrength([{ type: "goal", team: "CHI", periodType: "OT", sit: "1331" }], G50).pp, {}); // 3v3
  assert.deepEqual(goalStrength([{ type: "goal", team: "CHI", sit: "1651" }], G50).pp, {}); // away 6 skaters, home 5, CHI is home: 5v6, short-handed
  assert.equal(goalStrength([{ type: "goal", team: "CHI", sit: "0651" }], G50).pp.CHI, undefined); // away goalie out and CHI at 5v6 is not a power play
});

test("penalties are counted per team from real feed plays; empty and null durations are safe", () => {
  assert.deepEqual(penaltyCounts(realPenaltyPlays()), { CAR: { count: 3, minutes: 9 }, FLA: { count: 1, minutes: 5 } });
  assert.deepEqual(penaltyCounts([{ type: "penalty", team: "X", duration: null }, { type: "goal" }]), {});
  assert.deepEqual(penaltyCounts(undefined), {});
});

test("power-play status: the current situation is official and live only; penalties are derived", () => {
  const raw = rawLive();
  const game = { ...G50, home: raw.homeTeam.abbrev, away: raw.awayTeam.abbrev };
  const plays = realPenaltyPlays();
  const sit = { home: 5, away: 4, homePowerPlay: true, awayPowerPlay: false, seconds: 72 };
  const live = powerPlayStatus(plays, sit, game, t, { live: true });
  const now = live.find((i) => i.id === "pp-now");
  assert.equal(now.basis, "official");
  assert.match(now.text, /5-on-4/);
  assert.match(now.detail, /1:12/);
  assert.equal(live.find((i) => i.id === "penalties").basis, "derived");
  assert.ok(!powerPlayStatus(plays, sit, game, t, { live: false }).some((i) => i.id === "pp-now"));
  assert.ok(!powerPlayStatus(plays, { ...sit, awayPowerPlay: true }, game, t, { live: true }).some((i) => i.id === "pp-now")); // contradictory flags: say nothing
  assert.ok(!powerPlayStatus(plays, null, game, t, { live: true }).some((i) => i.id === "pp-now"));
});

test("special teams edge: one short historical line that links to the lens; nothing without the snapshot", () => {
  const m = (ppr, pkr) => ({ gamesPlayed: 20, metrics: { powerPlayPct: { value: 0.2, rank: ppr, pool: 32 }, penaltyKillPct: { value: 0.8, rank: pkr, pool: 32 } } });
  const snap = { teams: { STL: m(2, 3), CHI: m(25, 28) } };
  const [item] = specialTeamsEdge(snap, "STL", "CHI", t);
  assert.equal(item.basis, "historical");
  assert.equal(item.phase, "pre");
  assert.match(item.text, /Blues/);
  assert.equal(item.link.section, "matchup-lens");
  assert.match(item.detail, /2nd \/ 3rd/);
  assert.equal(specialTeamsEdge({ teams: {} }, "STL", "CHI", t).length, 0);
  assert.equal(specialTeamsEdge(null, "STL", "CHI", t).length, 0);
  assert.match(specialTeamsEdge({ teams: { STL: m(15, 15), CHI: m(16, 16) } }, "STL", "CHI", t)[0].text, /even/);
});

test("standings impact on the real 2025-26 snapshot: spot change, before/after numbers and a computed clinch", () => {
  const { before } = analyzeSeason(season, teams);
  const byId = (id) => season.find((g) => g.id === id);
  const g = byId(2025021111); // COL 3 at WSH 2 in overtime
  const items = standingsImpact(before[g.id], g, teams, season);
  const clinch = items.find((i) => i.id === "clinch-COL");
  assert.equal(clinch.text, "Avalanche clinch a playoff spot (computed from points)");
  assert.equal(clinch.basis, "derived");
  assert.ok(items.every((i) => BASES.includes(i.basis) && i.phase === "post"));
  const snapshot = JSON.stringify(before[2025020199]);
  const spot = standingsImpact(before[2025020199], byId(2025020199), teams, season).find((i) => i.id === "standings-TOR");
  assert.equal(spot.text, "Maple Leafs move into the second wild card: 2 points above the line");
  assert.match(spot.detail, /Conference points rank .* to .*; \d+ to \d+ points\. Pregame table plus this result only/);
  assert.equal(JSON.stringify(before[2025020199]), snapshot); // the pregame table is never mutated
});

test("standings impact is skipped for playoffs, early season, unfinished, tied scores and missing data", () => {
  const { before } = analyzeSeason(season, teams);
  const g = season.find((x) => x.id === 2025021111);
  assert.deepEqual(standingsImpact(null, g, teams, season), []);
  assert.deepEqual(standingsImpact(before[g.id], { ...g, type: 3 }, teams, season), []);
  assert.deepEqual(standingsImpact(before[g.id], { ...g, state: "FUT" }, teams, season), []);
  assert.deepEqual(standingsImpact(before[g.id], { ...g, homeScore: 2, awayScore: 2 }, teams, season), []);
  assert.deepEqual(standingsImpact(before[g.id], g, [], season), []);
  const early = season.find((x) => x.type === 2);
  assert.deepEqual(standingsImpact(before[early.id], early, teams, season), []); // below the games-played threshold
});

test("pregame stakes come from scenario(): points, distance to the line, projection basis", () => {
  const { before } = analyzeSeason(season, teams);
  const g = season.find((x) => x.id === 2025021111);
  const [s] = stakesItems(before[g.id], g, teams);
  assert.equal(s.basis, "projection");
  assert.equal(s.phase, "pre");
  assert.match(s.detail, /win \d+ pts/);
  assert.deepEqual(stakesItems(before[g.id], { ...g, type: 1 }, teams), []);
});

test("phases: upcoming, live, final; postponed and canceled games show nothing", () => {
  assert.equal(intelPhase({ ...G50, state: "FUT", end: undefined }), "pre");
  assert.equal(intelPhase({ ...G50, state: "LIVE", period: 2, periodType: "REG", clock: "10:00" }), "live");
  assert.equal(intelPhase(G50), "post");
  for (const scheduleState of ["PPD", "CNCL"]) {
    const g = { ...G50, state: "FUT", scheduleState };
    assert.equal(intelPhase(g), null);
    assert.deepEqual(buildIntel(g, { plays: P50, teams: t }), []);
  }
  assert.equal(intelPhase(null), null);
});

test("buildIntel: a final shows only postgame items, sorted by priority, every item has the contract fields", () => {
  const items = buildIntel(G50, { plays: P50, teams: t });
  assert.ok(items.length >= 4);
  for (const i of items) {
    assert.ok(i.id && i.kind && i.text && i.detail);
    assert.equal(i.phase, "post");
    assert.ok(BASES.includes(i.basis));
  }
  assert.deepEqual(items.map((i) => i.priority), items.map((i) => i.priority).sort((a, b) => b - a));
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test("buildIntel dedupes: an exclusion list of ids or kinds is honoured, and nothing mentions season series, form or odds", () => {
  const all = buildIntel(G50, { plays: P50, teams: t });
  const cut = buildIntel(G50, { plays: P50, teams: t, exclude: ["first-goal", "special"] });
  assert.ok(all.some((i) => i.id === "first-goal"));
  assert.ok(!cut.some((i) => i.id === "first-goal" || i.kind === "special"));
  for (const i of all) assert.ok(!/season series|last \d+ games|win streak|chance|odds/i.test(`${i.text} ${i.detail}`), i.text);
});

test("buildIntel live: flow and the current power play; deterministic", () => {
  const live = { ...G50, state: "LIVE", period: 3, periodType: "REG", clock: "08:00", homeScore: 3, awayScore: 1, end: undefined };
  const ctx = { plays: P50.slice(0, 4), teams: t, situation: { home: 4, away: 5, homePowerPlay: false, awayPowerPlay: true, seconds: 30 } };
  const a = buildIntel(live, ctx);
  assert.deepEqual(a, buildIntel(live, ctx));
  assert.ok(a.some((i) => i.id === "pp-now" && i.phase === "live"));
  assert.ok(a.some((i) => i.kind === "flow" && i.phase === "live"));
});
