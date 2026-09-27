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
