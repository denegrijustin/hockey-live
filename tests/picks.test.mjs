import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impliedProb, fairProbs, winUnits, parseOdds, coverProb, candidates, choosePick, gradePick, calibratedChance, verdict, explainPick, summarize, weekOf, isCurrentSnapshot, updatePicks, MIN_EDGE, PRIOR_PICKS } from "../src/lib/picks.mjs";

const teams = JSON.parse(readFileSync("src/data/teams.json", "utf8"));

test("prices: implied chance, fair chance without the vig, and units won", () => {
  assert.ok(Math.abs(impliedProb(-110) - 0.5238) < 1e-3);
  assert.ok(Math.abs(impliedProb(150) - 0.4) < 1e-9);
  const [a, b] = fairProbs(-110, -110);
  assert.ok(Math.abs(a - 0.5) < 1e-9 && Math.abs(b - 0.5) < 1e-9);
  const [h, v] = fairProbs(-170, 142);
  assert.ok(Math.abs(h + v - 1) < 1e-9 && h > 0.6);
  assert.equal(winUnits(150), 1.5);
  assert.ok(Math.abs(winUnits(-200) - 0.5) < 1e-9);
});

const sample = { games: [{ gameId: 7, homeTeam: { abbrev: "CHI", odds: [{ description: "MONEY_LINE_2_WAY", value: 142, qualifier: "" }, { description: "PUCK_LINE", value: -180, qualifier: "+1.5" }, { description: "OVER_UNDER", value: -102, qualifier: "O6.5" }] }, awayTeam: { abbrev: "MTL", odds: [{ description: "MONEY_LINE_2_WAY", value: -170, qualifier: "" }, { description: "PUCK_LINE", value: 150, qualifier: "-1.5" }] } }, { gameId: 8, homeTeam: { odds: [] }, awayTeam: { odds: [] } }] };
test("the odds feed is read for the 2-way moneyline and the puck line, and nothing else", () => {
  const o = parseOdds(sample);
  assert.deepEqual(o[7].ml, { home: 142, away: -170 });
  assert.deepEqual(o[7].pl, { home: { line: 1.5, price: -180 }, away: { line: -1.5, price: 150 } });
  assert.equal(o[8].ml, null);
  assert.equal(o[8].pl, null);
  assert.deepEqual(parseOdds(null), {});
});

test("puck-line cover chances: -1.5 is harder than winning, +1.5 is easier, and the two sides add to one", () => {
  const m = { home: 3.1, away: 2.7 };
  const minus = coverProb("home", -1.5, m), plus = coverProb("home", 1.5, m), awayMinus = coverProb("away", -1.5, m);
  assert.ok(minus < 0.5 && plus > 0.5);
  assert.ok(Math.abs(coverProb("home", -1.5, m) + coverProb("away", 1.5, m) - 1) < 1e-9);
  assert.ok(awayMinus < minus);
});

const game = { id: 7, type: 2, season: 20262027, date: "2026-10-23", start: "2026-10-24T00:00:00Z", state: "FUT", home: "CHI", away: "MTL" };
const proj = { homeWin: 0.5, means: { home: 3.0, away: 3.0 } };
const odds = parseOdds(sample)[7];

test("a pick needs an edge of at least MIN_EDGE; the biggest edge wins; one pick per game", () => {
  const none = choosePick(game, { homeWin: 0.371, means: { home: 2.6, away: 3.2 } }, odds);
  assert.ok(!none || none.edge >= MIN_EDGE);
  const c = candidates(game, proj, odds);
  assert.equal(c.length, 4);
  const pick = choosePick(game, { homeWin: 0.62, means: { home: 3.4, away: 2.7 } }, odds); // the market likes MTL; the model likes CHI at +142
  assert.equal(pick.team, "CHI");
  assert.ok(pick.edge >= MIN_EDGE);
  assert.equal(pick.id, `7-${pick.kind}`);
  assert.equal(choosePick(game, null, odds), null);
  assert.equal(choosePick(game, proj, null), null);
});

