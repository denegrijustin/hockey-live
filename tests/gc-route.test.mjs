import test from "node:test";
import assert from "node:assert/strict";
import { parseGameRoute, withGameRoute } from "../src/lib/gc-route.mjs";
import { searchFor } from "../src/lib/date-nav.mjs";

test("parses game, tab and event, validating each", () => {
  assert.deepEqual(parseGameRoute("?game=2025020123&tab=stats"), { id: 2025020123, tab: "stats", event: null });
  assert.deepEqual(parseGameRoute("?game=2025020123&event=77"), { id: 2025020123, tab: "pbp", event: 77 });
  assert.deepEqual(parseGameRoute("?game=2025020123&tab=nope&event=x"), { id: 2025020123, tab: null, event: null });
  assert.equal(parseGameRoute("?game=abc"), null);
  assert.equal(parseGameRoute("?game=1;drop"), null);
  assert.equal(parseGameRoute(""), null);
});
test("writes and removes the route, keeping other parameters", () => {
  assert.equal(withGameRoute("?view=games", { id: 5, tab: "intel" }), "?view=games&game=5&tab=intel");
  assert.equal(withGameRoute("?view=games&game=5&tab=intel&event=2", null), "?view=games");
  assert.equal(withGameRoute("", { id: 5, tab: "overview" }), "?game=5");
  assert.equal(withGameRoute("?game=5", { id: 6, tab: "pbp", event: 9 }), "?game=6&tab=pbp&event=9");
});
test("searchFor carries a validated game route", () => {
  assert.equal(searchFor("scoreboard", null, { game: { id: 5, tab: "pbp", event: 3 } }), "?game=5&tab=pbp&event=3");
  assert.equal(searchFor("scoreboard", null, { game: { id: "x" } }), "");
});
