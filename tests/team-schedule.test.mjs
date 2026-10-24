import test from "node:test";
import assert from "node:assert/strict";
import { teamGames, sideOf, recordOf, nextIndex, seasonMonths, monthGrid, defaultMonth, monthLabel, monthKey } from "../src/lib/team-schedule.mjs";

let id = 0;
const g = (date, home, away, state, hs = null, as = null, end = "REG", type = 2) => ({ id: ++id, type, date, start: `${date}T23:00:00Z`, state, home, away, homeScore: hs, awayScore: as, end });
const games = [
  g("2026-10-20", "TOR", "BOS", "FINAL", 3, 2),
  g("2026-10-12", "MTL", "TOR", "FINAL", 4, 1),
  g("2026-10-15", "TOR", "OTT", "FINAL", 2, 3, "OT"),
  g("2026-10-22", "BOS", "MTL", "FINAL", 1, 0), // not TOR
  g("2026-10-24", "TOR", "FLA", "FUT"),
  g("2026-11-02", "TBL", "TOR", "FUT"),
  g("2026-09-25", "TOR", "DET", "FINAL", 1, 0, "REG", 1), // preseason
  g("2027-01-05", "TOR", "NYR", "FUT"),
];

test("a team's games are in play order, with preseason and other teams' games left out", () => {
  const items = teamGames(games, "TOR");
  assert.deepEqual(items.map((x) => x.date), ["2026-10-12", "2026-10-15", "2026-10-20", "2026-10-24", "2026-11-02", "2027-01-05"]);
});

test("each game from the team's side: opponent, home or away, status and result (a loss in overtime is its own result)", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  assert.deepEqual(items.map((i) => [i.opp, i.home, i.status, i.result]), [["MTL", false, "final", "L"], ["OTT", true, "final", "OTL"], ["BOS", true, "final", "W"], ["FLA", true, "upcoming", null], ["TBL", false, "upcoming", null], ["NYR", true, "upcoming", null]]);
  assert.equal(items[0].us, 1);
  assert.equal(items[0].them, 4);
  assert.equal(items[1].ot, "OT");
});

test("the record counts only games that are over", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  assert.deepEqual(recordOf(items), { gp: 3, w: 1, l: 1, otl: 1, pts: 3 });
});

test("the list centres on the game closest to play: the one on now, else the next, else the last played", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  assert.equal(items[nextIndex(items)].opp, "FLA");
  const withLive = items.map((i, k) => (k === 3 ? { ...i, status: "live" } : i));
  assert.equal(nextIndex(withLive), 3);
  const over = items.map((i) => ({ ...i, status: "final" }));
  assert.equal(nextIndex(over), items.length - 1);
  assert.equal(nextIndex([]), -1);
});

test("the season's months run first game to last, with no gaps", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  assert.deepEqual(seasonMonths(items), ["2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.equal(monthLabel("2026-10"), "October 2026");
});

test("the calendar opens on this month if the season covers it, else the nearest month", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  assert.equal(defaultMonth(items, "2026-11-20"), "2026-11");
  assert.equal(defaultMonth(items, "2026-08-01"), "2026-10");
  assert.equal(defaultMonth(items, "2027-06-01"), "2027-01");
  assert.equal(defaultMonth([], "2026-10-24"), "2026-10");
});

test("a month grid is whole weeks starting on Sunday with each day's games in place", () => {
  const items = teamGames(games, "TOR").map((x) => sideOf(x, "TOR"));
  const weeks = monthGrid("2026-10", items);
  assert.ok(weeks.length >= 5 && weeks.length <= 6);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(new Date(`${weeks[0][0].date}T12:00:00Z`).getUTCDay(), 0);
  const days = weeks.flat();
  assert.equal(days.filter((d) => d.inMonth).length, 31);
  assert.deepEqual(days.filter((d) => d.games.length).map((d) => d.date), ["2026-10-12", "2026-10-15", "2026-10-20", "2026-10-24"]);
  assert.equal(days.find((d) => d.date === "2026-10-20").games[0].opp, "BOS");
  assert.equal(monthKey("2026-10-24"), "2026-10");
});
