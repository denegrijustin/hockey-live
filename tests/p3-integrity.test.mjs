// Phase 3 QA: recompute standings, summaries, trends and clinch labels from the RAW snapshot games with code that
// shares nothing with the app helpers, and compare for all 32 teams on every real season snapshot.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeSeason } from "../src/lib/model.mjs";
import { compareStandings, wildCardGroups, gapToLine, clinchStatus, pointsPct, streak as stStreak, lastN as stLast, withRow } from "../src/lib/standings-view.mjs";
import { teamSummary } from "../src/lib/team-summary.mjs";
import { teamResults, formLast, goalDiffTrend, homeAwaySplit, streak as trStreak } from "../src/lib/trends.mjs";
import { teamRanks } from "../src/lib/ranks.mjs";

const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const load = (s) => JSON.parse(readFileSync(new URL(`../public/data/seasons/${s}.json`, import.meta.url))).games;
const done = (g) => g.state === "OFF" || g.state === "FINAL";

/** Independent raw recomputation. */
function raw(games) {
  const T = Object.fromEntries(teams.map((t) => [t.id, { gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, rw: 0, row: 0, seq: [] }]));
  const ordered = games.filter((g) => g.type === 2 && done(g) && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) && g.homeScore !== g.awayScore)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const g of ordered) {
    const hw = g.homeScore > g.awayScore;
    for (const [id, f, a, win] of [[g.home, g.homeScore, g.awayScore, hw], [g.away, g.awayScore, g.homeScore, !hw]]) {
      const r = T[id]; r.gp++; r.gf += f; r.ga += a;
      let o;
      if (win) { r.w++; r.pts += 2; o = "W"; if (g.end === "REG") r.rw++; if (g.end !== "SO") r.row++; }
      else if (g.end === "OT" || g.end === "SO") { r.otl++; r.pts += 1; o = "OTL"; }
      else { r.l++; o = "L"; }
      r.seq.push(o);
    }
  }
  return T;
}
const better = (A, B, ida, idb) => {
  const pa = A.gp ? A.pts / (2 * A.gp) : 0, pb = B.gp ? B.pts / (2 * B.gp) : 0;
  if (pa !== pb) return pb - pa;
  if (A.rw !== B.rw) return B.rw - A.rw;
  if (A.row !== B.row) return B.row - A.row;
  if (A.gf - A.ga !== B.gf - B.ga) return (B.gf - B.ga) - (A.gf - A.ga);
  return teams.find((t) => t.id === ida).name.localeCompare(teams.find((t) => t.id === idb).name);
};
function rawGroups(T) {
  const out = {};
  for (const c of ["E", "W"]) {
    const ct = teams.filter((t) => t.conference === c), divisions = {}, auto = [];
    for (const d of [...new Set(ct.map((t) => t.division))]) {
      const top = ct.filter((t) => t.division === d).map((t) => t.id).sort((x, y) => better(T[x], T[y], x, y)).slice(0, 3);
      divisions[d] = top; auto.push(...top);
    }
    const rest = ct.map((t) => t.id).filter((i) => !auto.includes(i)).sort((x, y) => better(T[x], T[y], x, y));
    out[c] = { divisions, wc: rest.slice(0, 2), out: rest.slice(2) };
  }
  return out;
}

