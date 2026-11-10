import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";

const raw = JSON.parse(readFileSync(new URL("./fixtures/raw-live-game.json", import.meta.url), "utf8"));

test("the normalized feed keeps every pre-Phase-5 play field unchanged", () => {
  const f = normalizeGameFeed(raw);
  const shot = f.plays.find((p) => p.type === "shot-on-goal");
  for (const k of ["id", "period", "periodType", "time", "type", "order", "penalty", "duration", "team", "x", "y", "player"]) assert.ok(k in shot, k);
  assert.deepEqual(f.plays.map((p) => p.order), [...f.plays.map((p) => p.order)].sort((a, b) => a - b));
});
test("plays now carry strength, time remaining, zone, shot type and player ids from the real feed", () => {
  const f = normalizeGameFeed(raw);
  const shot = f.plays.find((p) => p.type === "shot-on-goal");
  assert.match(shot.sit, /^\d{4}$/);
  assert.match(shot.left, /^\d+:\d{2}$/);
  assert.equal(typeof shot.pid, "number");
  assert.ok(shot.shotType);
  const hit = f.plays.find((p) => p.type === "hit");
  assert.ok(hit.secondary || hit.other, "a hit names who was involved");
});
test("the roster and clock details come through, and missing parts stay null", () => {
  const f = normalizeGameFeed(raw);
  assert.ok(f.roster.length > 30);
  assert.ok(f.roster.every((r) => typeof r.id === "number" && r.name));
  assert.ok("clockRunning" in f && "clockSeconds" in f);
  const stoppage = f.plays.find((p) => p.type === "stoppage");
  assert.equal(stoppage.team, null);
  assert.equal(stoppage.pid, null);
});
test("goals carry assists, the goalie and the score after (derived from a real shot play relabelled as a goal)", () => {
  const j = structuredClone(raw);
  const i = j.plays.findIndex((p) => p.typeDescKey === "shot-on-goal");
  const d = j.plays[i].details;
  j.plays[i].typeDescKey = "goal";
  j.plays[i].details = { ...d, scoringPlayerId: d.shootingPlayerId, assist1PlayerId: j.rosterSpots[2].playerId, homeScore: 1, awayScore: 0 };
  const g = normalizeGameFeed(j).goals[0];
  assert.deepEqual(g.score, { home: 1, away: 0 });
  assert.equal(g.assists.length, 1);
  assert.ok(g.goalie === null || typeof g.goalie.id === "number");
});
