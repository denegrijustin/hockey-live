import test from "node:test";
import assert from "node:assert/strict";
import teams from "../src/data/teams.json" with { type: "json" };
import { relevance, rankGames, hasContext } from "../src/lib/relevance.mjs";

const NOW = Date.parse("2026-11-10T18:00:00Z");
const g = (id, away, home, o = {}) => ({ id, season: 20262027, type: 2, date: "2026-11-10", start: "2026-11-10T23:00:00Z", state: "FUT", scheduleState: "OK", venue: "", home, away, homeScore: null, awayScore: null, end: "", broadcasts: [], round: null, ...o });
const keys = (r) => r.reasons.map((x) => x.key);
const ctx = (o = {}) => ({ teams, now: NOW, ...o });

test("favorite team: +35, a second favorite +10, reason text names the team", () => {
  const one = relevance(g(1, "CHI", "EDM"), ctx({ favorites: ["EDM"] }));
  assert.equal(one.reasons.find((r) => r.key === "favorite").points, 35);
  assert.equal(one.reasons.find((r) => r.key === "favorite").text, "Your team: EDM");
  assert.match(one.explanation, /^Your team: EDM/);
  const two = relevance(g(1, "CHI", "EDM"), ctx({ favorites: ["EDM", "CHI"] }));
  assert.equal(two.reasons.find((r) => r.key === "favorite").points, 45);
  assert.equal(two.reasons.find((r) => r.key === "favorite").text, "Your teams: CHI, EDM");
});

test("each reason appears only when its fact is true", () => {
  const plain = relevance(g(1, "CHI", "EDM"), ctx({ favorites: ["BOS"] }));
  for (const k of ["favorite", "saved", "followed", "live"]) assert.ok(!keys(plain).includes(k), k);
  const saved = relevance(g(1, "CHI", "EDM"), ctx({ saved: [1] }));
  assert.deepEqual(saved.reasons.find((r) => r.key === "saved"), { key: "saved", points: 20, text: "Saved by you" });
  assert.ok(!keys(relevance(g(2, "CHI", "EDM"), ctx({ saved: [1] }))).includes("saved"));
  const fol = relevance(g(1, "CHI", "EDM"), ctx({ followedTeams: ["CHI"] }));
  assert.equal(fol.reasons.find((r) => r.key === "followed").points, 10);
  assert.match(fol.reasons.find((r) => r.key === "followed").text, /CHI/);
  assert.ok(!keys(relevance(g(1, "CHI", "EDM"), ctx({ followedTeams: ["BOS"] }))).includes("followed"));
});

test("puck drop within 24 hours only for upcoming games inside the window", () => {
  assert.ok(keys(relevance(g(1, "CHI", "EDM"), ctx())).includes("soon"));
  assert.ok(!keys(relevance(g(1, "CHI", "EDM", { start: "2026-11-12T23:00:00Z" }), ctx())).includes("soon"));
  assert.ok(!keys(relevance(g(1, "CHI", "EDM", { state: "LIVE", period: 1, homeScore: 0, awayScore: 0 }), ctx())).includes("soon"));
});

test("division fact only when no favorite plays and both teams share a favorite's division", () => {
  const pac = teams.filter((t) => t.division === "Pacific").map((t) => t.id);
  const [a, b, c] = pac, other = teams.find((t) => t.division !== "Pacific").id;
  assert.ok(keys(relevance(g(1, a, b), ctx({ favorites: [c] }))).includes("division"));
  assert.ok(!keys(relevance(g(1, a, c), ctx({ favorites: [c] }))).includes("division")); // a favorite plays
  assert.ok(!keys(relevance(g(1, a, other), ctx({ favorites: [c] }))).includes("division"));
  assert.ok(!keys(relevance(g(1, a, b), ctx())).includes("division")); // no favorites
});

test("live heat: close and late is said, a blowout or an early game is not", () => {
  const live = (o) => g(1, "CHI", "EDM", { state: "LIVE", period: 3, periodType: "REG", clock: "04:00", homeScore: 2, awayScore: 2, ...o });
  assert.equal(relevance(live(), ctx()).reasons.find((r) => r.key === "live").text, "Tied · 3rd period");
  assert.ok(!keys(relevance(live({ homeScore: 5, awayScore: 1 }), ctx())).includes("live"));
  assert.ok(!keys(relevance(live({ period: 1 }), ctx())).includes("live"));
});

