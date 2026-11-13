import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankStandings, applyResult } from "../src/lib/model.mjs";
import { simulatePlayoffs, chancesForCards } from "../src/lib/playoff-sim.mjs";

const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const season = JSON.parse(readFileSync(new URL("../public/data/seasons/20252026.json", import.meta.url)));
const tableOf = (games) => {
  const t = blankStandings(teams);
  [...games].sort((a, b) => a.start.localeCompare(b.start)).forEach((g) => applyResult(t, g));
  return t;
};
// NHL format field, mirroring model.mjs playoffField (not exported there).
function field(table) {
  const q = new Set();
  const order = (a, b) => table[b.id].pts - table[a.id].pts || table[b.id].rw - table[a.id].rw;
  for (const c of ["E", "W"]) {
    const ct = teams.filter((t) => t.conference === c), auto = new Set();
    for (const d of new Set(ct.map((t) => t.division)))
      ct.filter((t) => t.division === d).sort(order).slice(0, 3).forEach((t) => auto.add(t.id));
    auto.forEach((i) => q.add(i));
    ct.filter((t) => !auto.has(t.id)).sort(order).slice(0, 2).forEach((t) => q.add(t.id));
  }
  return q;
}
const reg = season.games.filter((g) => g.type === 2);
const CUT = "2026-01-15";
const replay = season.games.map((g) =>
  g.type === 2 && g.date > CUT ? { ...g, state: "FUT", homeScore: null, awayScore: null, end: "" } : g);
const midTable = tableOf(replay);
const prior = (() => {
  try {
    const p = JSON.parse(readFileSync(new URL("../public/data/seasons/20242025.json", import.meta.url)));
    return tableOf(p.games);
  } catch { return {}; }
})();

