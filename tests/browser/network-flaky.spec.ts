import { expect, test } from "@playwright/test";
import { DATA_NOW } from "./clock";
import { readFileSync } from "node:fs";
import { SEASON, countRequests, liveBody, watchErrors } from "./qa-harness";

// A mid-session outage on /api/live: the header pill says "saved copy" (stale), the app keeps its last data, it recovers on the next
// poll, and no URL is hammered while the feed is failing.
test("503 then abort then recovery on /api/live: stale label, recovery, bounded request counts", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.install({ time: DATA_NOW });
  const mode = { v: "ok" as "ok" | "503" | "abort" };
  await page.route("**/api/live", (route) => {
    if (mode.v === "503") return route.fulfill({ status: 503, json: { error: "down" } });
    if (mode.v === "abort") return route.abort("failed");
    return route.fulfill({ json: { ...liveBody([]), updatedAt: DATA_NOW.toISOString() } });
  });
  // The preview server has no Worker, so serve the season API from the saved copy (otherwise the pill is "saved" for that reason alone).
  const snapshot = JSON.parse(readFileSync(`public/data/seasons/${SEASON}.json`, "utf8"));
  await page.route(`**/api/season/${SEASON}`, (route) => route.fulfill({ json: { ...snapshot, updatedAt: DATA_NOW.toISOString() } }));
  const counts = countRequests(page);
  await page.goto("/");
  const pill = page.locator(".status-pill");
  await expect(pill).toBeVisible();
  await expect(pill).not.toHaveAttribute("data-state", "saved");

  // The page clock is fake but the network is real: step one poll period, then let that request finish before the next step.
  const step = async (n: number) => {
    // Retry the step if the previous request had not finished yet (a poll is skipped while one is in flight).
    for (let i = 0; i < 4 && (counts.get("/api/live") ?? 0) < n; i++) {
      await page.clock.runFor(31_000);
      await page.waitForTimeout(300);
    }
    await expect.poll(() => counts.get("/api/live") ?? 0).toBeGreaterThanOrEqual(n);
    await page.waitForTimeout(250);
  };
  mode.v = "503";
  await step(2);
  await expect(pill).toHaveAttribute("data-state", "saved");
  await expect(pill).toContainText("saved copy");

  mode.v = "abort";
  await step(3);
  await expect(pill).toHaveAttribute("data-state", "saved");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);

  mode.v = "ok";
  await step(4);
  await expect(pill).not.toHaveAttribute("data-state", "saved");

  // 4 polling periods at most, plus initial loads: no URL may be requested in a runaway loop.
  const live = counts.get("/api/live") ?? 0;
  expect(live, `/api/live requests: ${live}`).toBeLessThanOrEqual(8);
  for (const [path, n] of counts) expect(n, `${path} requested ${n}x`).toBeLessThanOrEqual(8);
  expect(errors.filter((e) => e.startsWith("pageerror"))).toEqual([]);
});

test("a persistent outage does not pile up in-flight requests (one at a time, never faster than the poll interval)", async ({ page }) => {
  await page.clock.install({ time: DATA_NOW });
  let inFlight = 0, maxInFlight = 0, total = 0;
  await page.route("**/api/live", async (route) => {
    total++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await route.fulfill({ status: 503, body: "{}" });
    inFlight--;
  });
  await page.goto("/");
  await page.clock.runFor(5 * 60_000); // five minutes of outage
  await expect(page.locator(".status-pill")).toHaveAttribute("data-state", "saved");
  expect(maxInFlight).toBeLessThanOrEqual(1);
  expect(total, `${total} requests in 5 minutes`).toBeLessThanOrEqual(14); // ~30 s cadence + startup/retry, never a tight loop
});
