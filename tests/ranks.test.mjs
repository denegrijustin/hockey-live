import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teamRanks, rankLine, rankTitle, ordinal } from "../src/lib/ranks.mjs";
const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const row = (o) => ({ gp: 0, pts: 0, rw: 0, gf: 0, ga: 0, ...o });
const blank = () => Object.fromEntries(teams.map((t) => [t.id, row({})]));
test("null before any game", () => assert.equal(teamRanks(blank(), teams), null));
test("points percentage beats raw points (games in hand)", () => {
  const t = blank();
  t.TOR = row({ gp: 10, pts: 14 }); // .700
  t.BOS = row({ gp: 12, pts: 16 }); // .667, more points
  const r = teamRanks(t, teams);
  assert.equal(r.TOR.league, 1);
  assert.equal(r.BOS.league, 2);
  assert.equal(r.TOR.leagueSize, 32);
  assert.equal(r.TOR.conferenceSize, 16);
  assert.equal(r.TOR.divisionSize, 8);
  assert.equal(r.BOS.division, 2);
});
test("tiebreaks: points, regulation wins, goal differential; full ties share rank", () => {
  const t = blank();
  t.TOR = row({ gp: 10, pts: 12, rw: 5, gf: 30, ga: 25 });
  t.BOS = row({ gp: 10, pts: 12, rw: 5, gf: 30, ga: 28 });
  t.FLA = row({ gp: 10, pts: 12, rw: 4, gf: 40, ga: 10 });
  t.DET = row({ gp: 10, pts: 12, rw: 5, gf: 30, ga: 28 });
  const r = teamRanks(t, teams);
  assert.equal(r.TOR.league, 1);
  assert.equal(r.BOS.league, 2);
  assert.equal(r.DET.league, 2);
  assert.equal(r.FLA.league, 4);
  assert.equal(r.TOR.division, 1);
});
test("conference and division ranks are within group", () => {
  const t = blank();
  t.EDM = row({ gp: 4, pts: 8 });
  t.TOR = row({ gp: 4, pts: 6 });
  t.VAN = row({ gp: 4, pts: 4 });
  const r = teamRanks(t, teams);
  assert.equal(r.EDM.division, 1);
  assert.equal(r.VAN.division, 2);
  assert.equal(r.TOR.conference, 1);
  assert.equal(r.VAN.conference, 2);
  assert.equal(r.VAN.league, 3);
});
test("formatting", () => {
  const r = { division: 2, divisionSize: 8, conference: 4, conferenceSize: 16, league: 9, leagueSize: 32, divisionName: "Atlantic", conferenceCode: "E" };
  assert.equal(rankLine(r), "ATL #2 · East #4 · #9 overall");
  assert.equal(rankLine(r, true), "ATL #2 · E #4 · #9");
  assert.equal(rankTitle(r), "2nd of 8 in the Atlantic · 4th of 16 in the Eastern Conference · 9th of 32 overall, by points percentage");
  assert.equal(rankLine({ ...r, divisionName: "Metropolitan", conferenceCode: "W" }).startsWith("MET #2 · West"), true);
  assert.deepEqual([11, 12, 13, 21, 22, 23, 32].map(ordinal), ["11th", "12th", "13th", "21st", "22nd", "23rd", "32nd"]);
  assert.equal(rankLine(null), "");
});