test("deterministic with fixed seed, differs across seeds", () => {
  const a = simulatePlayoffs({ games: replay, teams, table: midTable, sims: 500, seed: 7 });
  const b = simulatePlayoffs({ games: replay, teams, table: midTable, sims: 500, seed: 7 });
  const c = simulatePlayoffs({ games: replay, teams, table: midTable, sims: 500, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.teams, c.teams);
});

test("probabilities are coherent", () => {
  const r = simulatePlayoffs({ games: replay, teams, table: midTable, sims: 3000 });
  assert.equal(r.complete, false);
  assert.ok(r.remainingGames > 500);
  let total = 0;
  const conf = { E: 0, W: 0 };
  for (const t of teams) {
    const x = r.teams[t.id];
    const sum = x.pDivision[0] + x.pDivision[1] + x.pDivision[2] + x.pWildCard[0] + x.pWildCard[1] + x.pMiss;
    assert.ok(Math.abs(sum - 100) < 1e-6, `${t.id} sums to ${sum}`);
    total += x.pPlayoffs; conf[t.conference] += x.pPlayoffs;
  }
  assert.ok(Math.abs(total - 1600) < 1e-6);
  assert.ok(Math.abs(conf.E - 800) < 1e-6 && Math.abs(conf.W - 800) < 1e-6);
  const pres = teams.reduce((s, t) => s + r.teams[t.id].pPresidents, 0);
  assert.ok(Math.abs(pres - 100) < 1e-6);
});

test("finished season returns the actual field with exact 0/100", () => {
  const table = tableOf(season.games);
  const r = simulatePlayoffs({ games: season.games, teams, table });
  assert.equal(r.complete, true);
  assert.equal(r.remainingGames, 0);
  const actual = field(table);
  assert.equal(actual.size, 16);
  for (const t of teams) {
    assert.equal(r.teams[t.id].pPlayoffs, actual.has(t.id) ? 100 : 0, t.id);
    assert.equal(r.teams[t.id].pMiss, actual.has(t.id) ? 0 : 100);
  }
  const cards = chancesForCards(r, teams);
  assert.equal(cards[[...actual][0]].chance, 100);
});

test("mid-season replay: eventual qualifiers score higher; leaders beat laggards", () => {
  const actual = field(tableOf(season.games));
  const r = simulatePlayoffs({ games: replay, teams, table: midTable, baseline: prior, sims: 10000 });
  const avg = (ids) => ids.reduce((s, i) => s + r.teams[i].pPlayoffs, 0) / ids.length;
  const inIds = teams.filter((t) => actual.has(t.id)).map((t) => t.id);
  const outIds = teams.filter((t) => !actual.has(t.id)).map((t) => t.id);
  const [a, b] = [avg(inIds), avg(outIds)];
  console.log(`mid-season sanity: qualifiers avg ${a.toFixed(1)}%, non-qualifiers avg ${b.toFixed(1)}%`);
  assert.ok(a > b + 20);
  const sorted = [...teams].sort((x, y) => midTable[y.id].pts - midTable[x.id].pts);
  const top = sorted[0].id, bottom = sorted[sorted.length - 1].id;
  assert.ok(r.teams[top].pPlayoffs > r.teams[bottom].pPlayoffs);
  assert.ok(r.teams[top].expPts > r.teams[bottom].expPts);
  for (const c of Object.values(chancesForCards(r, teams))) assert.ok(c.chance >= 1 && c.chance <= 99);
});

test("20,000 sims over a full remaining slate finish well under 3 s", () => {
  const blank = blankStandings(teams);
  const all = reg.map((g) => ({ ...g, state: "FUT", homeScore: null, awayScore: null }));
  const t0 = performance.now();
  const r = simulatePlayoffs({ games: all, teams, table: blank, sims: 20000 });
  const ms = performance.now() - t0;
  console.log(`speed: ${r.remainingGames} games x 20000 sims in ${ms.toFixed(0)} ms`);
  assert.ok(r.remainingGames > 1200);
  assert.ok(ms < 3000);
});

test("the playoff rounds: 16 teams, 8 win round 1, 4 win round 2, 2 win the conference, 1 wins the Cup; only a playoff team can advance", () => {
  const t = tableOf(replay.filter((g) => g.type === 2));
  const r = simulatePlayoffs({ games: replay, teams, table: t, sims: 6000, seed: 3 });
  const sum = (k) => Object.values(r.teams).reduce((x, o) => x + o[k], 0);
  assert.ok(Math.abs(sum("pPlayoffs") - 1600) < 1e-6);
  assert.ok(Math.abs(sum("pRound2") - 800) < 1e-6);
  assert.ok(Math.abs(sum("pRound3") - 400) < 1e-6);
  assert.ok(Math.abs(sum("pFinal") - 200) < 1e-6);
  assert.ok(Math.abs(sum("pCup") - 100) < 1e-6);
  for (const o of Object.values(r.teams)) {
    // each round is reached only from the one before, so the chances can only fall
    assert.ok(o.pRound2 <= o.pPlayoffs + 1e-9 && o.pRound3 <= o.pRound2 + 1e-9 && o.pFinal <= o.pRound3 + 1e-9 && o.pCup <= o.pFinal + 1e-9);
  }
  // each conference sends exactly one team to the Final
  for (const c of ["E", "W"]) assert.ok(Math.abs(teams.filter((x) => x.conference === c).reduce((x, tm) => x + r.teams[tm.id].pFinal, 0) - 100) < 1e-6);
});

test("a stronger team is likelier to win the Cup; the same seed gives the same answer; a league that is not two conferences of two divisions has no rounds", () => {
  const t = tableOf(replay.filter((g) => g.type === 2));
  const a = simulatePlayoffs({ games: replay, teams, table: t, sims: 4000, seed: 5 }), b = simulatePlayoffs({ games: replay, teams, table: t, sims: 4000, seed: 5 });
  assert.deepEqual(a.teams.COL, b.teams.COL);
  const ids = Object.keys(a.teams), byPts = [...ids].sort((x, y) => t[y].pts - t[x].pts), best = byPts.slice(0, 4), worst = byPts.slice(-8);
  const avg = (xs) => xs.reduce((s, id) => s + a.teams[id].pCup, 0) / xs.length;
  assert.ok(avg(best) > avg(worst) * 3, "the top four by points are far likelier to win it than the bottom eight");
  const toy = simulatePlayoffs({ games: [], teams: [{ id: "X", conference: "E", division: "A" }, { id: "Y", conference: "W", division: "B" }], table: {}, sims: 50, seed: 1 });
  assert.equal(toy.teams.X.pCup, null);
});
