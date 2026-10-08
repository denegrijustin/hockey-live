import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { espnScheduleUrl, espnGameUrl, normalizeEspnTeam, parseEspnScoreboard, isEspnFamily } from "../src/lib/espn-links.mjs";
const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/espn-scoreboard.json", import.meta.url)));
test("url builders", () => {
  assert.equal(espnScheduleUrl("2025-10-08"), "https://www.espn.com/nhl/schedule/_/date/20251008");
  assert.equal(espnScheduleUrl("20251008"), "https://www.espn.com/nhl/schedule/_/date/20251008");
  assert.equal(espnGameUrl("401803001"), "https://www.espn.com/nhl/game/_/gameId/401803001");
});
test("abbreviation mapping", () => {
  for (const [e, n] of [["NJ", "NJD"], ["SJ", "SJS"], ["TB", "TBL"], ["LA", "LAK"], ["UTAH", "UTA"], ["WSH", "WSH"], ["VGK", "VGK"]])
    assert.equal(normalizeEspnTeam(e, undefined, teams), n);
  assert.equal(normalizeEspnTeam("XXX", "San Jose Sharks", teams), "SJS");
});
test("family detection", () => {
  for (const n of ["ESPN (US)", "ESPN+ (US)", "ESPN2 (US)", "ESPNU", "ABC (US)"]) assert.ok(isEspnFamily(n), n);
  for (const n of ["TNT", "truTV", "NHL Network", "Sportsnet", "CBC", "Victory+"]) assert.ok(!isEspnFamily(n), n);
});
test("parses scoreboard fixture", () => {
  const out = parseEspnScoreboard(fixture, "2025-10-08", teams);
  assert.equal(out.date, "20251008");
  assert.deepEqual(out.games, {
    "WSH-NJD": "401803001",
    "UTA-TBL": "401803002",
    "EDM-LAK": "401803003",
    "SJS-VGK": "401803004",
  });
  assert.deepEqual(parseEspnScoreboard({}, "20251008", teams).games, {});
});
