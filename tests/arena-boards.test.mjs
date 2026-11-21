import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ART, BOARDS, arenaOf, boardFor, boardStats } from "../src/lib/arena-boards.mjs";

test("every board with artwork has its picture, and its overlays sit inside it", () => {
  for (const [id, b] of Object.entries(BOARDS)) {
    assert.ok(existsSync(`public/scoreboards/${id}.webp`), `${id} artwork`);
    for (const [x, y, w, h] of [b.ribbon, ...(b.panels ?? [])]) assert.ok(x >= 0 && y >= 0 && x + w <= ART.w && y + h <= ART.h, `${id} overlay inside`);
    const f = boardFor(id); assert.ok(f.ribbon.width > 35, `${id} score strip wide enough to carry the score`);
  }
  assert.equal(boardFor("XXX"), null);
  assert.equal(Object.keys(BOARDS).length, 32, "all 32 teams");
  assert.equal(arenaOf("EDM"), "Rogers Place");
});

test("board stats count shots on goal, faceoffs won, hits, blocks and penalty minutes per side, and list goals newest first", () => {
  const game = { away: "CAR", home: "EDM" };
  const plays = [
    { type: "shot-on-goal", team: "EDM", period: 1 }, { type: "goal", team: "EDM", player: "C. McDavid", period: 1, time: "05:00" }, { type: "shot-on-goal", team: "CAR", period: 1 },
    { type: "faceoff", team: "EDM" }, { type: "faceoff", team: "EDM" }, { type: "faceoff", team: "CAR" }, { type: "hit", team: "CAR" }, { type: "blocked-shot", team: "EDM" },
    { type: "penalty", team: "CAR", duration: 2 }, { type: "goal", team: "CAR", player: "S. Aho", period: 2, time: "01:10" }, { type: "goal", team: "CAR", player: "X", period: 5, periodType: "SO", time: "00:00" },
  ];
  const s = boardStats({ plays, situation: { homePowerPlay: true, awayPowerPlay: false } }, game);
  const row = (l) => s.rows.find((r) => r.label === l);
  assert.deepEqual([row("SOG").away, row("SOG").home], [2, 2], "goals count as shots, the shootout does not");
  assert.deepEqual([row("FO%").away, row("FO%").home], ["33%", "67%"]);
  assert.deepEqual([row("HITS").away, row("BLK").home, row("PIM").away], [1, 1, 2]);
  assert.deepEqual(s.goals.map((g) => [g.team, g.who, g.when]), [["CAR", "S. Aho", "P2 01:10"], ["EDM", "C. McDavid", "P1 05:00"]]);
  assert.equal(s.pp, "home");
  assert.equal(boardStats(null, game), null);
});

test("the deeper lines: shot attempts and Corsi, power play goals out of chances, save % and takeaways / giveaways", () => {
  const game = { away: "CAR", home: "EDM" };
  const G = { id: 1, name: "G" };
  const plays = [
    { type: "shot-on-goal", team: "EDM", period: 1 }, { type: "shot-on-goal", team: "EDM", period: 1 }, { type: "missed-shot", team: "EDM", period: 1 }, { type: "blocked-shot", team: "CAR", period: 1 },
    { type: "shot-on-goal", team: "CAR", period: 1 },
    { type: "penalty", team: "CAR", duration: 2, period: 1 }, { type: "penalty", team: "CAR", duration: 10, period: 1 },
    { type: "goal", team: "EDM", sit: "1451", goalie: G, period: 1, time: "05:00", player: "A" },
    { type: "takeaway", team: "EDM" }, { type: "giveaway", team: "CAR" },
  ];
  const s = boardStats({ plays }, game);
  const row = (l) => s.deep.find((r) => r.label === l);
  assert.deepEqual([row("SHOT ATT").away, row("SHOT ATT").home], [1, 5], "home: 3 SOG (goal counts), 1 miss, 1 blocked by CAR");
  assert.equal(row("CORSI %").home, "83%");
  assert.deepEqual([row("POWER PLAY").away, row("POWER PLAY").home], ["0/0", "1/1"], "a misconduct is not a power play");
  assert.deepEqual([row("SAVE %").away, row("SAVE %").home], [".667", "1.000".replace(/^1\.000$/, "1.000")]);
  assert.deepEqual([row("TAKE / GIVE").away, row("TAKE / GIVE").home], ["0 / 1", "1 / 0"]);
  assert.ok(!s.deep.some((r) => ["SOG", "FO%", "HITS", "BLK"].includes(r.label)), "no repeats of the side screens");
});
