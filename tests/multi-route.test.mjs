import test from "node:test";
import assert from "node:assert/strict";
import { parseMulti, withMulti, isEmbedded } from "../src/lib/multi-route.mjs";

test("parseMulti: one or two games, digits only, no repeats, at most two", () => {
  assert.deepEqual(parseMulti("?multi=2026020100"), [2026020100]);
  assert.deepEqual(parseMulti("?multi=1,2"), [1, 2]);
  assert.deepEqual(parseMulti("?multi=1,1,2,3"), [1, 2]);
  assert.deepEqual(parseMulti("?multi=abc,5,../x"), [5]);
  assert.equal(parseMulti("?multi="), null);
  assert.equal(parseMulti("?multi=zzz"), null);
  assert.equal(parseMulti("?view=games"), null);
});

test("withMulti: sets or removes the parameter, keeps the rest, drops the Game Center's", () => {
  assert.equal(withMulti("?view=games&game=7&tab=pbp", [7]), "?view=games&multi=7");
  assert.equal(withMulti("?view=games&multi=7,8", [7, 9]), "?view=games&multi=7%2C9".replace("%2C", "%2C"));
  assert.equal(withMulti("?view=games&multi=7", null), "?view=games");
  assert.equal(withMulti("", [1, 2, 3]), "?multi=1%2C2");
  assert.equal(withMulti("?multi=1", ["x"]), "");
});

test("isEmbedded: only embed=1", () => {
  assert.equal(isEmbedded("?embed=1&game=5"), true);
  assert.equal(isEmbedded("?embed=0"), false);
  assert.equal(isEmbedded(""), false);
});
