import { test, expect } from "@playwright/test";
import edgeFixture from "../../public/data/edge/20252026/EDM.json" with { type: "json" };
test("rank line, side-by-side comparison at 320px and ESPN link", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/edge/**", (route) => {
    const team = route.request().url().split("/").pop();
    route.fulfill({ json: { ...edgeFixture, team } });
  });
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
  await card.locator(".game-card-summary").click();
  await card.getByText("NHL EDGE · team comparison").click();
  const cmp = card.locator(".cmp");
  await expect(cmp.locator(".cmp-row").first()).toBeVisible();
  await expect(cmp.locator('[data-metric^="edge-"]').first()).toBeVisible();
  const a = await cmp.locator(".cmp-val-a").first().boundingBox();
  const h = await cmp.locator(".cmp-val-h").first().boundingBox();
  expect(a!.x).toBeLessThan(h!.x);
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
