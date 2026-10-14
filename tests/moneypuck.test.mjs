import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import {
  parseCsv, num, unzipFirst, normalizeTeams, normalizeGoalies, normalizeSkaters, normalizeLines, linePlayerIds, buildGames,
  shotSituation, nhlGameId, parseUpdateStamp, seasonIdOf, seasonYear, sourceUrls, SourceError,
} from "../src/lib/moneypuck.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/moneypuck/${name}`, import.meta.url), "utf8");
const ids = new Set(["EDM", "CAR", "NYR"]);

test("CSV parsing handles quotes, commas in fields, CRLF and empty cells", () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y",\r\n2,"say ""hi""",3\r\n');
  assert.deepEqual(rows, [{ a: "1", b: "x, y", c: "" }, { a: "2", b: 'say "hi"', c: "3" }]);
});

test("num keeps missing values missing instead of turning them into zero", () => {
  assert.equal(num(""), null);
  assert.equal(num(null), null);
  assert.equal(num("abc"), null);
  assert.equal(num("0"), 0);
  assert.equal(num("12.5"), 12.5);
});

test("seasons: MoneyPuck 2026 is NHL 20262027", () => {
  assert.equal(seasonIdOf(2026), 20262027);
  assert.equal(seasonYear(20262027), 2026);
  assert.equal(nhlGameId(2026, 20001), 2026020001);
  assert.equal(sourceUrls(2026).teams, "https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/teams.csv");
});

test("update stamps are read in their own offset and returned as UTC", () => {
  assert.equal(parseUpdateStamp("2026-10-13 06:31:35.562837-04:00"), "2026-10-13T10:31:35.000Z");
  assert.equal(parseUpdateStamp("garbage"), null);
  assert.equal(parseUpdateStamp(null), null);
});

test("team summary keeps source values, units and the time each count was measured over", () => {
  const teams = normalizeTeams(parseCsv(fixture("teams-edm-car.csv")), 2026, ids, { minTeams: 2 });
  const edm5 = teams.EDM["5on5"];
  // Values copied from teams.csv (2026, Oct 13 download): EDM 5on5
  assert.equal(edm5.gp, 5);
  assert.equal(edm5.toi, 14392);
  assert.equal(edm5.xGF, 9.77);
  assert.equal(edm5.xGA, 7.43);
  assert.equal(edm5.GF, 17);
  assert.equal(edm5.GA, 10);
  assert.equal(edm5.src.xGoalsPercentage, 0.57);
  assert.equal(teams.EDM.all.toi, 18119);
  // The situations add up to "all" (within the file's rounding of expected goals)
  const parts = ["5on5", "5on4", "4on5", "other"];
  assert.equal(parts.reduce((t, s) => t + teams.EDM[s].toi, 0), teams.EDM.all.toi);
  assert.ok(Math.abs(parts.reduce((t, s) => t + teams.EDM[s].xGF, 0) - teams.EDM.all.xGF) < 0.05);
});

test("team summary rejects a wrong season, unknown teams and missing columns", () => {
  const rows = parseCsv(fixture("teams-edm-car.csv"));
  assert.throws(() => normalizeTeams(rows, 2025, ids, { minTeams: 2 }), SourceError);
  assert.throws(() => normalizeTeams(rows, 2026, new Set(["EDM"]), { minTeams: 1 }), /unknown team/);
  assert.throws(() => normalizeTeams(rows.map(({ xGoalsFor, ...rest }) => rest), 2026, ids, { minTeams: 2 }), /missing columns/);
  assert.throws(() => normalizeTeams([], 2026, ids), /no rows/);
  assert.throws(() => normalizeTeams(rows, 2026, ids), /complete teams/);
});

test("goalie rows keep totals; shots on goal include goals", () => {
  const goalies = normalizeGoalies(parseCsv(fixture("goalies-shesterkin.csv")), 2026, ids);
  assert.equal(goalies.length, 1);
  const all = goalies[0].sit.all;
  assert.equal(goalies[0].id, 8478048);
  assert.equal(goalies[0].team, "NYR");
  assert.equal(all.toi, 16061);
  assert.equal(all.xGA, 12.95);
  assert.equal(all.GA, 8);
  assert.equal(all.SOG, 109);
  assert.equal(all.hd.att, 6); // unblocked attempts in the high-danger band, not shots on goal
});

test("skaters keep individual, on-ice and off-ice numbers apart", () => {
  const skaters = normalizeSkaters(parseCsv(fixture("skaters-mcdavid.csv")), 2026, ids, { minSkaters: 1 });
  const a = skaters[0].sit.all;
  assert.equal(skaters[0].name, "Connor McDavid");
  assert.equal(a.ind.G, 3);
  assert.equal(a.ind.xG, 2.27);
  assert.equal(a.ind.P, 13);
  assert.equal(a.on.xGF, 10.73);
  assert.equal(a.on.xGA, 3.37);
  assert.equal(a.on.src.xGoalsPercentage, 0.76);
});

test("a line id is the member player ids run together", () => {
  assert.deepEqual(linePlayerIds("84788548480803"), [8478854, 8480803]);
  const lines = normalizeLines(parseCsv(fixture("lines-edm.csv")), 2026, ids);
  assert.equal(lines[0].type, "pairing");
  assert.deepEqual(lines[0].players, [8478854, 8480803]);
  assert.equal(lines[0].toi, 804);
  assert.equal(lines[0].sit, "5on5");
});

test("shot situation is read from the shooting team's side", () => {
  assert.equal(shotSituation(5, 5), "5on5");
  assert.equal(shotSituation(5, 4), "5on4");
  assert.equal(shotSituation(4, 5), "4on5");
  assert.equal(shotSituation(6, 5), "other");
  assert.equal(shotSituation(3, 3), "other");
});

const shotRow = (o) => ({ game_id: "20001", season: "2026", isPlayoffGame: "0", homeTeamCode: "CAR", awayTeamCode: "EDM", isHomeTeam: "0.0", teamCode: "EDM", period: "1", time: "100", event: "SHOT", xGoal: "0.1", goal: "0", shotWasOnGoal: "1.0", homeSkatersOnIce: "5", awaySkatersOnIce: "5", goalieIdForShot: "1", goalieNameForShot: "Goalie H", shooterPlayerId: "9", shooterName: "S", shotType: "WRIST", xCordAdjusted: "70", yCordAdjusted: "3", shotOnEmptyNet: "0", ...o });

test("game logs sum shot-level xG by team and situation, with the opponent's side flipped", () => {
  const rows = [
    shotRow({ time: "100", xGoal: "0.10" }),
    shotRow({ time: "200", xGoal: "0.30", goal: "1", homeSkatersOnIce: "4", awaySkatersOnIce: "5" }), // EDM power play goal (5v4)
    shotRow({ time: "300", isHomeTeam: "1.0", teamCode: "CAR", xGoal: "0.20", goalieIdForShot: "2", goalieNameForShot: "Goalie A", shotWasOnGoal: "0.0" }),
    shotRow({ time: "3700", period: "4", xGoal: "0.05" }),
  ];
  const { log, shots } = buildGames(rows, 2026, new Set(["EDM", "CAR"]));
  const game = log[2026020001];
  assert.equal(game.overtime, true);
  assert.equal(game.periods, 4);
  assert.deepEqual(game.goals, { home: 0, away: 1 });
  assert.equal(game.teams.EDM.all.xGF.toFixed(2), "0.45");
  assert.equal(game.teams.EDM["5on5"].xGF.toFixed(2), "0.15");
  assert.equal(game.teams.EDM["5on4"].xGF, 0.3);
  assert.equal(game.teams.EDM["5on4"].GF, 1);
  // The same shot is a penalty-kill chance against for CAR
  assert.equal(game.teams.CAR["4on5"].xGA, 0.3);
  assert.equal(game.teams.CAR.all.xGA.toFixed(2), "0.45");
  assert.equal(game.teams.CAR.all.xGF, 0.2);
  assert.equal(game.teams.CAR.all.SOGF, 0); // a miss is not a shot on goal
  assert.equal(game.teams.EDM.all.SOGF, 3);
  // Goalie of CAR faced EDM's shots
  const cs = game.goalies.find((g) => g.id === 1);
  assert.equal(cs.team, "CAR");
  assert.equal(cs.GA, 1);
  assert.equal(cs.SOG, 3);
  assert.equal(shots[2026020001].length, 4);
  assert.equal(shots[2026020001].at(-1).p, 4);
});

test("shots for a team that is not in the game are rejected", () => {
  assert.throws(() => buildGames([shotRow({ teamCode: "NYR" })], 2026, new Set(["EDM", "CAR", "NYR"])), /not in game/);
});

test("the zip reader returns the first file's text (stored and deflated)", async () => {
  const text = "a,b\n1,2\n";
  const build = (method, data) => {
    const name = Buffer.from("x.csv");
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(text.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    const body = Buffer.concat([local, name, data]);
    eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(body.length, 16);
    return new Uint8Array(Buffer.concat([body, central, name, eocd]));
  };
  assert.equal(await unzipFirst(build(0, Buffer.from(text))), text);
  assert.equal(await unzipFirst(build(8, deflateRawSync(Buffer.from(text)))), text);
  await assert.rejects(() => unzipFirst(new Uint8Array([1, 2, 3])), /Not a zip/);
});

import { forEachCsvRow } from "../src/lib/moneypuck.mjs";
const streamOf = (text, size) => new ReadableStream({ start(c) { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += size) c.enqueue(b.slice(i, i + size)); c.close(); } });

test("the row reader gives the same rows whatever the chunk size, keeps only wanted columns and handles quotes and CRLF", async () => {
  const text = 'id,name,skip,note\r\n1,"Smith, J",x,a\r\n2,Doe,y,"say ""hi"""\r\n3,"two\nlines",z,\r\n4,Last,w,end';
  const want = [{ id: "1", name: "Smith, J", note: "a" }, { id: "2", name: "Doe", note: 'say "hi"' }, { id: "3", name: "two\nlines", note: "" }, { id: "4", name: "Last", note: "end" }];
  for (const size of [1, 3, 7, 64, 10000]) {
    const got = [];
    const { missing } = await forEachCsvRow(streamOf(text, size), ["id", "name", "note"], (r) => got.push(r));
    assert.deepEqual(got, want, `chunk size ${size}`);
    assert.deepEqual(missing, []);
  }
  const { missing } = await forEachCsvRow(streamOf("a,b\n1,2\n", 4), ["a", "zzz"], () => {});
  assert.deepEqual(missing, ["zzz"]);
  await assert.rejects(() => forEachCsvRow(streamOf("", 4), ["a"], () => {}), /no header/);
});
