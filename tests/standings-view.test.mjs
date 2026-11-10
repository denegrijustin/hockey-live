import test from "node:test";
import assert from "node:assert/strict";
import {
  pointsPct, compareStandings, streak, lastN, gamesInHand, wildCardGroups, gapToLine, clinchStatus, rowByTeam, withRow,
} from "../src/lib/standings-view.mjs";
import { teamRanks } from "../src/lib/ranks.mjs";

const row = (id, o = {}) => ({ id, gp: 10, w: 0, l: 0, ot: 0, pts: 10, gf: 30, ga: 30, rw: 3, results: [], ...o });
const res = (...o) => o.map((outcome) => ({ outcome }));

test("pointsPct is pts/(2gp) and null at gp 0 or missing row", () => {
  assert.equal(pointsPct(row("A", { gp: 10, pts: 15 })), 0.75);
  assert.equal(pointsPct(row("A", { gp: 0, pts: 0 })), null);
  assert.equal(pointsPct(null), null);
});

test("compareStandings: pct, then RW, then ROW (only when both have it), then GD, then name", () => {
  const sort = (rows) => [...rows].sort(compareStandings).map((r) => r.id);
  // fewer games but better pct ranks ahead of more points
  assert.deepEqual(sort([row("A", { gp: 12, pts: 16 }), row("B", { gp: 10, pts: 15 })]), ["B", "A"]);
  // equal pct: regulation wins decide
  assert.deepEqual(sort([row("A", { rw: 3 }), row("B", { rw: 5 })]), ["B", "A"]);
  // equal pct and RW: ROW decides when both known, skipped when one is missing
  assert.deepEqual(sort([row("A", { row: 4 }), row("B", { row: 6 })]), ["B", "A"]);
  assert.deepEqual(sort([row("A", { row: 4, ga: 20 }), row("B", { ga: 25 })]), ["A", "B"]);
  // then goal differential, then name
  assert.deepEqual(sort([row("A", { ga: 31 }), row("B", { ga: 28 })]), ["B", "A"]);
  assert.deepEqual(sort([row("B"), row("A")]), ["A", "B"]);
  // GP=0 teams are comparable and null-safe
  assert.deepEqual(sort([row("B", { gp: 0, pts: 0 }), row("A", { gp: 3, pts: 4 })]), ["A", "B"]);
  assert.equal(compareStandings(undefined, undefined), 0);
});

test("rowByTeam counts regulation and overtime wins but not shootout wins", () => {
  const g = (home, away, hs, as, end, state = "OFF", type = 2) => ({ home, away, homeScore: hs, awayScore: as, end, state, type });
  const r = rowByTeam([g("A", "B", 3, 1, "REG"), g("B", "A", 3, 2, "OT"), g("A", "B", 2, 1, "SO"), g("A", "B", 4, 1, "REG", "FUT"), g("A", "B", 4, 1, "REG", "OFF", 3)], ["A", "B"]);
  assert.deepEqual(r, { A: 1, B: 1 });
  assert.equal(withRow({ A: row("A") }, [g("A", "B", 3, 1, "REG")]).A.row, 1);
});

test("streak labels W/L/OT runs and handles empty and short histories", () => {
  assert.equal(streak([]), null);
  assert.equal(streak(null), null);
  assert.equal(streak(res("L", "W", "W", "W")).label, "W3");
  assert.equal(streak(res("W", "L", "L")).label, "L2");
  assert.equal(streak(res("W", "L", "OT")).label, "OT1");
  assert.equal(streak(res("OT", "L")).label, "L1");
  assert.equal(streak(res("W")).count, 1);
});

test("lastN returns W-L-OTL over at most n results", () => {
  assert.equal(lastN([], 10), null);
  assert.equal(lastN(res("W", "W", "L"), 10).label, "2-1-0");
  const long = res(...Array(5).fill("L"), "W", "W", "OT", "W", "L", "W", "W", "OT", "L", "W");
  const l = lastN(long, 10);
  assert.deepEqual([l.w, l.l, l.ot, l.games], [6, 2, 2, 10]);
  assert.equal(l.label, "6-2-2");
});

test("gamesInHand is relative to the most-played team by default", () => {
  const t = { A: row("A", { gp: 10 }), B: row("B", { gp: 8 }), C: row("C", { gp: 0 }) };
  assert.equal(gamesInHand(t, "B"), 2);
  assert.equal(gamesInHand(t, "A"), 0);
  assert.equal(gamesInHand(t, "B", 9), 1);
  assert.equal(gamesInHand(t, "A", 8), 0);
  assert.equal(gamesInHand(t, "Z"), null);
});

// Ten-team fixture: one conference, two divisions of five. pts decide (gp equal).
const teams = [
  ...["A1", "A2", "A3", "A4", "A5"].map((id) => ({ id, name: id, division: "Atl", conference: "E" })),
  ...["M1", "M2", "M3", "M4", "M5"].map((id) => ({ id, name: id, division: "Met", conference: "E" })),
];
const mk = (pts) => Object.fromEntries(Object.entries(pts).map(([id, p]) => [id, row(id, { pts: p, gp: 20 })]));

