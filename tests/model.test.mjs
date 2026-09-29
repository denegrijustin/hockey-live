import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blankStandings,
  applyResult,
  scenario,
  analyzeSeason,
  skaterImpact,
  goalieImpact,
  importance,
} from "../src/lib/model.mjs";
import { normalizeGame, normalizeBoxscore } from "../src/lib/normalize.mjs";
const teams = JSON.parse(
  readFileSync(new URL("../src/data/teams.json", import.meta.url)),
);
const game = (id, date, extra = {}) => ({
  id,
  date,
  start: date + "T20:00:00Z",
  home: "EDM",
  away: "CHI",
  type: 2,
  state: "OFF",
  homeScore: 3,
  awayScore: 2,
  end: "REG",
  ...extra,
});
test("regulation, overtime, and preseason award correct points", () => {
  const table = blankStandings(teams);
  applyResult(table, game(1, "2026-01-01"));
  assert.equal(table.EDM.pts, 2);
  assert.equal(table.CHI.pts, 0);
  assert.equal(table.EDM.rw, 1);
  applyResult(table, game(2, "2026-01-02", { end: "OT" }));
  assert.equal(table.EDM.pts, 4);
  assert.equal(table.CHI.pts, 1);
  assert.equal(table.CHI.ot, 1);
  applyResult(table, game(3, "2026-01-03", { type: 1 }));
  assert.equal(table.EDM.gp, 2);
});
test("isolated win/loss/OT scenarios do not mutate standings", () => {
  const table = blankStandings(teams),
    g = game(1, "2026-01-01");
  for (const [outcome, points, opp] of [
    ["win", 2, 0],
    ["loss", 0, 2],
    ["otl", 1, 2],
  ]) {
    const s = scenario(table, g, "EDM", outcome, teams);
    assert.equal(s.points, points);
    assert.equal(s.opponentGain, opp);
  }
  assert.equal(table.EDM.pts, 0);
  assert.equal(table.CHI.gp, 0);
});
test("past stakes use prior-day standings; future cohort is independent", () => {
  const games = [
    game(1, "2026-01-01"),
    game(2, "2026-01-01", { home: "MIN" }),
    game(3, "2026-01-02"),
    game(4, "2026-01-03", { state: "FUT" }),
    game(5, "2026-01-03", { state: "FUT" }),
  ];
  const a = analyzeSeason(games, teams);
  assert.equal(a.before[1].EDM.pts, 0);
  assert.equal(a.before[2].EDM.pts, 0);
  assert.equal(a.before[3].EDM.pts, 2);
  assert.equal(a.before[4].EDM.pts, 4);
  assert.equal(a.analysis[4].total, 2);
  assert.equal(a.analysis[4].rank, 1);
  assert.equal(a.analysis[5].rank, 1);
  assert.equal(a.analysis[4].tied, true);
});
test("calendar weighting uses actual schedule count, including 84-game seasons", () => {
  const games = Array.from({ length: 84 }, (_, i) =>
    game(i, new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), {
      state: "FUT",
    }),
  );
  const result = importance(games[42], blankStandings(teams), teams, games);
  assert.ok(result.reasons.some((s) => s.startsWith("50%")));
});
test("normalization preserves absent versus zero statistics", () => {
  const g = normalizeGame({
    homeTeam: { abbrev: "EDM", score: 0 },
    awayTeam: { abbrev: "CHI" },
    gameOutcome: { lastPeriodType: "OT" },
  });
  assert.equal(g.homeScore, 0);
  assert.equal(g.awayScore, null);
  assert.equal(g.end, "OT");
  const b = normalizeBoxscore({
    homeTeam: { abbrev: "EDM" },
    playerByGameStats: {
      homeTeam: {
        goalies: [{ playerId: 1, position: "G", saves: 0, shotsAgainst: 0 }],
      },
    },
  });
  assert.equal(b.players[0].saves, 0);
  assert.equal(goalieImpact(b.players[0]), null);
});
test("player indexes expose positive and negative contributions with separate goalie baseline", () => {
  assert.equal(
    skaterImpact({ goals: 1, assists: 1, shots: 3, plusMinus: 0, pim: 0 }),
    2,
  );
  assert.equal(skaterImpact({ plusMinus: -2, pim: 2 }), -0.7);
  assert.equal(goalieImpact({ saves: 28, shotsAgainst: 30 }), 1);
});
test("packaged data covers 32 teams and has unique games", () => {
  for (const season of [20252026, 20262027]) {
    const d = JSON.parse(
      readFileSync(
        new URL(`../public/data/seasons/${season}.json`, import.meta.url),
      ),
    );
    assert.equal(new Set(d.games.map((g) => g.id)).size, d.games.length);
    assert.equal(new Set(d.games.flatMap((g) => [g.home, g.away])).size, 32);
    assert.equal(
      d.games.filter((g) => g.type === 2).length,
      season === 20262027 ? 1344 : 1312,
    );
  }
});

