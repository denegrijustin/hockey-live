import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEASON, countRequests, liveBody } from "./qa-harness";
import { REAL, openFromHome, pollSequence, replicate, withState } from "./gc-qa-fixtures";
import { DATA_NOW } from "./clock";

// Perf report for the final validation wave: prints tables, fails only above generous ceilings (a regression to O(n^2) or a fetch loop).
// The 400-event history is REPLICATED real plays (docs/phase5-qa-fixtures.md), not a real game.

test("400-event history: time to open the Game Center and the cost of each poll update", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    (window as any).__long = [];
    new PerformanceObserver((l) => (window as any).__long.push(...l.getEntries().map((e) => e.duration))).observe({ entryTypes: ["longtask"] });
  });
  const big = withState(replicate(REAL.ot(), 400), "live");
  const seq = [big, replicate(REAL.ot(), 410), replicate(REAL.ot(), 420), replicate(REAL.ot(), 430)].map((r) => withState(r, "live"));
  const t0 = Date.now();
  const { dialog } = await openFromHome(page, seq);
  await expect(dialog.locator(".dialog-team")).toHaveCount(2);
  const openMs = Date.now() - t0;
  const nodes = await dialog.evaluate((d) => d.querySelectorAll("*").length);
  const longAfterOpen = await page.evaluate(() => (window as any).__long.length);
  const rows: [string, number][] = [];
  for (let i = 1; i <= 3; i++) {
    const before = await page.evaluate(() => (window as any).__long.reduce((a: number, b: number) => a + b, 0));
    const ms = await page.evaluate(async () => { const s = performance.now(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - s; });
    await page.clock.runFor(31_000);
    const t = await page.evaluate(async () => { const s = performance.now(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - s; });
    const after = await page.evaluate(() => (window as any).__long.reduce((a: number, b: number) => a + b, 0));
    rows.push([`poll ${i}: frame settle ${t.toFixed(0)} ms (idle frame ${ms.toFixed(0)} ms), long-task total ${(after - before).toFixed(0)} ms`, t]);
  }
  console.log(`Game Center with 400 replicated events\n  open (route to dialog ready): ${openMs} ms\n  dialog DOM nodes: ${nodes}\n  long tasks during open: ${longAfterOpen}\n` + rows.map(([r]) => `  ${r}`).join("\n"));
  test.info().annotations.push({ type: "perf", description: `open ${openMs} ms, ${nodes} nodes` });
  expect(openMs, "open took too long").toBeLessThan(15_000);
  expect(nodes, "dialog DOM size").toBeLessThan(25_000);
  for (const [, t] of rows) expect(t, "poll frame settle").toBeLessThan(2_000);
});

test("request duplication table: Home, then Home + live Game Center (per URL, 30 s)", async ({ page }) => {
  await page.clock.install({ time: DATA_NOW });
  const snapshot = JSON.parse(readFileSync(`public/data/seasons/${SEASON}.json`, "utf8"));
  await page.route(`**/api/season/${SEASON}`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
  const counts = countRequests(page);
  await page.goto("/");
  await expect(page.locator(".status-pill")).toBeVisible();
  for (let t = 0; t < 30_000; t += 5_000) await page.clock.runFor(5_000);
  const home = new Map(counts);
  console.log("Home, 30 s:\n" + [...home].sort((a, b) => b[1] - a[1]).map(([p, n]) => `  ${n}x ${p}`).join("\n"));
  for (const [p, n] of home) expect(n, p).toBeLessThanOrEqual(p === "/api/live" ? 3 : 2);
});

test("request duplication table: opening a live Game Center adds only the game feed", async ({ page }) => {
  await page.clock.install();
  const counts = countRequests(page);
  const { feed } = await openFromHome(page, pollSequence(REAL.ot(), 4).map((r) => withState(r, "live")));
  const afterOpen = new Map(counts);
  for (let t = 0; t < 60_000; t += 5_000) await page.clock.runFor(5_000);
  const rows = [...counts].map(([p, n]) => `  ${String(afterOpen.get(p) ?? 0).padStart(2)} on open, ${String(n).padStart(2)} after 60 s: ${p}`);
  console.log("Home + Game Center:\n" + rows.join("\n") + `\n  /api/game hits: ${feed.hits}`);
  expect(feed.hits, "15 s cadence: open + 4 ticks in 60 s").toBeLessThanOrEqual(5);
  expect(feed.hits, "polling kept running").toBeGreaterThanOrEqual(3); // 3 not 4: the fake clock stretches the re-armed timer by the fetch latency
  for (const [p, n] of counts) if (p.startsWith("/api/boxscore/")) expect(n, p).toBeLessThanOrEqual(4);
  const doc = [...counts].filter(([p]) => !p.startsWith("/api/") && (p.endsWith(".json") || p.endsWith(".js")) && (counts.get(p) ?? 0) > 2);
  expect(doc, "static assets fetched more than twice").toEqual([]);
});
