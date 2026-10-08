import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allocate, buildImperialism, ownersAt, conquestPath, weekLabel, distanceKm } from "../src/lib/imperialism.mjs";

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const realTeams = json("../src/data/teams.json");
const realArenas = json("../src/lib/arenas.json");

// toy world: three teams on a line, a few cells each
const teams = [{ id: "AAA", conference: "E" }, { id: "BBB", conference: "E" }, { id: "CCC", conference: "W" }, { id: "DDD", conference: "W" }];
const arenas = { AAA: { lon: -100, lat: 40 }, BBB: { lon: -90, lat: 40 }, CCC: { lon: -80, lat: 40 }, DDD: { lon: -70, lat: 40 } };
const cells = [[-101, 40], [-99, 40], [-91, 40], [-89, 40], [-81, 40], [-79, 40], [-71, 40], [-69, 40]];
let gid = 0;
const game = (home, away, hs, as, o = {}) => { const date = o.date ?? "2025-10-08"; return { id: ++gid, type: 2, state: "FINAL", date, start: `${date}T${String(10 + gid % 10).padStart(2, "0")}:00:00Z`, home, away, homeScore: hs, awayScore: as, end: "REG", ...o }; };
const run = (gs, layer = "full") => buildImperialism({ games: gs, teams, arenas, cells, layer });
const count = (r, id) => r.current.filter((o) => o === id).length;

test("nearest allocation by great-circle distance, deterministic tie-break by id", () => {
  assert.deepEqual(allocate(cells, teams, arenas), ["AAA", "AAA", "BBB", "BBB", "CCC", "CCC", "DDD", "DDD"]);
  // equidistant point between two arenas at the same latitude goes to the smaller id
  assert.deepEqual(allocate([[-95, 40]], ["BBB", "AAA"], arenas), ["AAA"]);
  assert.ok(Math.abs(distanceKm([-100, 40], [-100, 41]) - 111.2) < 0.5);
});

test("conquest absorbs ALL of the loser's land", () => {
  const r = run([game("AAA", "BBB", 3, 1)]);
  assert.equal(count(r, "AAA"), 4);
  assert.equal(count(r, "BBB"), 0);
  assert.deepEqual(r.ledger[0].transferred, [2, 3]);
  assert.deepEqual(r.weeks[1].landless, ["BBB"]);
});

test("landless loser transfers nothing", () => {
  const r = run([game("AAA", "BBB", 3, 1), game("CCC", "BBB", 2, 1, {}), game("BBB", "AAA", 0, 0 + 1)]);
  assert.equal(r.ledger[1].winner, "CCC");
  assert.deepEqual(r.ledger[1].transferred, []);
  assert.equal(count(r, "CCC"), 2);
});

test("landless winner that beats a land-holder takes all its land (re-entry)", () => {
  const r = run([game("AAA", "BBB", 3, 1), game("BBB", "AAA", 4, 2)]);
  assert.equal(count(r, "BBB"), 4);
  assert.equal(count(r, "AAA"), 0);
  assert.equal(r.ledger[1].transferred.length, 4);
});

test("chain conquests accumulate and are recorded in the cell path", () => {
  const r = run([game("AAA", "BBB", 3, 1), game("CCC", "AAA", 3, 2), game("DDD", "CCC", 5, 1)]);
  assert.equal(count(r, "DDD"), 8);
  const path = conquestPath(r, 0, 99);
  assert.deepEqual(path.map((p) => p.owner), ["AAA", "CCC", "DDD"]);
  assert.equal(path[0].type, "home");
  assert.deepEqual(conquestPath(r, 0, 0).map((p) => p.owner), ["AAA"]);
  assert.deepEqual(conquestPath(r, 2).map((p) => p.owner), ["BBB", "AAA", "CCC", "DDD"]);
});