import {
  normalizeGameFeed,
  normalizeScoreboard,
  normalizeEdge,
  mergeScores,
} from "../src/lib/game-data.mjs";
test("live normalization keeps zero scores, shots, period and feed clock", () => {
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/raw-live-game.json", import.meta.url)),
  );
  raw.homeTeam.score = 0;
  raw.clock.timeRemaining = "05:13";
  const feed = normalizeGameFeed(raw);
  assert.equal(feed.homeScore, 0);
  assert.equal(feed.clock, "05:13");
  assert.ok(feed.shots.length);
  assert.ok(feed.shots.every((s) => s.periodType !== "SO"));
  assert.ok(feed.stats.some((s) => s.label === "hit"));
});
test("scoreboard transitions scheduled to live to final without dropping historical games", () => {
  const original = [
    game(1, "2026-09-29", { state: "FUT" }),
    game(2, "2026-09-28"),
  ];
  const live = mergeScores(original, {
    games: [{ ...original[0], state: "LIVE", homeScore: 0, clock: "19:00" }],
  });
  assert.equal(live[0].state, "LIVE");
  assert.equal(live[1].id, 2);
  const final = mergeScores(live, {
    games: [{ ...live[0], state: "OFF", homeScore: 4 }],
  });
  assert.equal(final[0].homeScore, 4);
  assert.equal(original[0].state, "FUT");
});
test("EDGE historical snapshot retains official metrics and season", () => {
  const j = JSON.parse(
    readFileSync(
      new URL("../public/data/edge/20252026/EDM.json", import.meta.url),
    ),
  );
  assert.equal(j.requestedSeason, 20252026);
  assert.ok(j.season <= j.requestedSeason);
  assert.equal(j.metrics.length, 4);
  assert.ok(
    Math.abs(j.zones.reduce((sum, z) => sum + z.value, 0) - 1) < 0.00001,
  );
  assert.ok(j.metrics.every((m) => m.rank >= 1 && m.rank <= 32));
  assert.throws(() => normalizeEdge({}, "EDM", 20262027, 20262027));
});