for (const season of ["20252026", "20262027"]) {
  const games = load(season);
  const { table } = analyzeSeason(games, teams);
  const T = raw(games);
  const rows = withRow(table, games);

  test(`${season}: model table equals raw recomputation for all 32 teams (gp/w/l/otl/pts/gf/ga/rw/ROW, P%)`, () => {
    assert.equal(Object.keys(table).length, 32);
    for (const t of teams) {
      const a = table[t.id], b = T[t.id];
      assert.deepEqual([a.gp, a.w, a.l, a.ot, a.pts, a.gf, a.ga, a.rw], [b.gp, b.w, b.l, b.otl, b.pts, b.gf, b.ga, b.rw], t.id);
      assert.equal(rows[t.id].row, b.row, `${t.id} ROW`);
      assert.equal(a.w * 2 + a.ot, a.pts); assert.equal(a.w + a.l + a.ot, a.gp);
      assert.equal(pointsPct(a), b.gp ? b.pts / (2 * b.gp) : null);
    }
    assert.equal(teams.reduce((s, t) => s + T[t.id].gf, 0), teams.reduce((s, t) => s + T[t.id].ga, 0));
  });

  test(`${season}: compareStandings order (league) equals raw order; antisymmetric`, () => {
    const mine = teams.map((t) => ({ ...rows[t.id], name: t.name })).sort(compareStandings).map((r) => r.id);
    const theirs = teams.map((t) => t.id).sort((x, y) => better(T[x], T[y], x, y));
    assert.deepEqual(mine, theirs);
    const ranks = teamRanks(table, teams);
    if (ranks) theirs.forEach((id, i) => assert.equal(ranks[id].league, i + 1, `${id} league rank`));
    for (const a of teams) for (const b of teams.slice(0, 6)) {
      const x = { ...rows[a.id], name: a.name }, y = { ...rows[b.id], name: b.name };
      assert.equal(Math.sign(compareStandings(x, y)) + 0, -Math.sign(compareStandings(y, x)) + 0);
    }
  });

  test(`${season}: wildCardGroups and gapToLine agree with raw`, () => {
    const g = wildCardGroups(rows, teams), R = rawGroups(T);
    for (const c of ["E", "W"]) {
      assert.deepEqual(g[c].divisions, R[c].divisions);
      assert.deepEqual(g[c].wildCard, R[c].wc);
      assert.deepEqual(g[c].out, R[c].out);
      assert.equal(Object.values(g[c].divisions).flat().length + g[c].wildCard.length, 8);
    }
    for (const t of teams) {
      const gap = gapToLine(rows, t.id, teams), grp = R[t.conference];
      const inn = [...Object.values(grp.divisions).flat(), ...grp.wc];
      const status = grp.wc[0] === t.id ? "wc1" : grp.wc[1] === t.id ? "wc2" : inn.includes(t.id) ? "in" : "out";
      assert.equal(gap.status, status, t.id);
      const ref = status === "out" ? grp.wc[1] : grp.out[0];
      assert.equal(gap.ref, ref);
      assert.equal(gap.pts, T[t.id].pts - T[ref].pts);
      const p = (i) => T[i].pts / (2 * T[i].gp);
      assert.ok(Math.abs(gap.pct - (p(t.id) - p(ref)) * 100) < 1e-9);
    }
  });

  test(`${season}: team-summary splits, last5/10, streak, form agree with raw`, () => {
    for (const t of teams) {
      const s = teamSummary(t.id, { teams, table, games });
      const b = T[t.id];
      if (!b.gp) { assert.equal(s, null); continue; }
      assert.deepEqual([s.gp, s.record.w, s.record.l, s.record.otl, s.points, s.gf, s.ga], [b.gp, b.w, b.l, b.otl, b.pts, b.gf, b.ga], t.id);
      assert.equal(s.pointsPct, b.pts / (2 * b.gp));
      const win = (n) => b.seq.slice(-n);
      const pts = (a) => a.reduce((x, o) => x + (o === "W" ? 2 : o === "OTL" ? 1 : 0), 0);
      assert.equal(s.last10.pts, pts(win(10)), `${t.id} last10 pts`);
      assert.equal(s.last10.gp, Math.min(10, b.gp));
      assert.equal(s.last5.w, win(5).filter((o) => o === "W").length);
      assert.deepEqual(s.form, win(5).reverse());
      const last = b.seq.at(-1); let n = 0; for (let i = b.seq.length - 1; i >= 0 && b.seq[i] === last; i--) n++;
      assert.deepEqual(s.streak, { type: last, count: n });
      assert.equal(s.home.gp + s.away.gp, b.gp, `${t.id} home+away gp`);
      assert.equal(s.home.pts + s.away.pts, b.pts);
      assert.equal(s.home.gf + s.away.gf, b.gf);
      const res = table[t.id].results;
      assert.equal(stStreak(res)?.count, n);
      assert.equal(stLast(res, 10).games, Math.min(10, b.gp));
    }
  });

  test(`${season}: trends agree with raw (completed type 2+3, windows, split, goal difference)`, () => {
    for (const t of teams) {
      const mine = games.filter((g) => (g.type === 2 || g.type === 3) && (g.home === t.id || g.away === t.id) && done(g) && g.homeScore !== g.awayScore)
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
      const rs = teamResults(games, t.id);
      assert.equal(rs.length, mine.length, t.id);
      if (mine.length < 3) continue;
      const f = formLast(rs, 10).value;
      const last = mine.slice(-10);
      let w = 0, l = 0, o = 0;
      for (const g of last) { const home = g.home === t.id, us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore; if (us > them) w++; else if (g.end === "REG") l++; else o++; }
      assert.deepEqual([f.w, f.l, f.otl, f.pts], [w, l, o, w * 2 + o], `${t.id} form10`);
      const gd = goalDiffTrend(rs).value;
      const total = mine.reduce((s, g) => s + (g.home === t.id ? g.homeScore - g.awayScore : g.awayScore - g.homeScore), 0);
      assert.equal(gd.total, total); assert.equal(gd.series.length, mine.length); assert.equal(gd.series.at(-1), total);
      const sp = homeAwaySplit(games, t.id).value;
      assert.equal(sp.home.gp + sp.away.gp, mine.length);
      assert.equal(sp.home.gp, mine.filter((g) => g.home === t.id).length);
      assert.equal(sp.home.gd + sp.away.gd, total);
      const s = trStreak(rs); const lastW = rs.at(-1).outcome === "W";
      let n = 0; for (let i = rs.length - 1; i >= 0 && (rs[i].outcome === "W") === lastW; i--) n++;
      assert.deepEqual(s, { kind: lastW ? "W" : "L", n });
    }
  });
}

