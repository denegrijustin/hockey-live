import { expect, test } from "@playwright/test";

/* Resumés are a ranking first (rank, team, SOS/OFF/DEF); a row's arrow opens its best wins and losses, whose pills are one size. */
async function openResumes(page: import("@playwright/test").Page) {
  await page.goto("/?view=games");
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await page.getByRole("button", { name: /Resumés/ }).click();
  await expect(page.locator(".rs-row").first()).toBeVisible({ timeout: 30000 });
}

test("resumés list the ranking and keep the wins and losses behind each row's arrow", async ({ page }) => {
  await openResumes(page);
  await expect(page.locator(".rs-row")).toHaveCount(32);
  await expect(page.locator(".rs-chip")).toHaveCount(0);
  const first = page.locator(".rs-row").first(), second = page.locator(".rs-row").nth(1);
  await first.locator(".rs-more-btn").click();
  await expect(first.locator(".rs-more-btn")).toHaveAttribute("aria-expanded", "true");
  await expect(first.locator(".rs-wins")).toBeVisible();
  await second.locator(".rs-more-btn").click(); // one row open at a time
  await expect(first.locator(".rs-wins")).toHaveCount(0);
  await expect(second.locator(".rs-wins")).toBeVisible();
  await second.locator(".rs-more-btn").click();
  await expect(page.locator(".rs-chip")).toHaveCount(0);
});

test("resumé pills are uniform", async ({ page }) => {
  await openResumes(page);
  await page.locator(".rs-row").first().locator(".rs-more-btn").click();
  const chips = page.locator(".rs-chip");
  await chips.first().waitFor();
  const bad = await page.locator(".rs-wins ul, .rs-losses ul").evaluateAll((uls) => uls.map((u) => new Set([...u.querySelectorAll(".rs-chip")].map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })).size).filter((n) => n > 1).length);
  expect(bad).toBe(0);
  const heights = await chips.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  expect(heights.length).toBe(1);
});
