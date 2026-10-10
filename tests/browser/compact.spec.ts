import { expect, test } from "@playwright/test";

// Dead space at the top of the page pushes the games below the fold; keep the first card well up the screen.
test("on a phone the first game card starts high on the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: "2026-10-10T17:00:00Z", date: "2026-10-10", games: [] } }));
  await page.goto("/");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  const top = await card.evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(top, "the first card should begin within the top half of the screen").toBeLessThan(430);
  expect(await page.locator(".site-header").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(56);
  // The team picker is one row, and the heading and Upcoming/Past switch share one.
  expect(await page.locator(".team-picker").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(60);
  const [h, s] = await Promise.all([page.locator(".section-heading h2").boundingBox(), page.locator(".section-heading .segmented").boundingBox()]);
  expect(Math.abs(h!.y + h!.height / 2 - (s!.y + s!.height / 2))).toBeLessThan(12);
  // Nothing spills sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("the tabs stay pinned under the ticker while the picker scrolls away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.mouse.wheel(0, 1800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const ticker = await page.locator(".ticker").boundingBox();
  const tabs = await page.locator(".view-tabs").boundingBox();
  expect(Math.round(tabs!.y)).toBe(Math.round(ticker!.height)); // directly beneath the ticker
  expect(await page.locator(".team-picker").evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThan(0); // scrolled out of view
});
