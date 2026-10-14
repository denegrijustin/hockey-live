import test from "node:test";
import assert from "node:assert/strict";
import { sortRows, nextSort, filterMinToi, matches, niceTicks, linearScale, paddedExtent, refreshMessage, lastGames, callouts, upcomingGames } from "../src/lib/nhlplus-view.mjs";

test("sortRows puts missing values last in both directions and is stable", () => {
  const rows = [{ t: "A", v: 2 }, { t: "B", v: null }, { t: "C", v: 5 }, { t: "D", v: 2 }, { t: "E", v: NaN }];
  assert.deepEqual(sortRows(rows, "v", "desc").map((r) => r.t), ["C", "A", "D", "B", "E"]);
  assert.deepEqual(sortRows(rows, "v", "asc").map((r) => r.t), ["A", "D", "C", "B", "E"]);
  assert.deepEqual(sortRows(rows, "t", "asc").map((r) => r.t), ["A", "B", "C", "D", "E"]);
});
test("nextSort flips the same column and starts new ones in their first direction", () => {
  assert.deepEqual(nextSort({ key: "a", dir: "desc" }, "a"), { key: "a", dir: "asc" });
  assert.deepEqual(nextSort({ key: "a", dir: "desc" }, "b", "asc"), { key: "b", dir: "asc" });
});
test("filterMinToi drops low and missing time only when a minimum is set", () => {
  const rows = [{ toi: 100 }, { toi: 5 }, { toi: null }];
  assert.equal(filterMinToi(rows, 0).length, 3);
  assert.deepEqual(filterMinToi(rows, 50), [{ toi: 100 }]);
});
test("matches ignores case and accents", () => {
  assert.ok(matches("jose", "José Smith"));
  assert.ok(matches("", "x"));
  assert.ok(!matches("zz", "abc", null));
});
test("niceTicks and scales", () => {
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(2.1, 3.4, 4).map((v) => +v.toFixed(2)), [2.5, 3]);
  assert.equal(linearScale(0, 10, 0, 100)(5), 50);
  assert.equal(linearScale(1, 1, 0, 100)(1), 0);
  assert.deepEqual(paddedExtent([1, 3, null], 0.5), [0, 4]);
  assert.equal(paddedExtent([null]), null);
});
test("refreshMessage", () => {
  assert.equal(refreshMessage("updated", ""), "Updated");
  assert.equal(refreshMessage("unchanged", ""), "No new data from MoneyPuck");
  assert.equal(refreshMessage("running", ""), "Refresh already running");
  assert.equal(refreshMessage("failed", "boom"), "Refresh failed: boom");
  assert.equal(refreshMessage(null, ""), "");
});
test("lastGames sums then derives; callouts are factual", () => {
  const log = [{ xGF: 2, xGA: 1, GF: 4, GA: 0 }, { xGF: 1, xGA: 3, GF: 1, GA: 2 }, { xGF: 3, xGA: 3, GF: 2, GA: 3 }];
  const w = lastGames(log, 2);
  assert.equal(w.games, 2);
  assert.equal(w.xGPct, 4 / 10);
  assert.equal(w.goalsVsXFor, -1);
  assert.deepEqual(callouts(w), ["1.0 goal below xG scored over 2 games", "1.0 goal fewer allowed than xG against over 2 games"]);
  assert.deepEqual(callouts(null), []);
});
test("upcomingGames skips preseason and finished games", () => {
  const games = [{ id: 3, type: 2, start: "2026-10-15T00:00Z" }, { id: 1, type: 1, start: "2026-10-14T00:00Z" }, { id: 2, type: 2, start: "2026-10-14T00:00Z", done: true }, { id: 4, type: 2, start: "2026-10-14T02:00Z" }];
  assert.deepEqual(upcomingGames(games, (g) => !!g.done).map((g) => g.id), [4, 3]);
});
