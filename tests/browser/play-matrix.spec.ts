import { expect, test } from "@playwright/test";
import { goTo } from "./nav";

test("NHL+ Play vs results places every team in a play × results grid", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await goTo(page, "NHL+");
  const nav = page.getByRole("navigation", { name: "NHL+ views" });
  if (await nav.getByRole("button", { name: "Play vs results" }).isHidden()) await nav.locator('button[aria-pressed="true"]').click(); // folded into one button on a phone
  await nav.getByRole("button", { name: "Play vs results" }).click();
  await expect(page.getByRole("heading", { name: "Playing well? Winning?" })).toBeVisible();
  await expect(page.locator(".pm-cell")).toHaveCount(9);
  await expect(page.locator('[data-cell="well/winning"] h4')).toContainText("The real deal");
  const logos = await page.locator(".pm-cell li").count();
  expect(logos).toBeGreaterThan(10);
  expect(logos).toBeLessThanOrEqual(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth) + 1);
});
