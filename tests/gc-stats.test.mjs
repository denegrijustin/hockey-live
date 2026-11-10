import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeBoxscore } from "../src/lib/normalize.mjs";
import { comparisonRows, periodRows, skaterLines, goalieLines, sortLines, notablePerformances, savePct, fmtSv, toiSeconds, DASH } from "../src/lib/gc-stats.mjs";

const sample = JSON.parse(readFileSync(new URL("./fixtures/boxscore-sample.json", import.meta.url), "utf8"));
const full = normalizeBoxscore(sample.boxscore, sample.rightRail);
const bare = normalizeBoxscore(sample.boxscore);

test("normalizeBoxscore adds official team stats and periods from the real sample (away CAR, home VGK)", () => {
  assert.equal(full.teams.away.sog, 23);
  assert.equal(full.teams.home.sog, 22);
  assert.equal(full.teams.away.faceoffPct, 52.4);
  assert.deepEqual(full.teams.home.powerPlay, { goals: 0, opportunities: 3, pct: 0 });
  assert.equal(full.teams.home.hits, 39);
  assert.equal(full.teams.away.takeaways, 10);
  assert.equal(full.teamSource.hits, "official");
  assert.equal(full.periods.length, 3);
  assert.deepEqual(full.periods[0].shots, { home: 11, away: 8 });
  assert.deepEqual(full.periods[2].goals, { home: 0, away: 1 });
  assert.equal(full.players.length, bare.players.length);
});
test("without right-rail: sog official, hits/pim derived from player lines, PP/faceoff/periods null", () => {
  assert.equal(bare.teams.away.sog, 23);
  assert.equal(bare.teamSource.sog, "official");
  assert.equal(bare.teamSource.hits, "derived");
  assert.equal(bare.teams.home.powerPlay, null);
  assert.equal(bare.teams.home.faceoffPct, null);
  assert.equal(bare.periods, null);
  const sumHits = bare.players.filter((p) => p.team === "VGK").reduce((a, p) => a + (p.hits ?? 0), 0);
  assert.equal(bare.teams.home.hits, sumHits);
});
test("comparisonRows: values, lowerBetter, bar flags, dash for missing", () => {
  const rows = Object.fromEntries(comparisonRows(full).map((r) => [r.key, r]));
  assert.equal(rows.sog.bar, true);
  assert.equal(rows.powerPlay.awayText, "0/3");
  assert.equal(rows.pim.lowerBetter, true);
  assert.equal(rows.pim.leader, null);
  assert.equal(rows.hits.leader, "home");
  assert.equal(rows.giveaways.leader, "away"); // fewer giveaways is better: 16 < 19
  assert.equal(rows.faceoffPct.awayText, "52.4%");
  const empty = Object.fromEntries(comparisonRows(null).map((r) => [r.key, r]));
  assert.equal(empty.hits.awayText, DASH);
  assert.equal(empty.hits.bar, false);
  assert.equal(empty.powerPlay.homeText, DASH);
});
test("periodRows official, and derived from plays (shootout excluded)", () => {
  const o = periodRows(full, [], "VGK", "CAR");
  assert.equal(o.source, "official");
  assert.deepEqual(o.total.shots, { home: 22, away: 23 });
  assert.deepEqual(o.total.goals, { home: 0, away: 3 });
  const plays = [
    { period: 1, periodType: "REG", type: "shot-on-goal", team: "CAR" },
    { period: 1, periodType: "REG", type: "goal", team: "CAR" },
    { period: 2, periodType: "REG", type: "shot-on-goal", team: "VGK" },
    { period: 3, periodType: "SO", type: "goal", team: "VGK" },
    { period: 2, periodType: "REG", type: "hit", team: "VGK" },
  ];
  const d = periodRows(bare, plays, "VGK", "CAR");
  assert.equal(d.source, "derived");
  assert.deepEqual(d.rows.map((r) => r.label), ["1", "2"]);
  assert.deepEqual(d.rows[0].shots, { home: 0, away: 2 });
  assert.deepEqual(d.rows[0].goals, { home: 0, away: 1 });
  assert.equal(periodRows(bare, [], "VGK", "CAR").source, null);
});
test("skater and goalie lines: points computed, SV% computed, bench goalie excluded", () => {
  const sk = skaterLines(full, "CAR");
  assert.ok(sk.length >= 12);
  for (const s of sk) assert.equal(s.points, (s.goals ?? 0) + (s.assists ?? 0));
  for (const team of ["CAR", "VGK"]) {
    const g = goalieLines(full, team);
    assert.equal(g.length, 1);
    assert.ok(g[0].toiSec > 0);
    assert.equal(g[0].savePct, savePct(g[0].saves, g[0].shotsAgainst));
  }
  assert.equal(skaterLines(full, "VGK").some((p) => p.position === "G"), false);
});
test("savePct and formatting", () => {
  assert.equal(savePct(20, 0), null);
  assert.equal(savePct(null, 5), null);
  assert.equal(fmtSv(23 / 25), ".920");
  assert.equal(fmtSv(1), "1.000");
  assert.equal(fmtSv(null), DASH);
  assert.equal(toiSeconds("24:07"), 1447);
  assert.equal(toiSeconds(undefined), null);
});
test("sortLines: direction, missing last, stable name tiebreak", () => {
  const rows = [{ name: "B", shots: 2 }, { name: "A", shots: 2 }, { name: "C", shots: null }, { name: "D", shots: 5 }];
  assert.deepEqual(sortLines(rows, "shots", "desc").map((r) => r.name), ["D", "A", "B", "C"]);
  assert.deepEqual(sortLines(rows, "shots", "asc").map((r) => r.name), ["A", "B", "D", "C"]);
  assert.deepEqual(sortLines(rows, "name", "asc").map((r) => r.name), ["A", "B", "C", "D"]);
});
const P = (o) => ({ id: o.id, name: o.name ?? `P${o.id}`, team: "AAA", position: "C", goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, plusMinus: 0, pim: 0, toi: "15:00", saves: null, shotsAgainst: null, goalsAgainst: null, ...o });
test("notablePerformances: thresholds with the real numbers, never a score", () => {
  const box = { id: 1, players: [
    P({ id: 1, goals: 1, assists: 2, shots: 3 }), P({ id: 2, goals: 3, shots: 4 }), P({ id: 3, shots: 6 }), P({ id: 4, goals: 1, assists: 1 }),
    P({ id: 5, position: "G", saves: 27, shotsAgainst: 28, goalsAgainst: 1, toi: "60:00" }),
    P({ id: 6, position: "G", saves: 16, shotsAgainst: 16, goalsAgainst: 0, toi: "60:00", team: "BBB" }),
    P({ id: 7, position: "G", saves: 0, shotsAgainst: 0, goalsAgainst: 0, toi: "00:00" }),
    P({ id: 8, position: "G", saves: 14, shotsAgainst: 14, goalsAgainst: 0, toi: "40:00" }),
  ] };
  const cards = notablePerformances(box);
  const text = Object.fromEntries(cards.map((c) => [c.playerId, c.text]));
  assert.equal(text[1], "3 points: 1G 2A");
  assert.equal(text[2], "Hat trick: 3 goals");
  assert.equal(text[3], "6 shots on goal");
  assert.equal(text[4], undefined);
  assert.equal(text[5], "27 saves on 28 shots (.964)");
  assert.equal(text[6], "Shutout: 16 saves on 16 shots");
  assert.equal(text[7], undefined);
  assert.equal(text[8], undefined); // 14 shots: below the 15-shot floor
  assert.equal(cards.every((c) => !("rank" in c)), true);
  assert.equal(notablePerformances(box, { live: true }).length, 2);
  assert.deepEqual(notablePerformances(null), []);
});
test("sv% flag needs 15+ shots against", () => {
  const mk = (sv, sa) => ({ players: [P({ id: 9, position: "G", saves: sv, shotsAgainst: sa, goalsAgainst: sa - sv, toi: "60:00" })] });
  assert.equal(notablePerformances(mk(19, 20))[0].text, ".950 save % (19 of 20)");
  assert.equal(notablePerformances(mk(9, 10)).length, 0);
});