test("playoff-line gap reuses the insights wording", () => {
  const before = Object.fromEntries(teams.map((t, i) => [t.id, { gp: 20, w: 10, l: 10, ot: 0, pts: 20 + (i % 3), rw: 8, gf: 60, ga: 60, results: [] }]));
  const game = g(7, "CHI", "EDM");
  const r = relevance(game, ctx({ analysis: { before: { 7: before }, analysis: { 7: { score: 60 } } }, allGames: [game] }));
  const line = r.reasons.find((x) => x.key === "line");
  assert.ok(line, "a line fact exists for a bunched table");
  assert.match(line.text, /playoff line/);
  assert.ok(r.reasons.find((x) => x.key === "watch")?.text);
});

test("postponed, cancelled and finished games are never boosted", () => {
  for (const o of [{ scheduleState: "PPD" }, { scheduleState: "CNCL" }, { state: "FINAL", homeScore: 3, awayScore: 1 }]) {
    const r = relevance(g(1, "CHI", "EDM", o), ctx({ favorites: ["EDM"], saved: [1], followedTeams: ["CHI"] }));
    assert.deepEqual(r, { score: 0, reasons: [], explanation: "" });
  }
});

test("no favorites: only league-wide reasons, and the score is deterministic", () => {
  const game = g(1, "CHI", "EDM");
  const a = relevance(game, ctx()), b = relevance(game, ctx());
  assert.deepEqual(a, b);
  for (const k of keys(a)) assert.ok(["watch", "line", "live", "insight", "soon"].includes(k), k);
  assert.equal(hasContext(ctx()), false);
  assert.equal(hasContext(ctx({ saved: [3] })), true);
});

test("explanation: top reasons by points joined by ' · ', empty when nothing is true", () => {
  const r = relevance(g(1, "CHI", "EDM"), ctx({ favorites: ["EDM"], saved: [1] }));
  assert.equal(r.explanation, "Your team: EDM · Saved by you · Puck drop within 24 hours");
  assert.equal(relevance(g(1, "CHI", "EDM", { start: "2026-12-30T23:00:00Z" }), ctx()).explanation, "");
});

test("score is capped at 100 and ranking ties break by start then id", () => {
  const big = relevance(g(1, "CHI", "EDM", { state: "LIVE", period: 3, clock: "01:00", homeScore: 2, awayScore: 2 }), ctx({ favorites: ["EDM", "CHI"], saved: [1], followedTeams: ["EDM"] }));
  assert.ok(big.score <= 100 && big.score >= 80);
  const games = [g(9, "BOS", "TOR", { start: "2026-11-11T01:00:00Z" }), g(5, "NYR", "NJD", { start: "2026-11-11T01:00:00Z" }), g(7, "SEA", "VAN", { start: "2026-11-10T23:30:00Z" })];
  assert.deepEqual(rankGames(games, ctx()).map((x) => x.game.id), [7, 5, 9]);
});

test("rankGames: favorites first, called-off and final games dropped, horizon and limit honored", () => {
  const games = [
    g(1, "BOS", "TOR"), g(2, "CHI", "EDM"), g(3, "CHI", "EDM", { scheduleState: "PPD" }),
    g(4, "CHI", "EDM", { state: "FINAL", homeScore: 1, awayScore: 0 }), g(5, "CHI", "EDM", { start: "2026-12-30T23:00:00Z" }),
  ];
  const out = rankGames(games, ctx({ favorites: ["EDM"] }), { horizonDays: 7 });
  assert.deepEqual(out.map((x) => x.game.id), [2, 1]);
  assert.equal(rankGames(games, ctx({ favorites: ["EDM"] }), { horizonDays: 7, limit: 1 }).length, 1);
  assert.ok(rankGames(games, ctx({ saved: [5] }), { horizonDays: 7 }).some((x) => x.game.id === 5)); // saved beyond the horizon is kept
});