import { projectGame, elapsedMinutes } from '../src/lib/projection.mjs';
test('projections respect clock, score, game state and missing data', () => {
  const game = { home:'EDM', away:'CHI', type:2, state:'FUT' };
  const pre = projectGame(game);
  assert.ok(pre.homeWin > .5 && pre.homeWin < .6);
  assert.notEqual(pre.score.home, pre.score.away);
  const live = {...game, state:'LIVE', period:3, clock:'01:00', homeScore:3, awayScore:1};
  assert.ok(projectGame(live).homeWin > .98);
  assert.ok(projectGame(live).homeWin > projectGame({...live, period:1}).homeWin);
  assert.equal(elapsedMinutes({...live, period:1, clock:'11:32', intermission:true}),20);
  assert.equal(projectGame({...live, clock:null}),null);
  assert.equal(projectGame({...live, state:'FINAL'}),null);
  assert.equal(projectGame({...live, periodType:'SO'}),null);
  assert.equal(projectGame({...game, type:1}),null);
  assert.ok(projectGame({...live, period:4, homeScore:1}).overtime);
  const pressure = projectGame({...live, homeShots:100, awayShots:0});
  assert.ok(pressure.shotAdjustment <= .25);
  assert.ok(pressure.homeWin >= 0 && pressure.homeWin <= 1);
});
test('prior season and recent form change pregame estimates in the expected direction', () => {
  const game = {home:'EDM',away:'CHI',type:2,state:'FUT'};
  const neutral = projectGame(game);
  const prior = {EDM:{gp:82,gf:320,ga:190}};
  assert.ok(projectGame(game,{},prior).homeWin > neutral.homeWin);
  const hot = {EDM:{gp:5,gf:20,ga:10,results:Array(5).fill({gf:4,ga:2})}};
  assert.ok(projectGame(game,hot).homeWin > neutral.homeWin);
});
test('active power play affects probability only for remaining advantage; penalties alone do not', () => {
  const game={home:'EDM',away:'CHI',type:2,state:'LIVE',homeScore:1,awayScore:1,period:3,clock:'05:00',shots:[]};
  const base=projectGame(game,{}, {},game).homeWin;
  const pp={...game,situation:{home:5,away:4,homePowerPlay:true,awayPowerPlay:false,seconds:120}};
  assert.ok(projectGame(game,{}, {},pp).homeWin > base);
  assert.ok(projectGame(game,{}, {},{...pp,situation:{...pp.situation,seconds:30}}).homeWin < projectGame(game,{}, {},pp).homeWin);
  assert.equal(projectGame(game,{}, {},{...pp,situation:{...pp.situation,seconds:0}}).homeWin,base);
  assert.equal(projectGame(game,{}, {},{...pp,situation:{...pp.situation,away:5}}).homeWin,base);
  assert.ok(projectGame(game,{}, {},{...game,situation:{home:4,away:5,awayPowerPlay:true,seconds:120}}).homeWin < base);
  assert.ok(projectGame(game,{}, {},{...pp,homeScore:2}).homeWin > projectGame(game,{}, {},pp).homeWin);
});
test('play feed retains penalty player, duration, ordered plays and current strength', () => {
  const raw=JSON.parse(readFileSync(new URL('./fixtures/raw-live-game.json',import.meta.url)));
  raw.situation={homeTeam:{strength:5,situationDescriptions:['PP']},awayTeam:{strength:4},secondsRemaining:52};
  raw.plays.push({eventId:9999,sortOrder:9999,periodDescriptor:{number:2,periodType:'REG'},timeInPeriod:'17:02',typeDescKey:'penalty',details:{eventOwnerTeamId:raw.awayTeam.id,descKey:'tripping',duration:2}});
  const data=normalizeGameFeed(raw);
  assert.equal(data.situation.seconds,52);
  assert.equal(data.situation.homePowerPlay,true);
  assert.equal(data.plays.at(-1).penalty,'tripping');
  assert.equal(data.plays.at(-1).duration,2);
  assert.equal(data.injuryStatus,'unavailable');
});

import { projectedStandings } from '../src/lib/standings-projection.mjs';
test('standings projection uses remaining regular games and shrinks early-season pace',()=>{
 const teams=[{id:'EDM'}],table={EDM:{gp:1,pts:2}},baseline={EDM:{gp:82,pts:82}};
 const games=[{type:2,home:'EDM',away:'CHI',state:'FINAL'},{type:2,home:'EDM',away:'MIN',state:'FUT'},{type:1,home:'EDM',away:'CHI',state:'FUT'}];
 const result=projectedStandings(teams,table,games,baseline).EDM;
 assert.equal(result.remaining,1); assert.ok(result.projected>3 && result.projected<4);
 assert.equal(projectedStandings(teams,table,games.map(g=>({...g,state:'FINAL'})),baseline).EDM.projected,2);
});
