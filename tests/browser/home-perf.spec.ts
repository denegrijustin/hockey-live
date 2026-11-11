import { expect, test, type Page } from "@playwright/test";
import { SEASON, count, mk, mockApis } from "./fixtures-games";

const live = mk.live(9802, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] });
const games = [mk.upcoming(9801, "CHI", "EDM"), live, mk.final(9803, "BOS", "TOR"), mk.upcoming(9804, "SEA", "VAN", { offset: 1 }), mk.upcoming(9805, "MIN", "DAL", { offset: 2 })];

const watchCls = (page: Page) => page.addInitScript(() => {
  (window as any).__cls = 0;
  try { new PerformanceObserver((list) => { for (const e of list.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* unsupported */ }
});
const cls = (page: Page) => page.evaluate(() => (window as any).__cls as number);
const settle = (page: Page) => page.waitForLoadState("networkidle");

test.describe("home performance", () => {
  test("layout shift stays under 0.1 on first load and while stepping days", async ({ page }) => {
    await watchCls(page);
    await mockApis(page, { games, live: [live] });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await settle(page);
    const load = await cls(page);
    expect(load, `CLS on load ${load}`).toBeLessThan(0.1);
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.locator(".sb-day h1")).toHaveText("Tomorrow");
    await page.getByRole("button", { name: "Previous day" }).click();
    await page.getByRole("button", { name: "Next day" }).click();
    await page.waitForTimeout(400);
    const total = await cls(page);
    expect(total, `CLS after stepping ${total}`).toBeLessThan(0.1);
  });

  test("first paint makes one /api/live request and one load of the current season", async ({ page }) => {
    const m = await mockApis(page, { games, live: [live] });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await settle(page);
    expect(count(m.log, "/api/live")).toBe(1);
    expect(count(m.log, `/api/season/${SEASON}`)).toBe(1);
    expect(count(m.log, `/data/seasons/${SEASON}.json`)).toBe(0);
  });

  test("stepping days does not refetch the season or the live feed", async ({ page }) => {
    const m = await mockApis(page, { games, live: [live] });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await settle(page);
    const before = { live: count(m.log, "/api/live"), season: count(m.log, `/api/season/${SEASON}`), game: count(m.log, /^\/api\/game\//) };
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.locator(".sb-day h1")).toHaveText("Tomorrow");
    await page.getByRole("button", { name: "Next day" }).click();
    await page.getByRole("button", { name: "Previous day" }).click();
    await settle(page);
    expect(count(m.log, "/api/live")).toBe(before.live);
    expect(count(m.log, `/api/season/${SEASON}`)).toBe(before.season);
    expect(count(m.log, /^\/api\/game\//)).toBe(before.game);
  });

  test("the live feed is polled once per 30 seconds", async ({ page }) => {
    await page.clock.install({ time: new Date() });
    const m = await mockApis(page, { games, live: [live] });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    expect(count(m.log, "/api/live")).toBe(1);
    await page.clock.fastForward(31_000);
    await expect.poll(() => count(m.log, "/api/live")).toBe(2);
    await settle(page); // let the first poll finish: a tick that lands while a request is in flight is skipped by design
    await page.clock.fastForward(31_000);
    await expect.poll(() => count(m.log, "/api/live")).toBe(3);
  });

  test("finals are never polled: no /api/game request for a completed game that was not opened", async ({ page }) => {
    await page.clock.install({ time: new Date() });
    const m = await mockApis(page, { games: [mk.final(9811, "BOS", "TOR"), mk.final(9812, "NYR", "NJD")], live: [] });
    await page.goto("/");
    await expect(page.getByTestId("sb-done")).toBeVisible();
    await page.clock.fastForward(125_000);
    await settle(page);
    expect(count(m.log, /^\/api\/game\//)).toBe(0);
  });

  test("a final opened in the Completed list is fetched at most once, not polled", async ({ page }) => {
    await page.clock.install({ time: new Date() });
    const m = await mockApis(page, { games: [mk.final(9811, "BOS", "TOR")], live: [] });
    await page.goto("/");
    await page.getByRole("button", { name: /1 completed/ }).click();
    await expect(page.locator(".sb-row.final")).toBeVisible();
    await settle(page);
    const first = count(m.log, /^\/api\/game\/9811/);
    await page.clock.fastForward(125_000);
    await settle(page);
    expect(count(m.log, /^\/api\/game\/9811/)).toBe(first);
    expect(first).toBeLessThanOrEqual(1);
  });
});