test("wildCardGroups: top 3 per division, then best two of the rest, rest are out", () => {
  const table = mk({ A1: 30, A2: 28, A3: 20, A4: 27, A5: 10, M1: 31, M2: 25, M3: 24, M4: 19, M5: 12 });
  // pts order: A1 30, A2 28, A4 27 are Atl top 3 (A3 20 is 4th? no)
  const g = wildCardGroups(table, teams).E;
  assert.deepEqual(g.divisions.Atl, ["A1", "A2", "A4"]);
  assert.deepEqual(g.divisions.Met, ["M1", "M2", "M3"]);
  assert.deepEqual(g.wildCard, ["A3", "M4"]);
  assert.deepEqual(g.out, ["M5", "A5"]);
});

test("wildCardGroups: a division can send 5 teams (3 + two wild cards) and a team one point out stays out", () => {
  const table = mk({ A1: 40, A2: 39, A3: 38, A4: 37, A5: 36, M1: 50, M2: 49, M3: 48, M4: 35, M5: 34 });
  // M4/M5 are rest-of-conf; A4 37 and A5 36 are wild cards, M4 35 is one point out, so M-division 4th/5th beat M3 in points but M3 is a division qualifier
  const g = wildCardGroups(table, teams).E;
  assert.deepEqual(g.wildCard, ["A4", "A5"]);
  assert.deepEqual(g.out, ["M4", "M5"]);
  const gm = gapToLine(table, "M4", teams);
  assert.deepEqual([gm.status, gm.ref, gm.pts, Math.round(gm.pct * 10) / 10], ["out", "A5", -1, -2.5]);
  assert.equal(gapToLine(table, "A5", teams).status, "wc2");
  assert.equal(gapToLine(table, "A5", teams).pts, 1);
  assert.equal(gapToLine(table, "M3", teams).status, "in");
  assert.equal(gapToLine(table, "nope", teams), null);
});

test("wildCardGroups tolerates empty input", () => {
  assert.deepEqual(wildCardGroups({}, []), {});
  const g = wildCardGroups({}, teams).E;
  assert.equal(g.wildCard.length, 2);
});

const game = (home, away, state = "FUT", extra = {}) => ({ type: 2, home, away, state, homeScore: null, awayScore: null, ...extra });

test("clinchStatus is null without a schedule and when a team has no row", () => {
  const table = mk({ A1: 99, A2: 0, A3: 0, A4: 0, A5: 0, M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 });
  assert.equal(clinchStatus(table, [], teams).A1.status, null);
  assert.equal(clinchStatus({ A1: table.A1 }, [game("A1", "A2")], teams).A1.status, null);
  assert.equal(clinchStatus(table, [game("A1", "A2")], teams).A1.basis, "computed");
});

test("clinchStatus clinches when at most four others can still reach the points, eliminates when out of reach", () => {
  // season over for everyone except one postponed game (ignored): E conference
  const table = mk({ A1: 90, A2: 85, A3: 80, A4: 75, A5: 70, M1: 88, M2: 60, M3: 50, M4: 40, M5: 30 });
  const sched = [game("A1", "M1", "OFF"), game("A5", "M5", "PPD", { scheduleState: "PPD" })];
  const s = clinchStatus(table, sched, teams);
  // A1: nobody can exceed (max=pts since no remaining) but 90 is caught by none -> clinched
  assert.equal(s.A1.status, "clinched");
  // M1 88: only A1 (90) above, others below -> clinched
  assert.equal(s.M1.status, "clinched");
  // A5 70: 3 own-division above (A1..A4 above its max 70) -> a=4, a-3=1, other division teams above 70: M1 88 only; per division max(0,1-3)=0 -> total 1 <2 -> not eliminated
  assert.equal(s.A5.status, null);
  // M5 30: own division M1-M4 above (4), a-3=1, Atl has 5 above max(0,5-3)=2 -> eliminated
  assert.equal(s.M5.status, "eliminated");
  // A4 75: only A1, A2, A3, M1 can reach it (four) -> clinched
  assert.equal(s.A4.status, "clinched");
});

test("clinchStatus stays null while remaining games leave the team catchable, and live games count as remaining", () => {
  const table = mk({ A1: 50, A2: 50, A3: 50, A4: 50, A5: 50, M1: 50, M2: 50, M3: 50, M4: 50, M5: 50 });
  const sched = teams.map((t) => game(t.id, "X"));
  const s = clinchStatus(table, sched, teams);
  assert.ok(Object.values(s).every((v) => v.status === null));
  // everything finished but one live game: the live team still counts as having a game left
  const done = teams.map((t) => game(t.id, "X", "OFF"));
  done.push(game("M5", "X", "LIVE"));
  const t2 = mk({ A1: 90, A2: 90, A3: 90, A4: 90, A5: 90, M1: 90, M2: 90, M3: 90, M4: 90, M5: 89 });
  const s2 = clinchStatus(t2, done, teams);
  assert.equal(s2.A1.status, null); // 5 others tie or can reach it
});

test("teamRanks keeps points-percentage ordering with regulation wins as the tiebreak (no points tiebreak)", () => {
  const ts = [{ id: "A", division: "d", conference: "E" }, { id: "B", division: "d", conference: "E" }];
  const table = {
    A: row("A", { gp: 10, pts: 12, rw: 2 }),
    B: row("B", { gp: 20, pts: 24, rw: 5 }),
  };
  // same pct 0.6; B has more regulation wins -> B first (previously more points also put B first)
  const r = teamRanks(table, ts);
  assert.equal(r.B.league, 1);
  assert.equal(r.A.league, 2);
  // fully tied rows still share a rank
  const tie = teamRanks({ A: row("A"), B: row("B") }, ts);
  assert.equal(tie.A.league, 1);
  assert.equal(tie.B.league, 1);
});
