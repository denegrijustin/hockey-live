import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { normalizeBoxscore } from "../../src/lib/normalize.mjs";
import { mockApis, mk } from "./fixtures-games";

// Layout efficiency of the Game Center Team Stats tab (real CAR at VGK boxscore sample). Numbers recorded in docs/ui-layouts.md.
const sample = JSON.parse(readFileSync("tests/fixtures/boxscore-sample.json", "utf8"));
const realBox = () => JSON.parse(JSON.stringify(normalizeBoxscore(sample.boxscore, sample.rightRail)));
const ID = 2025030416;

async function open(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await mockApis(page, { games: [mk.final(ID, "CAR", "VGK", { score: [3, 0] })] });
  await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ json: realBox() }));
  await page.route(/\/api\/player\/\d{7}$/, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route(/\/api\/player\/\d{7}\/log\//, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto("/");
  await page.getByRole("button", { name: /CAR 3, VGK 0, final\. Open the full game view/ }).first().click();
  await page.getByRole("tab", { name: "Team Stats" }).click();
  const pane = page.getByTestId("gc-team-stats");
  await expect(pane.getByTestId("gc-gauge-sog")).toBeVisible();
  return pane;
}

/** Cell and dial boxes and the vertical extent of the gauge section of the Team Stats pane. */
const measure = (page: Page) => page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-testid^="gc-gauge-"]')].map((e) => e.getBoundingClientRect());
  const sect = document.querySelector(".gcs-gauges")!.getBoundingClientRect();
  const pane = document.querySelector('[data-testid="gc-team-stats"]')!.getBoundingClientRect();
  const dials = [...document.querySelectorAll('[data-testid^="gc-gauge-"] svg')].map((e) => Math.round(e.getBoundingClientRect().width));
  const tops = [...new Set(cells.map((r) => Math.round(r.top / 8)))];
  const maxPerRow = Math.max(...tops.map((t) => cells.filter((r) => Math.round(r.top / 8) === t).length));
  return { n: cells.length, sectionH: Math.round(sect.height), paneH: Math.round(pane.height), dials, rows: tops.length, maxPerRow, scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

// Ceilings chosen from the "before" measurement (see docs/ui-layouts.md).
const CEIL = { 390: 420, 1440: 220 } as const;

for (const w of [390, 360]) {
  test(`team stats: at least 3 gauges share a row at ${w}px`, async ({ page }) => {
    await open(page, w);
    const m = await measure(page);
    console.log("MEASURE", w, JSON.stringify(m));
    expect(m.maxPerRow).toBeGreaterThanOrEqual(3);
    expect(m.scrollW).toBeLessThanOrEqual(0);
  });
}

test("team stats at 1440px: not one gauge per row, section height under the ceiling", async ({ page }) => {
  await open(page, 1440, 1000);
  const m = await measure(page);
  console.log("MEASURE", 1440, JSON.stringify(m));
  expect(m.maxPerRow).toBeGreaterThan(1);
  expect(m.sectionH).toBeLessThanOrEqual(CEIL[1440]);
});

test("team stats at 390px: gauge section height under the ceiling", async ({ page }) => {
  await open(page, 390);
  const m = await measure(page);
  expect(m.sectionH).toBeLessThanOrEqual(CEIL[390]);
});

test("team stats: cells stay inside the section and the page never scrolls sideways (320 to 1920)", async ({ page }) => {
  for (const w of [320, 375, 430, 768, 1024, 1440, 1920]) {
    await open(page, w);
    const bad = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="gc-gauge-"]')].filter((c) => { const p = c.parentElement!.getBoundingClientRect(), r = c.getBoundingClientRect(); return r.left < p.left - 1 || r.right > p.right + 1 || c.scrollWidth > c.clientWidth + 1; }).length);
    expect(bad, `cells overflowing at ${w}`).toBe(0);
    expect((await measure(page)).scrollW, `page overflow at ${w}`).toBeLessThanOrEqual(0);
  }
});
