import test from "node:test";
import assert from "node:assert/strict";
import { teamSummary, groupRoster, streakOf, specialTeams } from "../src/lib/team-summary.mjs";

const teams = [{ id: "TOR", division: "Atlantic", conference: "E" }, { id: "BOS", division: "Atlantic", conference: "E" }, { id: "EDM", division: "Pacific", conference: "W" }];
let id = 0;
const g = (date, home, away, hs, as, o = {}) => ({ id: ++id, type: 2, date, start: `${date}T23:00:00Z`, state: hs == null ? "FUT" : "FINAL", home, away, homeScore: hs, awayScore: as, end: "REG", ...o });

test("gp = 0 gives null", () => {
  assert.equal(teamSummary("TOR", { teams, table: { TOR: { gp: 0 } }, games: [g("2026-10-20", "TOR", "BOS", null, null)] }), null);
  assert.equal(teamSummary("TOR", {}), null);
});

const games = [
  g("2026-10-10", "TOR", "BOS", 3, 2),                // W home
  g("2026-10-12", "BOS", "TOR", 4, 1),                // L away
  g("2026-10-14", "TOR", "EDM", 2, 3, { end: "OT" }), // OTL home
  g("2026-10-16", "EDM", "TOR", 1, 2, { end: "SO" }), // W away (shootout)
  g("2026-10-18", "TOR", "BOS", 2, 2),                // tied: ignored
  g("2026-10-19", "TOR", "BOS", 9, 0, { type: 3 }),   // playoffs: ignored
  g("2026-10-20", "TOR", "BOS", 9, 0, { type: 1 }),   // preseason: ignored
  g("2026-10-22", "EDM", "TOR", 1, 4),                // W away
  g("2026-10-25", "TOR", "EDM", null, null),          // next
];
const s = teamSummary("TOR", { teams, games, today: "2026-10-23" });

test("record, points, goals from counted games (regular season, finished, non-tied)", () => {
  assert.equal(s.gp, 5);
  assert.deepEqual([s.record.w, s.record.l, s.record.otl, s.points], [3, 1, 1, 7]);
  assert.equal(s.record.text, "3–1–1");
  assert.equal(s.pointsPct, 7 / 10);
  assert.deepEqual([s.gf, s.ga, s.diff], [12, 11, 1]);
  assert.equal(s.gfPerGame, 12 / 5);
});
test("shootout and overtime losses are OTL, not L", () => {
  const o = teamSummary("TOR", { teams, games: [g("2026-10-14", "TOR", "EDM", 2, 3, { end: "SO" })] });
  assert.deepEqual([o.record.l, o.record.otl, o.points], [0, 1, 1]);
});
test("home and away splits", () => {
  assert.deepEqual([s.home.gp, s.home.w, s.home.otl, s.home.gf, s.home.ga], [2, 1, 1, 5, 5]);
  assert.deepEqual([s.away.gp, s.away.w, s.away.l], [3, 2, 1]);
});
test("lastN is never padded and flags short samples", () => {
  assert.equal(s.last5.short, false); assert.equal(s.last5.gp, 5);
  assert.equal(s.last10.short, true); assert.equal(s.last10.gp, 5);
  const few = teamSummary("TOR", { teams, games: games.slice(0, 2) });
  assert.equal(few.last5.short, true); assert.equal(few.last5.gp, 2);
  const many = Array.from({ length: 12 }, (_, k) => g(`2026-11-${String(k + 1).padStart(2, "0")}`, "TOR", "BOS", 3, 1));
  const m = teamSummary("TOR", { teams, games: many });
  assert.equal(m.last10.short, false); assert.equal(m.last10.gp, 10); assert.equal(m.last10.pts, 20);
});
test("streak: W, L and OTL are separate types; form is newest first", () => {
  assert.deepEqual(s.streak, { type: "W", count: 2 });
  assert.deepEqual(streakOf([{ result: "L" }, { result: "OTL" }, { result: "OTL" }]), { type: "OTL", count: 2 });
  assert.deepEqual(streakOf([{ result: "L" }, { result: "L" }, { result: "OTL" }]), { type: "OTL", count: 1 });
  assert.equal(streakOf([]), null);
  assert.deepEqual(s.form, ["W", "W", "OTL", "L", "W"]);
});
test("next game with rest days; none when the season is over", () => {
  assert.equal(s.nextGame.opp, "EDM"); assert.equal(s.nextGame.home, true);
  assert.equal(s.nextGame.restDays, 2); // last game the 22nd, next the 25th: two days off
  assert.equal(s.nextGame.daysAway, 2);
  assert.equal(teamSummary("TOR", { teams, games: games.slice(0, 2) }).nextGame, null);
});
test("the standings table is used for the headline numbers when present, and ranks come from it", () => {
  const table = { TOR: { gp: 6, w: 4, l: 1, ot: 1, pts: 9, gf: 14, ga: 9, rw: 3 }, BOS: { gp: 5, w: 1, l: 4, ot: 0, pts: 2, gf: 5, ga: 12, rw: 1 }, EDM: { gp: 5, w: 2, l: 3, ot: 0, pts: 4, gf: 8, ga: 9, rw: 2 } };
  const t = teamSummary("TOR", { teams, table, games });
  assert.equal(t.gp, 6); assert.equal(t.points, 9); assert.equal(t.diff, 5);
  assert.deepEqual([t.standing.division, t.standing.conference, t.standing.league], [1, 1, 1]);
});
test("special teams: passthrough with as-of and gp, null for missing", () => {
  const matchups = { updatedAt: "2026-10-23T00:00:00Z", teams: { TOR: { gamesPlayed: 4, metrics: { powerPlayPct: { value: 0.25 }, penaltyKillPct: { value: null }, shotsForPerGame: { value: 31.5 } } } } };
  const st = specialTeams(matchups, "TOR");
  assert.deepEqual([st.pp, st.pk, st.shotsFor, st.shotsAgainst, st.gp, st.asOf], [0.25, null, 31.5, null, 4, "2026-10-23T00:00:00Z"]);
  assert.equal(specialTeams(null, "TOR"), null);
  assert.equal(specialTeams(matchups, "BOS"), null);
  assert.equal(teamSummary("TOR", { teams, games }).specialTeams, null);
});
test("groupRoster: F/D/G, sorted, injury status only from the report", () => {
  const players = [
    { id: 1, name: "Zed Wing", position: "L", gp: 10, toi: 15 }, { id: 2, name: "Ann Center", position: "C", gp: 10, toi: 19 },
    { id: 3, name: "Dee Fence", position: "D", gp: 9, toi: 22 }, { id: 4, name: "Gus Goalie", position: "G", gp: 3 }, { id: 5, name: "Ben Backup", position: "G", gp: 7 },
  ];
  const r = groupRoster(players, [{ name: "Zed Wing", status: "Out", severity: { label: "Out" }, kind: "Knee", back: { text: "6 weeks" } }]);
  assert.deepEqual(r.F.map((p) => p.id), [2, 1]); assert.deepEqual(r.G.map((p) => p.id), [5, 4]); assert.equal(r.D.length, 1);
  assert.equal(r.F[1].injury.label, "Out"); assert.equal(r.F[0].injury, null);
  assert.deepEqual(groupRoster(undefined, undefined), { F: [], D: [], G: [] });
});
