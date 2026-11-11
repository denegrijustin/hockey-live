import { test, expect } from "@playwright/test";
import { goTo } from "./nav";
import { readFileSync } from "node:fs";

// A finished season, so the map has a whole year of results to replay (the live season may have just started).
const season = JSON.parse(readFileSync("public/data/seasons/20252026.json", "utf8"));

test("Playoff odds tab shows a ranked list per conference, 16 teams each, with no sideways page scroll", async ({ page }) => {
  await page.goto("/?view=games");
  await goTo(page, "Playoff odds");
  for (const conf of ["E", "W"]) {
    const list = page.getByTestId(`po-grid-${conf}`);
    await expect(list).toBeVisible({ timeout: 30000 });
    await expect(list.locator(".po-row")).toHaveCount(16);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [label, width] of [["a 320px phone", 320], ["a 360px phone", 360], ["a tablet", 768], ["a laptop", 1280], ["a wide desktop", 1700]] as const) {
  test(`Playoff odds fits ${label}: no sideways scroll, conference logos, a playoff line after the eighth team`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?view=games");
    await goTo(page, "Playoff odds");
    for (const conf of ["E", "W"]) {
      const list = page.getByTestId(`po-grid-${conf}`);
      await expect(list).toBeVisible({ timeout: 30000 });
      const fit = await list.evaluate((g) => ({ scroll: g.scrollWidth, client: g.clientWidth }));
      expect(fit.scroll).toBeLessThanOrEqual(fit.client + 1);
      await expect(list.locator(".po-row")).toHaveCount(16);
      await expect(list.locator(".po-cut")).toHaveCount(1);
      expect(await list.locator(".po-row").nth(8).locator(".po-cut").count()).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const img of await page.locator(".po-conf-logo").all()) expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(50);
    // Each row's meter stays inside its row and every row is a 44px-tall button.
    const boxes = await page.locator(".po-row .po-btn").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, over: e.scrollWidth - e.clientWidth }; }));
    for (const b of boxes) { expect(b.h).toBeGreaterThanOrEqual(44); expect(b.over).toBeLessThanOrEqual(1); }
  });
}

test("Playoff odds is interactive: a row opens to every number, the filters re-rank and filter, and rows are keyboard reachable", async ({ page }) => {
  await page.goto("/?view=games");
  await goTo(page, "Playoff odds");
  const east = page.getByTestId("po-grid-E");
  await expect(east).toBeVisible({ timeout: 30000 });
  const first = east.locator(".po-row").first();
  await first.locator(".po-btn").focus();
  await page.keyboard.press("Enter");
  await expect(first.locator(".po-btn")).toHaveAttribute("aria-expanded", "true");
  await expect(first.locator(".po-stat")).toHaveCount(8);
  await expect(first.locator(".po-more")).toBeVisible();
  await first.locator(".po-btn").click();
  await expect(first.locator(".po-btn")).toHaveAttribute("aria-expanded", "false");
  // Re-rank by division title: the playoff line goes away and the percentages are that metric's.
  await page.getByRole("group", { name: "Rank teams by" }).getByRole("button", { name: /Win the division|Division/ }).click();
  await expect(east.locator(".po-cut")).toHaveCount(0);
  const pcts = (await east.locator(".po-pct").allInnerTexts()).map((t) => (t.startsWith(">") ? 100 : t.startsWith("<") ? 0 : parseFloat(t)));
  for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1] + 1);
  // Conference filter.
  await page.getByRole("group", { name: "Conference" }).getByRole("button", { name: "West" }).click();
  await expect(page.getByTestId("po-grid-E")).toHaveCount(0);
  await expect(page.getByTestId("po-grid-W").locator(".po-row")).toHaveCount(16);
});

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