// ---- clinch/elimination: independent re-implementation of the documented rule + Monte-Carlo soundness on truncated seasons ----
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
test("clinchStatus: matches documented rule and is SOUND under random play-outs (ties count against the team)", () => {
  const full = load("20252026").filter((g) => g.type === 2).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
  let nClinch = 0, nElim = 0;
  for (const frac of [0.5, 0.75, 0.85, 0.92, 0.97]) {
    const cut = Math.floor(full.length * frac);
    const games = full.map((g, i) => (i < cut ? g : { ...g, state: "FUT", homeScore: null, awayScore: null, end: "REG" }));
    const { table } = analyzeSeason(games, teams);
    const st = clinchStatus(table, games, teams);
    const rem = Object.fromEntries(teams.map((t) => [t.id, 0]));
    for (const g of games.slice(cut)) { rem[g.home]++; rem[g.away]++; }
    for (const t of teams) {
      const conf = teams.filter((x) => x.conference === t.conference && x.id !== t.id), own = conf.filter((x) => x.division === t.division);
      const mx = (id) => table[id].pts + 2 * rem[id];
      const reach = (l) => l.filter((x) => mx(x.id) >= table[t.id].pts).length;
      const clinched = reach(conf) <= 4 || reach(own) <= 2;
      let elim = false;
      if (!clinched) {
        const ab = (l) => l.filter((x) => table[x.id].pts > mx(t.id)).length;
        const a = ab(own);
        const bonus = [...new Set(conf.filter((x) => x.division !== t.division).map((x) => x.division))].reduce((s, d) => s + Math.max(0, ab(conf.filter((x) => x.division === d)) - 3), 0);
        elim = a >= 3 && Math.max(0, a - 3) + bonus >= 2;
      }
      assert.equal(st[t.id].status, clinched ? "clinched" : elim ? "eliminated" : null, `${frac} ${t.id}`);
      nClinch += clinched; nElim += elim;
    }
    const rnd = mulberry(Math.floor(frac * 1000));
    for (let sim = 0; sim < 300; sim++) {
      const pts = Object.fromEntries(teams.map((t) => [t.id, table[t.id].pts]));
      for (const g of games.slice(cut)) {
        const r = rnd(), hw = rnd() < 0.5;
        pts[hw ? g.home : g.away] += 2; if (r < 0.25) pts[hw ? g.away : g.home] += 1;
      }
      for (const t of teams) {
        const s = st[t.id].status; if (!s) continue;
        const conf = teams.filter((x) => x.conference === t.conference);
        const beats = (x, worstTies) => (worstTies ? pts[x] >= pts[t.id] : pts[x] > pts[t.id]);
        const makes = (worstTies) => {
          const divAhead = conf.filter((x) => x.division === t.division && x.id !== t.id && beats(x.id, worstTies)).length;
          if (divAhead < 3) return true;
          let wcAhead = 0;
          for (const d of [...new Set(conf.map((x) => x.division))]) {
            const ids = conf.filter((x) => x.division === d && x.id !== t.id).map((x) => x.id).sort((p, q) => pts[q] - pts[p]);
            wcAhead += ids.slice(3).filter((x) => beats(x, worstTies)).length;
          }
          return wcAhead < 2;
        };
        if (s === "clinched") assert.ok(makes(true), `unsound clinch ${frac} ${t.id}`);
        if (s === "eliminated") assert.ok(!makes(false), `unsound elimination ${frac} ${t.id}`);
      }
    }
  }
  assert.ok(nClinch + nElim > 0, "scenario produced no clinch/elim labels to test");
});
