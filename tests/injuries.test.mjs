import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normName, parseEspnInjuries, severity, timeBack, impactBook, impactFor, buildInjuryReport, daysBetween } from "../src/lib/injuries.mjs";

const teams = JSON.parse(readFileSync("src/data/teams.json", "utf8"));
const espn = JSON.parse(readFileSync("tests/fixtures/espn-injuries.json", "utf8"));
const TODAY = "2026-10-24";

test("names match across accents, punctuation and suffixes", () => {
  assert.equal(normName("Alex Ovechkin"), normName("alex  ovechkin"));
  assert.equal(normName("Jesper Bratt Jr."), normName("Jesper Bratt"));
  assert.equal(normName("Marc-André Fleury"), "marc andre fleury");
});

test("ESPN's feed becomes a flat list with our team ids, the injury type and the reported return date", () => {
  const list = parseEspnInjuries(espn, teams);
  assert.equal(list.length, 15);
  const m = list.find((i) => i.name === "Pavel Mintyukov");
  assert.equal(m.team, "ANA");
  assert.equal(m.pos, "D");
  assert.equal(m.status, "Injured reserve");
  assert.equal(m.kind, "Lower Body");
  assert.equal(m.returnDate, "2026-10-29");
  const p = list.find((i) => i.name === "Ryan Poehling");
  assert.equal(p.kind, "Knee (lower body)"); // the specific injury from the report, then the group it belongs to
  assert.ok(list.every((i) => teams.some((t) => t.id === i.team)));
  assert.ok(list.some((i) => i.team === "UTA")); // Utah's ESPN name maps to ours
  assert.deepEqual(parseEspnInjuries(null, teams), []);
});

const item = (o) => ({ status: "Injured reserve", longTerm: false, returnDate: null, comment: "", note: "", ...o });

test("severity: season-ending, long-term, moderate, short-term, day-to-day, unknown", () => {
  assert.equal(severity(item({ comment: "He is out for the season after surgery." }), TODAY).level, "season");
  assert.equal(severity(item({ returnDate: "2026-12-20" }), TODAY).level, "serious"); // 57 days
  assert.equal(severity(item({ longTerm: true, returnDate: "2026-11-02" }), TODAY).level, "serious");
  assert.equal(severity(item({ returnDate: "2026-11-12" }), TODAY).level, "moderate"); // 19 days
  assert.equal(severity(item({ returnDate: "2026-10-29" }), TODAY).label, "Short-term");
  assert.equal(severity(item({ status: "Day-to-day", returnDate: "2026-10-25" }), TODAY).label, "Day-to-day");
  assert.equal(severity(item({}), TODAY).level, "unknown");
  assert.equal(daysBetween("2026-10-29", TODAY), 5);
});

test("time back: days left, weeks, a passed date, what the team said, and when nothing is reported", () => {
  assert.equal(timeBack(item({ returnDate: "2026-10-29" }), TODAY).text, "About 5 days · Oct 29");
  assert.equal(timeBack(item({ returnDate: "2026-10-25" }), TODAY).text, "About a day · Oct 25");
  assert.equal(timeBack(item({ returnDate: "2026-10-24" }), TODAY).text, "Could return today");
  assert.match(timeBack(item({ returnDate: "2026-10-20" }), TODAY).text, /Return date passed \(Oct 20\)/);
  assert.equal(timeBack(item({ returnDate: "2026-12-05" }), TODAY).text, "About 6 weeks · Dec 5");
  assert.equal(timeBack(item({ comment: "expected to miss 6-8 weeks with an MCL sprain" }), TODAY).text, "Reported: 6–8 weeks");
  assert.equal(timeBack(item({ status: "Day-to-day" }), TODAY).text, "Day-to-day, no return date");
  assert.equal(timeBack(item({}), TODAY).text, "No return date reported");
  assert.equal(timeBack(item({ comment: "out for the season" }), TODAY).text, "Out for the season");
});

const sk = (name, gp, goals, assists, shots, plusMinus = 0, pim = 0, team = "TOR") => ({ skaterFullName: name, gamesPlayed: gp, goals, assists, shots, plusMinus, penaltyMinutes: pim, timeOnIcePerGame: 1200, teamAbbrevs: team });
const letters = (i) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const pool = (n, base) => Array.from({ length: n }, (_, i) => sk(`Filler ${letters(i)}`, 10, base + (i % 5), i % 4, 20 + i));

test("impact comes from this season once he has played a few games, otherwise from last season", () => {
  const cur = impactBook({ skaters: [...pool(30, 0), sk("Star Player", 8, 9, 7, 40, 5), sk("Rookie Guy", 1, 0, 0, 2)], minGp: 3 });
  const prev = impactBook({ skaters: [...pool(40, 10), sk("Rookie Guy", 70, 60, 70, 300, 12), sk("Star Player", 80, 5, 5, 100)], minGp: 10 });
  const star = impactFor("Star Player", cur, prev);
  assert.equal(star.basis, "season");
  assert.equal(star.gp, 8);
  assert.equal(star.level, "high");
  assert.ok(star.percentile >= 90);
  const rookie = impactFor("Rookie Guy", cur, prev); // one game this season: judged by last season
  assert.equal(rookie.basis, "last");
  assert.equal(rookie.gp, 70);
  assert.equal(rookie.level, "high");
  const nobody = impactFor("Nobody Known", cur, prev);
  assert.equal(nobody.basis, "none");
  assert.equal(nobody.level, null);
  const onlyCurrent = impactFor("Rookie Guy", cur, null); // no last season to fall back on: the small sample is flagged
  assert.equal(onlyCurrent.basis, "season");
  assert.equal(onlyCurrent.small, true);
});

test("goalies are judged on saves above a .900 save percentage", () => {
  const goalies = Array.from({ length: 10 }, (_, i) => ({ goalieFullName: `Goalie ${letters(i)}`, gamesPlayed: 10, saves: 250 + i * 10, shotsAgainst: 270 + i * 8, savePct: 0.9, teamAbbrevs: "TOR" }));
  const book = impactBook({ goalies, minGp: 3 });
  const best = impactFor(`Goalie ${letters(9)}`, book, null), worst = impactFor(`Goalie ${letters(0)}`, book, null);
  assert.ok(best.perGame > worst.perGame);
  assert.ok(best.percentile > worst.percentile);
  assert.equal(best.group, "goalie");
});

test("the report ranks injuries by impact and shows which teams are hurt most", () => {
  const injured = parseEspnInjuries(espn, teams);
  const names = injured.slice(0, 3).map((i) => i.name);
  const skaters = [...pool(40, 0), sk(names[0], 6, 1, 1, 10), sk(names[1], 6, 9, 9, 50, 6), sk(names[2], 6, 4, 3, 25)];
  const report = buildInjuryReport({ espn, teams, today: TODAY, now: Date.parse("2026-10-24T12:00:00Z"), season: 20262027, skaters });
  assert.equal(report.items.length, 15);
  assert.equal(report.items[0].name, names[1]); // the highest-impact injured player first
  assert.equal(report.items[0].impact.level, "high");
  assert.ok(report.items.at(-1).impact.percentile == null || report.items.at(-1).impact.percentile <= report.items[0].impact.percentile);
  assert.ok(report.items.every((i) => i.severity && i.back && i.impact));
  assert.equal(report.counts.total, 15);
  assert.ok(report.counts.high >= 1);
  const top = report.teams[0];
  assert.ok(top.lost >= report.teams.at(-1).lost);
  assert.equal(report.teams.reduce((n, t) => n + t.count, 0), 15);
  assert.equal(report.season, 20262027);
});
