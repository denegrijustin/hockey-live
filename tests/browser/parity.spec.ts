import { test, expect } from "@playwright/test";
import { goTo } from "./nav";
import { readFileSync } from "node:fs";

// A finished season, so the map has a whole year of results to replay (the live season may have just started).
const season = JSON.parse(readFileSync("public/data/seasons/20252026.json", "utf8"));

test("Playoff odds tab shows a grid per conference, 16 teams each, with no sideways page scroll", async ({ page }) => {
  await page.goto("/?view=games");
  await goTo(page, "Playoff odds");
  for (const conf of ["E", "W"]) {
    const grid = page.getByTestId(`po-grid-${conf}`);
    await expect(grid).toBeVisible({ timeout: 30000 });
    await expect(grid.locator("tbody tr:not(.po-divrow)")).toHaveCount(16);
  }
  await expect(page.locator(".po-note, [class*='po-']").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [label, width] of [["a 360px phone", 360], ["a tablet", 768], ["a laptop", 1280]] as const) {
  test(`Playoff odds fits ${label} with no sideways scroll, and shows the conference and division logos`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?view=games");
    await goTo(page, "Playoff odds");
    for (const conf of ["E", "W"]) {
      const grid = page.getByTestId(`po-grid-${conf}`);
      await expect(grid).toBeVisible({ timeout: 30000 });
      const fit = await grid.evaluate((g) => ({ scroll: g.scrollWidth, client: g.clientWidth, table: g.querySelector("table")!.getBoundingClientRect().width }));
      expect(fit.scroll).toBeLessThanOrEqual(fit.client + 1);
      expect(fit.table).toBeLessThanOrEqual(fit.client + 1);
      expect(await grid.evaluate((g) => getComputedStyle(g).overflowX)).not.toBe("auto");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".po-conf-logo")).toHaveCount(2);
    for (const img of await page.locator(".po-conf-logo").all()) expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(50);
    // Each conference is two division bands, each with its logo and its name, instead of a tiny badge on every row.
    await expect(page.locator(".po-divrow")).toHaveCount(4);
    await expect(page.locator(".po-divrow").first()).toContainText("Division");
    expect(await page.locator(".po-divrow img").first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(50);
    await expect(page.locator(".po-team-cell .po-div-logo")).toHaveCount(0);
    for (const conf of ["E", "W"]) await expect(page.getByTestId(`po-grid-${conf}`).locator("tbody tr:not(.po-divrow)")).toHaveCount(16);
  });
}

test("Imperialism map renders, time-travels and opens a region card", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/data/manifest.json", (r) => r.fulfill({ json: { updatedAt: season.updatedAt, current: 20252026, seasons: [20252026], defaultTeams: ["EDM", "CHI", "MIN"] } }));
  await page.route(/\/(api\/season|data\/seasons)\/\d+(\.json)?$/, (r) => r.fulfill({ json: season }));
  await page.goto("/?view=games");
  await goTo(page, "Imperialism map");
  const map = page.getByTestId("imp-map");
  await expect(map).toBeVisible({ timeout: 30000 });
  const cells = page.locator('[data-testid^="imp-cell-"]');
  expect(await cells.count()).toBeGreaterThan(1000);
  const slider = page.getByTestId("imp-slider");
  await expect(slider).toBeEnabled({ timeout: 30000 });
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBeGreaterThan(10);
  await slider.fill("0");
  const first = await cells.first().evaluate((e) => (e as SVGElement).style.fill || e.getAttribute("fill"));
  await slider.fill(String(max));
  await expect(page.getByTestId("imp-standings")).toBeVisible();
  await cells.nth(10).click();
  await expect(page.getByTestId("imp-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("imp-card")).toBeHidden();
  expect(first).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const [label, width] of [["a 360px phone", 360], ["a laptop", 1280], ["a wide desktop", 1700]] as const) {
  test(`Playoff tracker on ${label}: every team in exactly one tier, 8 spots a conference, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?view=games");
    await goTo(page, "Playoff odds");
    const tracker = page.getByTestId("playoff-tracker");
    await expect(tracker).toBeVisible({ timeout: 30000 });
    for (const conf of ["E", "W"]) {
      const c = tracker.locator(`.pt-conf[data-conf="${conf}"]`);
      await expect(c.locator(".pt-slots li")).toHaveCount(8); // eight spots, filled or open
      const teamsShown = await c.locator(".pt-slots .pt-chip, .pt-logos .pt-chip").count();
      expect(teamsShown).toBe(16);
      const inCount = Number((await c.getByTestId("pt-in-count").innerText()).split("/")[0]);
      await expect(c.locator(".pt-slots .pt-chip")).toHaveCount(inCount);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
