import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ordinal, normName, parseEspnInjuries, severity, timeBack, impactBook, impactFor, buildInjuryReport, daysBetween, fantasyDefinition, reportedAgo, matchRoster } from "../src/lib/injuries.mjs";

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
  assert.equal(list.length, 17);
  const m = list.find((i) => i.name === "Pavel Mintyukov");
  assert.equal(m.team, "ANA");
  assert.equal(m.pos, "D");
  assert.equal(m.status, "Injured Reserve"); // the provider's own words, verbatim
  assert.equal(m.statusRaw, "Injured Reserve");
  assert.equal(m.fantasy, "IR");
  assert.equal(m.kind, "Lower Body");
  assert.equal(m.returnDate, "2026-10-29");
  const p = list.find((i) => i.name === "Ryan Poehling");
  assert.equal(p.kind, "Knee (lower body)"); // the specific injury from the report, then the group it belongs to
  assert.ok(list.every((i) => teams.some((t) => t.id === i.team)));
  assert.ok(list.some((i) => i.team === "UTA")); // Utah's ESPN name maps to ours
  assert.deepEqual(parseEspnInjuries(null, teams), []);
});

const item = (o) => ({ status: "Injured Reserve", longTerm: false, returnDate: null, comment: "", note: "", ...o });

test("severity: season-ending, long-term, moderate, short-term, day-to-day, unknown", () => {
  assert.equal(severity(item({ comment: "He is out for the season after surgery." }), TODAY).level, "season");
  assert.equal(severity(item({ returnDate: "2026-12-20" }), TODAY).level, "serious"); // 57 days
  assert.equal(severity(item({ longTerm: true, returnDate: "2026-11-02" }), TODAY).level, "serious");
  assert.equal(severity(item({ returnDate: "2026-11-12" }), TODAY).level, "moderate"); // 19 days
  assert.equal(severity(item({ returnDate: "2026-10-29" }), TODAY).label, "Short-term");
  assert.equal(severity(item({ status: "Day-To-Day", returnDate: "2026-10-25" }), TODAY).label, "Day-to-day");
  assert.equal(severity(item({}), TODAY).level, "unknown");
  assert.equal(daysBetween("2026-10-29", TODAY), 5);
});

test("time back: the reported date as an estimate, a passed date, the team's season-ending words, and exactly 'No return date reported' otherwise", () => {
  assert.equal(timeBack(item({ returnDate: "2026-10-29" }), TODAY).text, "Reported return date (estimate): Oct 29");
  assert.equal(timeBack(item({ returnDate: "2026-10-29" }), TODAY).days, 5); // kept for sorting
  assert.equal(timeBack(item({ returnDate: "2026-10-24" }), TODAY).text, "Reported return date (estimate): Oct 24");
  assert.equal(timeBack(item({ returnDate: "2026-12-05" }), TODAY).text, "Reported return date (estimate): Dec 5");
  assert.equal(timeBack(item({ returnDate: "2026-10-20" }), TODAY).text, "Return date has passed (Oct 20)");
  assert.doesNotMatch(timeBack(item({ returnDate: "2026-10-20" }), TODAY).text, /could be back/i);
  assert.equal(timeBack(item({ comment: "expected to miss 6-8 weeks with an MCL sprain" }), TODAY).text, "No return date reported"); // free text is not turned into a date
  assert.equal(timeBack(item({ status: "Day-To-Day" }), TODAY).text, "No return date reported");
  assert.equal(timeBack(item({}), TODAY).text, "No return date reported");
  assert.equal(timeBack(item({ comment: "out for the season" }), TODAY).text, "Out for the season");
});

test("status words are the provider's own, with the code kept; unknown statuses pass through and nothing is lumped into short-term", () => {
  const list = parseEspnInjuries(espn, teams);
  const by = (n) => list.find((i) => i.name === n);
  assert.equal(by("Jeff Malott").status, "Day-To-Day");
  assert.equal(by("Test Outman").status, "Out");
  assert.equal(by("Sample Suspendo").status, "Suspension");
  assert.equal(by("Sample Suspendo").fantasy, "SUSP");
  assert.equal(by("Dakota Joshua").fantasy, "IR-LT");
  assert.equal(by("Dakota Joshua").longTerm, true);
  const bare = parseEspnInjuries({ injuries: [{ displayName: "Toronto Maple Leafs", injuries: [{ id: "1", athlete: { displayName: "No Status" }, details: {} }] }] }, teams)[0];
  assert.equal(bare.status, "Not reported");
  assert.equal(bare.statusRaw, null);
  assert.equal(severity(bare, TODAY).label, "Not reported"); // not "Unknown", not short-term
  assert.equal(severity(bare, TODAY).level, "unknown");
  assert.equal(fantasyDefinition("IR"), "IR = injured reserve");
  assert.equal(fantasyDefinition("IR-LT"), "IR-LT = long-term injured reserve");
  assert.equal(fantasyDefinition("IR-NR"), null); // no definition we can state, so the code shows alone
});

test("the report counts by the provider's status, including Out and a status the feed rarely uses", () => {
  const report = buildInjuryReport({ espn, teams, today: TODAY, now: Date.parse("2026-10-24T12:00:00Z"), season: 20262027 });
  const b = report.counts.byStatus;
  assert.deepEqual(b, { ir: 11, irLt: 1, dayToDay: 3, out: 1, other: 1 });
  assert.equal(Object.values(b).reduce((n, v) => n + v, 0), report.counts.total);
  assert.equal(report.counts.dayToDay, 3);
  assert.equal(report.schema, 2);
});

test("'Reported <time ago>' comes from the report's own timestamp, with the exact time for a tooltip", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(reportedAgo("2026-10-23T21:08Z", now).text, "Reported 15 h ago");
  assert.equal(reportedAgo("2026-10-21T12:00Z", now).text, "Reported 3 days ago");
  assert.equal(reportedAgo("2026-10-24T11:20Z", now).text, "Reported 40 min ago");
  assert.match(reportedAgo("2026-10-23T21:08Z", now).title, /Oct 23, 2026/);
  assert.equal(reportedAgo(null, now), null);
  assert.equal(reportedAgo("nonsense", now), null);
});

test("a roster match is by normalized name and only when it is unique", () => {
  const roster = [{ id: 8478402, name: "Connor McDavid" }, { id: 1, name: "Sam Smith" }, { id: 2, name: "Sam Smith" }];
  assert.equal(matchRoster("connor  mcdavid", roster).id, 8478402);
  assert.equal(matchRoster("Sam Smith", roster), null); // two people: never guess
  assert.equal(matchRoster("Nobody Here", roster), null);
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
  assert.equal(report.items.length, 17);
  assert.equal(report.items[0].name, names[1]); // the highest-impact injured player first
  assert.equal(report.items[0].impact.level, "high");
  assert.ok(report.items.at(-1).impact.percentile == null || report.items.at(-1).impact.percentile <= report.items[0].impact.percentile);
  assert.ok(report.items.every((i) => i.severity && i.back && i.impact));
  assert.equal(report.counts.total, 17);
  assert.ok(report.counts.high >= 1);
  const top = report.teams[0];
  assert.ok(top.lost >= report.teams.at(-1).lost);
  assert.equal(report.teams.reduce((n, t) => n + t.count, 0), 17);
  assert.equal(report.season, 20262027);
});

test("percentiles read 1st, 2nd, 3rd, 11th, 12th, 13th, 21st, 98th", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 98, 100].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "98th", "100th"]);
});
