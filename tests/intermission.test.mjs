import test from "node:test";
import assert from "node:assert/strict";
import { INTERMISSION_MS, clockText, intermissionLeft, parseClock, firstSeenAt, SEEN_PREFIX, SEEN_TTL_MS } from "../src/lib/intermission.mjs";

test("an intermission is 18 minutes", () => assert.equal(INTERMISSION_MS, 18 * 60_000));
test("the feed's clock is read as minutes and seconds", () => {
  assert.equal(parseClock("13:48"), 828);
  assert.equal(parseClock("17:00"), 1020);
  assert.equal(parseClock(null), null);
  assert.equal(parseClock("Updating"), null);
  assert.equal(clockText(828), "13:48");
  assert.equal(clockText(-3), "0:00");
});
test("the countdown runs on from the last reading between polls and never goes below zero", () => {
  const at = 1_000_000;
  assert.equal(intermissionLeft({ base: 828, at, seenAt: at, now: at }), 828);
  assert.equal(intermissionLeft({ base: 828, at, seenAt: at, now: at + 30_000 }), 798);
  assert.equal(intermissionLeft({ base: 5, at, seenAt: at, now: at + 60_000 }), 0);
});
test("with no clock in the feed it counts 18 minutes from when the intermission was first seen", () => {
  const t = 5_000_000;
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t }), 1080);
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t + 60_000 }), 1020);
  assert.equal(intermissionLeft({ base: null, at: t, seenAt: t, now: t + 20 * 60_000 }), 0);
});

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
test("first-seen storage: remembers, ignores junk/future/old stamps, prunes stale iceboard-int keys, leaves other keys", () => {
  const now = 10_000_000_000, key = `${SEEN_PREFIX}1-2`;
  const s = memStore({ [`${SEEN_PREFIX}old`]: String(now - 4 * 3_600_000), [`${SEEN_PREFIX}junk`]: "abc", [`${SEEN_PREFIX}fut`]: String(now + 5), [`${SEEN_PREFIX}fresh`]: String(now - 60_000), other: "keep" });
  assert.equal(firstSeenAt(() => s, key, now), now);
  assert.equal(s.getItem(key), String(now));
  assert.deepEqual([...s.m.keys()].sort(), [key, `${SEEN_PREFIX}fresh`, "other"].sort());
  assert.equal(firstSeenAt(() => s, key, now + 30_000), now); // a reload keeps the original start
  s.setItem(key, String(now - 4 * 3_600_000));
  assert.equal(firstSeenAt(() => s, key, now), now); // a 4 h old stamp restarts
});
test("first-seen storage never throws when storage is blocked, full or unreadable", () => {
  const now = 5_000_000_000;
  assert.equal(firstSeenAt(() => { throw new DOMException("x", "SecurityError"); }, "iceboard-int-1-1", now), now);
  assert.equal(firstSeenAt(() => null, "iceboard-int-1-1", now), now);
  const full = memStore(); full.setItem = () => { throw new DOMException("q", "QuotaExceededError"); };
  assert.equal(firstSeenAt(() => full, "iceboard-int-1-1", now), now);
  const bad = { length: 1, key: () => { throw new Error("no"); }, getItem: () => { throw new Error("no"); }, setItem() {}, removeItem() {} };
  assert.equal(firstSeenAt(() => bad, "iceboard-int-1-1", now), now);
});

