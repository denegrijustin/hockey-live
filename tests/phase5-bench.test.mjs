// Phase 5 perf table (node): normalize and reconcile time for a 400-event history (REPLICATED real plays, see docs/phase5-qa-fixtures.md).
// Prints a table; fails only above generous ceilings so a quadratic regression is caught without flaking on a slow runner.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import * as B from "./fixtures/gc/builder.mjs";

const median = (f, n = 15) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); f(); t.push(performance.now() - s); } return t.sort((a, b) => a - b)[n >> 1]; };

test("normalize and reconcile a 400-event history stay fast; per-poll append is not O(history)", async () => {
  const rows = [];
  const raw400 = B.replicate(B.REAL.ot(), 400), raw800 = B.replicate(B.REAL.ot(), 800);
  const n400 = median(() => normalizeGameFeed(raw400)), n800 = median(() => normalizeGameFeed(raw800));
  rows.push(["normalizeGameFeed 400 plays", n400], ["normalizeGameFeed 800 plays", n800]);
  assert.ok(n400 < 100, `normalize 400: ${n400.toFixed(2)} ms`);
  assert.ok(n800 < n400 * 6 + 5, "normalize grows roughly linearly");

  const url = new URL("../src/lib/event-store.mjs", import.meta.url);
  if (existsSync(url)) {
    const { reconcile } = await import(url.href);
    const f400 = normalizeGameFeed(raw400), f410 = normalizeGameFeed(B.replicate(B.REAL.ot(), 410));
    const empty = reconcile(undefined, []).store;
    const first = reconcile(empty, f400.plays);
    rows.push(["reconcile 400 plays from empty", median(() => reconcile(empty, f400.plays))]);
    const next = median(() => reconcile(first.store, f410.plays));
    rows.push(["reconcile +10 plays onto 400", next]);
    rows.push(["reconcile identical 400 (no-op poll)", median(() => reconcile(first.store, f400.plays))]);
    assert.ok(next < 50, `reconcile append: ${next.toFixed(2)} ms`);
    const again = reconcile(first.store, f400.plays);
    assert.equal(again.added.length + again.changed.length + again.removed.length + again.voided.length, 0, "an identical poll changes nothing");
  } else rows.push(["reconcile (src/lib/event-store.mjs not merged yet)", NaN]);

  console.log("\n  operation".padEnd(46) + "median ms\n" + rows.map(([k, v]) => `  ${k.padEnd(44)}${Number.isNaN(v) ? "n/a" : v.toFixed(3)}`).join("\n"));
});
