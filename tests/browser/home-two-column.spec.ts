import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";

const games = [
  mk.upcoming(9801, "TBL", "BUF", { time: "00:00" }), mk.upcoming(9802, "NYR", "CGY", { time: "00:30" }),
  mk.upcoming(9803, "UTA", "VGK", { time: "02:30" }), mk.upcoming(9804, "PHI", "EDM", { time: "02:00" }), mk.upcoming(9805, "NSH", "ANA", { time: "03:00" }),
];
const cards = (page: any) => page.locator('[data-testid=home-section-upcoming] .sb-row');
const boxes = (page: any) => cards(page).evaluateAll((els: HTMLElement[]) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, over: e.scrollWidth - e.clientWidth }; }));

for (const width of [1100, 1280, 1440, 1920]) {
  test(`Upcoming on a ${width}px screen is two columns of cards that fit, with names in full and no overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(cards(page)).toHaveCount(5);
    const b = await boxes(page);
    expect(Math.abs(b[0].t - b[1].t)).toBeLessThan(2);   // the first two share a row
    expect(b[1].l).toBeGreaterThan(b[0].r - 1);            // side by side, not overlapping
    expect(b[2].t).toBeGreaterThan(b[0].b - 1);            // the third starts a new row
    for (const x of b) expect(x.over).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // Every team name shows in full (no ellipsis) and every card keeps its Game Center button.
    const clipped = await page.locator('[data-testid=home-section-upcoming] .sb-main .sb-name').evaluateAll((els: HTMLElement[]) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped).toBe(0);
    await expect(page.locator('[data-testid=home-section-upcoming] .gc-icon')).toHaveCount(5);
  });
}

test("Upcoming stays one column of full rows below 1100px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await mockApis(page, { games });
  await page.goto("/");
  await expect(cards(page)).toHaveCount(5);
  const b = await boxes(page);
  expect(b[1].t).toBeGreaterThan(b[0].b - 1);
});
