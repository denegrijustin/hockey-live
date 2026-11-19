import { expect, test } from "@playwright/test";

/* The best-win and loss pills are one size, whatever the score, the OT/SO tag or the BAD flag. */
test("resumé pills are uniform", async ({ page }) => {
  await page.goto("/?view=games");
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await page.getByRole("button", { name: /Resumés/ }).click();
  const chips = page.locator(".rs-chip");
  await chips.first().waitFor({ timeout: 30000 });
  // within each row's list every pill has the same width and height
  const bad = await page.locator(".rs-wins ul, .rs-losses ul").evaluateAll((uls) => uls.slice(0, 40).map((u) => new Set([...u.querySelectorAll(".rs-chip")].map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })).size).filter((n) => n > 1).length);
  expect(bad).toBe(0);
  // and the height is the same everywhere
  const heights = await chips.evaluateAll((els) => [...new Set(els.slice(0, 80).filter((e) => (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)))]);
  expect(heights.length).toBe(1);
});
