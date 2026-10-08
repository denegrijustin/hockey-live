import { test, expect } from "@playwright/test";
test("rank line, crossover comparison at 320px, team swapping and ESPN link", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/espn/*", (route) =>
    route.fulfill({ json: { date: "x", games: {} } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "All 32", exact: true }).click();
  // The current season may still be preseason (no standings yet, so no ranks).
  await page.getByLabel("Season", { exact: true }).selectOption("20252026");
  const card = page.locator(".game-card").first();
  await expect(card.locator(".team-rank")).toHaveCount(2);
  await expect(card.locator(".team-rank").first()).toContainText("by points %");
  await card.getByRole("button", { name: /Open Game Center for/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  const cmp = dialog.locator(".matchup-comparison");
  await expect(cmp.locator(".crossover-row").first()).toBeVisible();
  await expect(cmp).toContainText("Rank comparisons, not predictions");
  const before = await cmp.locator(".comparison-title h3").innerText();
  await cmp.getByRole("button", { name: "⇄ Swap sides" }).click();
  await expect(cmp.locator(".comparison-title h3")).not.toHaveText(before);
  const left = await cmp.locator(".metric-offense").first().boundingBox();
  const right = await cmp.locator(".metric-defense").first().boundingBox();
  expect(left!.x).toBeLessThan(right!.x);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const link = page.locator(".game-card a.network-logo-link").first();
  if (await link.count()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("href", /^https:\/\/www\.espn\.com\/nhl\/(schedule\/_\/date|game\/_\/gameId)\//);
  }
});