test("grading: moneyline by the winner, puck line by the margin, units by the price", () => {
  const final = { ...game, state: "FINAL", homeScore: 3, awayScore: 2, end: "OT" };
  assert.equal(gradePick({ kind: "ml", side: "home", price: 142 }, final).result, "win");
  assert.equal(gradePick({ kind: "ml", side: "home", price: 142 }, final).units, 1.42);
  assert.equal(gradePick({ kind: "ml", side: "away", price: -170 }, final).units, -1);
  assert.equal(gradePick({ kind: "pl", side: "home", line: -1.5, price: 250 }, final).result, "loss"); // won by one
  assert.equal(gradePick({ kind: "pl", side: "away", line: 1.5, price: -180 }, final).result, "win"); // lost by one
  assert.equal(gradePick({ kind: "ml", side: "home", price: 100 }, { ...game, state: "LIVE" }), null);
});

test("calibration: no history means the market's chance; a bucket's record moves it a little; it stays inside 2-98%", () => {
  const pick = { edge: 0.06, fair: 0.5 };
  assert.equal(calibratedChance([], pick).chance, 0.5);
  const hist = (w, l) => [...Array(w).fill({ edge: 0.06, fair: 0.5, result: "win" }), ...Array(l).fill({ edge: 0.06, fair: 0.5, result: "loss" })];
  const good = calibratedChance(hist(60, 40), pick), bad = calibratedChance(hist(40, 60), pick);
  assert.ok(good.chance > 0.5 && good.chance < 0.5 + 10 / (100 + PRIOR_PICKS) + 1e-9); // 10 wins over expectation, spread over 200
  assert.ok(bad.chance < 0.5);
  assert.equal(good.n, 100);
  assert.ok(calibratedChance(hist(5000, 0), pick).chance <= 0.98);
  assert.equal(calibratedChance(hist(60, 40), { edge: 0.02, fair: 0.5 }).chance <= 0.98, true);
});

test("verdicts: 53% at -110 reads as a thin edge, not a lock", () => {
  assert.equal(verdict(0.53, -110), "Thin edge");
  assert.equal(verdict(0.5, -110), "No edge after the price");
  assert.equal(verdict(0.55, -110), "Clear edge");
  assert.equal(verdict(0.6, -110), "Strong edge");
});

