import test from "node:test";
import assert from "node:assert/strict";

// subscribeFeed only needs fetch, document and timers, so it runs under plain Node.
globalThis.document = { hidden: false, addEventListener() {} };
let calls = 0;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ n: ++calls }) });
const { subscribeFeed } = await import("../src/lib/polling.ts");
const tick = () => new Promise((r) => setTimeout(r, 10));

test("subscribers to one URL share a single request and all hear the result", async () => {
  const a = [], b = [];
  const offA = subscribeFeed("/api/x", 60000, (d) => a.push(d));
  const offB = subscribeFeed("/api/x", 60000, (d) => b.push(d));
  await tick();
  assert.equal(calls, 1);
  assert.deepEqual(a.at(-1), { n: 1 });
  assert.deepEqual(b.at(-1), { n: 1 });
  offA();
  offB();
});

test("a late subscriber is handed the data already held, and the last unsubscribe stops polling", async () => {
  calls = 0;
  const off1 = subscribeFeed("/api/y", 60000, () => {});
  await tick();
  const seen = [];
  const off2 = subscribeFeed("/api/y", 60000, (d) => seen.push(d));
  assert.deepEqual(seen[0], { n: 1 });
  assert.equal(calls, 1);
  off1();
  off2();
});

test("a failed poll reports an error and keeps the last data", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  const seen = [];
  const off = subscribeFeed("/api/z", 60000, (d, e) => seen.push([d, e]));
  await tick();
  assert.equal(seen.at(-1)[0], null);
  assert.match(seen.at(-1)[1], /unavailable/);
  off();
  globalThis.fetch = real;
});
