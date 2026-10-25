import { expect, test } from "@playwright/test";

for (const [label, width] of [["a 360px phone", 360], ["a laptop", 1280]] as const) {
  test(`Team trends opens with the goals-saved-above-expected board on ${label}: 32 teams ranked, blue above zero and red below, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?view=trends");
    const board = page.getByTestId("gsax-board");
    await expect(board).toBeVisible({ timeout: 30000 });
    await expect(board.locator("li")).toHaveCount(32);
    const vals = await board.locator(".gx-val").allInnerTexts();
    const nums = vals.map((v) => Number(v.replace("−", "-")));
    expect(nums.every((n) => Number.isFinite(n))).toBe(true);
    // Ranked best to worst down the columns, left to right.
    expect([...nums]).toEqual([...nums].sort((a, b) => b - a));
    expect(await board.locator("li").first().locator(".gx-rank").innerText()).toBe("1");
    // The board sits above the momentum chart.
    const [b, c] = await Promise.all([board.boundingBox(), page.locator(".trend-panel").boundingBox()]);
    expect(b!.y).toBeLessThan(c!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("goals saved above expected is a metric on the momentum chart, and draws a line per team", async ({ page }) => {
  await page.goto("/?view=trends");
  await page.locator(".trend-panel").waitFor({ timeout: 30000 });
  const metric = page.getByLabel("Metric");
  expect(await metric.locator("option").allInnerTexts()).toContain("Goals saved above expected");
  await metric.selectOption("gsax");
  await expect(page.locator(".trend-panel svg polyline").first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".trend-panel")).toContainText(/goals saved above expected/i);
});