test("a graded pick is explained in plain English", () => {
  const names = { home: "Blackhawks", away: "Canadiens" };
  const base = { kind: "ml", side: "home", price: 142, model: 0.52, fair: 0.4 };
  const won = explainPick(base, { result: "win", margin: 1 }, { homeScore: 3, awayScore: 2, end: "OT", homeShots: 20, awayShots: 31 }, names);
  assert.match(won, /^Won: Blackhawks beat Canadiens 3–2 in overtime at \+142\./);
  assert.match(won, /outshot 31–20/);
  assert.match(won, /model had 52% against the market's 40%/);
  const lost = explainPick(base, { result: "loss", margin: -2 }, { homeScore: 1, awayScore: 3, end: "REG", homeShots: 33, awayShots: 21 }, names);
  assert.match(lost, /^Missed: Blackhawks lost 1–3/);
  assert.match(lost, /Outshooting a team and still losing happens/);
  const pl = explainPick({ ...base, kind: "pl", line: -1.5, price: 250 }, { result: "loss", margin: 1 }, { homeScore: 3, awayScore: 2, end: "REG" }, names);
  assert.match(pl, /needed two goals to cover/);
});

test("the record is honest: too few picks, behind the line, and ahead are each said plainly; weeks and the running total add up", () => {
  const pick = (date, result, price = -110, id = date + result) => ({ id, date, price, result, units: result === "win" ? winUnits(price) : -1 });
  assert.equal(weekOf("2026-10-23"), "2026-10-19"); // a Friday belongs to the week starting Monday the 19th
  assert.equal(weekOf("2026-10-25"), "2026-10-19");
  assert.equal(weekOf("2026-10-26"), "2026-10-26");
  const few = summarize([pick("2026-10-20", "win"), pick("2026-10-21", "loss")]);
  assert.match(few.honest, /Only 2 graded picks/);
  assert.equal(few.series.length, 1);
  assert.ok(Math.abs(few.units - (100 / 110 - 1)) < 1e-9);
  const many = (w, l) => [...Array(w).fill(0).map((_, i) => pick("2026-10-2" + (i % 9), "win", -110, "w" + i)), ...Array(l).fill(0).map((_, i) => pick("2026-11-0" + (1 + (i % 9)), "loss", -110, "l" + i))];
  assert.match(summarize(many(30, 70)).honest, /behind the line/);
  assert.match(summarize(many(55, 45)).honest, /No proof/);
  assert.match(summarize(many(160, 100)).honest, /encouraging/);
  const s = summarize(many(10, 25));
  assert.equal(s.series.at(-1).total, s.units);
  assert.equal(s.series.reduce((n, r) => n + r.w + r.l, 0), 35);
});

test("a refresh grades finished picks, logs only unstarted games with odds, never changes a logged pick, and rebuilds a snapshot that is missing a section", () => {
  const now = Date.parse("2026-10-23T15:30:00Z");
  const mk = (id, state, start, h = null, a = null) => ({ id, type: 2, season: 20262027, date: "2026-10-23", start, state, home: "CHI", away: "MTL", homeScore: h, awayScore: a, end: state === "FINAL" ? "REG" : "" });
  const prior = Array.from({ length: 30 }, (_, i) => ({ ...mk(100 + i, "FINAL", `2026-10-${String(1 + (i % 20)).padStart(2, "0")}T23:00:00Z`, 3, 2), date: `2026-10-${String(1 + (i % 20)).padStart(2, "0")}`, home: teams[i % 32].id, away: teams[(i + 7) % 32].id }));
  const games = [...prior, mk(7, "FUT", "2026-10-24T00:00:00Z"), mk(8, "FUT", "2026-10-24T00:00:00Z"), mk(9, "LIVE", "2026-10-23T14:00:00Z", 1, 0)];
  const oddsAll = { 7: odds, 9: odds };
  const first = updatePicks({ season: 20262027, games, odds: oddsAll, existing: null, teams, now });
  assert.equal(first.snapshot.schema, 1);
  assert.ok(first.snapshot.picks.every((p) => p.gameId === 7)); // 8 has no odds, 9 already started
  const logged = first.snapshot.picks[0];
  if (logged) {
    // Odds move and the game ends: the pick keeps its logged price and gets graded.
    const moved = { 7: { ...odds, ml: { home: 100, away: -110 } } };
    const done = games.map((g) => (g.id === 7 ? { ...g, state: "FINAL", homeScore: 4, awayScore: 1 } : g));
    const second = updatePicks({ season: 20262027, games: done, odds: moved, existing: first.snapshot, teams, now: now + 3600000 * 12 });
    const same = second.snapshot.picks.find((p) => p.id === logged.id);
    assert.equal(same.price, logged.price);
    assert.ok(same.result === "win" || same.result === "loss");
    assert.equal(second.graded, 1);
  }
  assert.equal(isCurrentSnapshot(first.snapshot, 20262027), true);
  assert.equal(isCurrentSnapshot({ ...first.snapshot, picks: undefined }, 20262027), false); // a snapshot missing its picks is not current
  assert.equal(isCurrentSnapshot({ ...first.snapshot, schema: 0 }, 20262027), false);
  assert.equal(isCurrentSnapshot(first.snapshot, 20252026), false);
  const rebuilt = updatePicks({ season: 20262027, games, odds: oddsAll, existing: { ...first.snapshot, picks: undefined }, teams, now });
  assert.equal(rebuilt.snapshot.schema, 1);
  assert.ok(Array.isArray(rebuilt.snapshot.picks));
});

import { refreshPicks, picksKey, emptyPicks } from "../src/lib/picks-refresh.mjs";

test("the Worker refresh reads, updates and stores only when something changed", async () => {
  const kv = new Map(), puts = [];
  const store = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { puts.push(k); kv.set(k, JSON.parse(JSON.stringify(v))); } };
  const now = Date.parse("2026-10-23T15:30:00Z");
  const games = [{ id: 7, type: 2, season: 20262027, date: "2026-10-23", start: "2026-10-24T00:00:00Z", state: "FUT", home: "CHI", away: "MTL", homeScore: null, awayScore: null }];
  const args = { season: 20262027, store, teams, now, loadGames: async () => games, loadOdds: async () => sample, loadBaseline: async () => ({}) };
  const a = await refreshPicks(args);
  assert.equal(a.rebuilt, true); // the first run builds the snapshot
  assert.equal(puts.length, 1);
  const b = await refreshPicks(args);
  assert.equal(b.rebuilt, false);
  assert.equal(b.added, 0);
  assert.equal(puts.length, 1); // nothing changed: no write
  await refreshPicks({ ...args, loadOdds: async () => { throw new Error("down"); } }); // the odds feed being down is not an error
  assert.equal(emptyPicks(20262027).picks.length, 0);
  assert.equal(picksKey(20262027), "picks-v1-20262027");
});