test("OT and shootout wins count; unfinished and tied-score games do not", () => {
  const r = run([game("AAA", "BBB", 2, 3, { end: "SO" })]);
  assert.equal(r.ledger[0].winner, "BBB");
  assert.equal(r.ledger[0].end, "SO");
  assert.equal(run([game("AAA", "BBB", 2, 2), game("AAA", "BBB", 1, 0, { state: "LIVE" }), game("AAA", "BBB", null, null, { state: "FUT" })]).ledger.length, 0);
});

test("preseason is ignored, playoffs count", () => {
  assert.equal(run([game("AAA", "BBB", 5, 0, { type: 1 })]).ledger.length, 0);
  assert.equal(run([game("AAA", "BBB", 5, 0, { type: 3 })]).ledger.length, 1);
});

test("East layer: only East teams split the map and East-West games are ignored", () => {
  const r = run([game("AAA", "CCC", 5, 0), game("BBB", "AAA", 2, 1)], "east");
  assert.deepEqual(r.teams, ["AAA", "BBB"]);
  assert.equal(r.ledger.length, 1);
  assert.equal(r.ledger[0].winner, "BBB");
  assert.ok(r.current.every((o) => o === "AAA" || o === "BBB"));
  assert.deepEqual(r.home, ["AAA", "AAA", "BBB", "BBB", "BBB", "BBB", "BBB", "BBB"]);
  const w = run([game("CCC", "DDD", 2, 1)], "West");
  assert.deepEqual(w.teams, ["CCC", "DDD"]);
});

test("weeks run Monday-Sunday with labels, games within a week are one step", () => {
  const r = run([game("AAA", "BBB", 3, 1, { date: "2025-10-06" }), game("CCC", "DDD", 3, 1, { date: "2025-10-12" }), game("AAA", "CCC", 3, 1, { date: "2025-10-27" })]);
  assert.deepEqual(r.weeks.map((w) => w.label), ["Start", "Oct 6–12", "Oct 13–19", "Oct 20–26", "Oct 27–Nov 2"]);
  assert.equal(r.weeks[1].holdings.AAA, 4);
  assert.equal(r.weeks[1].holdings.CCC, 4);
  assert.deepEqual(ownersAt(r, 2), ownersAt(r, 1));
  assert.notDeepEqual(ownersAt(r, 4), ownersAt(r, 3));
  assert.equal(weekLabel(20367), "Oct 6–12");
  assert.equal(run([]).weeks.length, 1);
});

test("deterministic", () => {
  const gs = [game("AAA", "BBB", 3, 1), game("CCC", "AAA", 3, 2), game("DDD", "CCC", 5, 1)];
  assert.deepEqual(run(gs), run([...gs].reverse()));
  assert.deepEqual(run(gs), run(gs));
});

for (const layer of ["full", "east", "west"]) {
  test(`full 2025-26 season replay (${layer}): every cell owned, holdings sum to cell count`, () => {
    const season = json("../public/data/seasons/20252026.json");
    const cellsAll = json("../public/data/imperialism/cells.json");
    assert.ok(cellsAll.length > 2500 && cellsAll.length < 3600);
    const r = buildImperialism({ games: season.games, teams: realTeams, arenas: realArenas, cells: cellsAll, layer });
    assert.equal(r.teams.length, layer === "full" ? 32 : 16);
    assert.ok(r.weeks.length > 25);
    r.weeks.forEach((w, i) => {
      assert.equal(Object.values(w.holdings).reduce((a, b) => a + b, 0), cellsAll.length, `week ${i}`);
      const owners = ownersAt(r, i);
      assert.equal(owners.length, cellsAll.length);
      assert.ok(owners.every((o) => r.teams.includes(o)));
      assert.equal(w.landless.length, Object.values(w.holdings).filter((n) => n === 0).length);
    });
    assert.deepEqual(r.weeks.at(-1).holdings, Object.fromEntries(r.teams.map((t) => [t, r.current.filter((o) => o === t).length])));
    const top = Object.entries(r.weeks.at(-1).holdings).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`final top-5 (${layer}, ${r.ledger.length} games, ${r.weeks.length - 1} weeks):`, top.map(([t, n]) => `${t} ${n}`).join(", "));
  });
}
