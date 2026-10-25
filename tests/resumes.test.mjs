import test from "node:test";
import assert from "node:assert/strict";
import { buildResumes } from "../src/lib/resumes.mjs";
import { blankStandings, applyResult } from "../src/lib/model.mjs";

const teams = ["AAA", "BBB", "CCC", "DDD"].map((id) => ({ id, name: id, short: id, division: "Atlantic", conference: "E" }));
let n = 0;
const g = (home, away, hs, as, end = "REG", day = 1) => ({ id: ++n, type: 2, state: "FINAL", date: `2026-10-${String(day).padStart(2, "0")}`, home, away, homeScore: hs, awayScore: as, end });
const games = [g("AAA", "BBB", 3, 1, "REG", 1), g("AAA", "CCC", 4, 2, "REG", 2), g("AAA", "DDD", 2, 1, "OT", 3), g("BBB", "CCC", 3, 2, "REG", 4), g("BBB", "DDD", 5, 1, "REG", 5), g("CCC", "DDD", 2, 1, "REG", 6), g("DDD", "AAA", 4, 3, "REG", 7)];
let table = blankStandings(teams);
for (const x of games) table = applyResult(table, x) ?? table;

test("a resumé lists the best wins by opponent strength, the losses, and the ranks", () => {
  const rows = buildResumes({ teams, table, games });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.rank), [...rows.map((r) => r.rank)].sort((a, b) => a - b)); // sorted best first
  const a = rows.find((r) => r.team === "AAA");
  assert.equal(a.bestWins.length, 3);
  assert.ok(a.bestWins[0].oppRank <= a.bestWins[1].oppRank && a.bestWins[1].oppRank <= a.bestWins[2].oppRank);
  assert.equal(a.lossCount, 1);
  assert.equal(a.losses[0].opp, "DDD");
  assert.equal(a.losses[0].home, false); // a road loss
  for (const r of rows) for (const k of ["sos", "off", "def"]) assert.ok(r[k].rank >= 1 && r[k].rank <= 4);
  assert.ok(rows.filter((r) => r.off.rank === 1).length >= 1); // ties share a rank
});

test("a loss to a team ranked in the bottom ten is a bad loss", () => {
  const rows = buildResumes({ teams, table, games, badFrom: 4 });
  const last = rows.at(-1).team;
  const lossesToLast = rows.flatMap((r) => r.losses.filter((l) => l.opp === last));
  assert.ok(lossesToLast.every((l) => l.bad));
  assert.ok(rows.flatMap((r) => r.losses).filter((l) => l.opp !== last).every((l) => !l.bad));
});

test("overtime results are tagged, and no table means no resumés", () => {
  const rows = buildResumes({ teams, table, games });
  assert.ok(rows.find((r) => r.team === "AAA").bestWins.some((w) => w.end === "OT"));
  assert.deepEqual(buildResumes({ teams, table: blankStandings(teams), games: [] }), []);
});
