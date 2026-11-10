import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DATA_NOW } from "./clock";
import { SEASON, countRequests, liveBody } from "./qa-harness";

// Perf guard: Home load must not fetch the same URL repeatedly. Budgets are deliberately loose (a regression to a fetch loop or a
// per-card fetch fails; one extra request does not) and are printed so the final wave can tighten them.
test("Home load requests each URL a bounded number of times", async ({ page }) => {
  await page.clock.install({ time: DATA_NOW });
  const snapshot = JSON.parse(readFileSync(`public/data/seasons/${SEASON}.json`, "utf8"));
  await page.route(`**/api/season/${SEASON}`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
  const counts = countRequests(page);
  await page.goto("/");
  await expect(page.locator(".status-pill")).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.clock.runFor(10_000);
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  test.info().annotations.push({ type: "requests", description: rows.map(([p, n]) => `${n}x ${p}`).join("; ") });
  console.log("Home requests:\n" + rows.map(([p, n]) => `  ${n}x ${p}`).join("\n"));
  for (const [path, n] of rows) {
    const limit = path === "/api/live" ? 3 : 2;
    expect(n, `${path} requested ${n}x on Home load`).toBeLessThanOrEqual(limit);
  }
  expect(rows.reduce((t, [, n]) => t + n, 0), "total same-origin requests").toBeLessThanOrEqual(60);
});

// Placeholder for the final wave: personalization (relevance scoring, Home dedupe) cost with a large follow list.
test.fixme("personalization calculation stays within budget with 32 favorites, 100 players, 100 saved games", async () => {
  // Needs src/lib/relevance.mjs and src/lib/home-pulse.mjs (unmerged). Measure relevance() over a full day's slate x 100 saved games
  // with performance.now() in node, budget TBD from the first real number (suggest < 10 ms per Home render).
});
