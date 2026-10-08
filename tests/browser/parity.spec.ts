import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// A finished season, so the map has a whole year of results to replay (the live season may have just started).
const season = JSON.parse(readFileSync("public/data/seasons/20252026.json", "utf8"));

test("Playoff odds tab shows a grid per conference, 16 teams each, with no sideways page scroll", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Playoff odds", exact: true }).click();
  for (const conf of ["E", "W"]) {
    const grid = page.getByTestId(`po-grid-${conf}`);
    await expect(grid).toBeVisible({ timeout: 30000 });
    await expect(grid.locator("tbody tr")).toHaveCount(16);
  }
  await expect(page.locator(".po-note, [class*='po-']").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Imperialism map renders, time-travels and opens a region card", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/data/manifest.json", (r) => r.fulfill({ json: { updatedAt: season.updatedAt, current: 20252026, seasons: [20252026], defaultTeams: ["EDM", "CHI", "MIN"] } }));
  await page.route(/\/(api\/season|data\/seasons)\/\d+(\.json)?$/, (r) => r.fulfill({ json: season }));
  await page.goto("/");
  await page.getByRole("button", { name: "Imperialism map", exact: true }).click();
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
