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
  expect(top, "the first card should begin within the top half of the screen").toBeLessThan(290);
  expect(await page.locator(".site-header").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(48);
  // The team picker is one row, and the heading and Upcoming/Past switch share one.
  expect(await page.locator(".team-picker").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(60);
  const [sw, ft] = await Promise.all([page.locator(".section-heading .segmented").boundingBox(), page.locator(".filters-toggle").boundingBox()]);
  expect(Math.abs(sw!.y + sw!.height / 2 - (ft!.y + ft!.height / 2)), "Upcoming/Past and Filters share a row").toBeLessThan(10);
  expect(await page.locator(".game-card").first().evaluate((e) => e.getBoundingClientRect().height), "a compact card").toBeLessThan(200);
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

// The board should open with games, not furniture: four cards visible on a phone without scrolling.
test("on a phone the board opens with at least four game cards showing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: "2026-10-10T17:00:00Z", date: "2026-10-10", games: [] } }));
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  const cards = await page.locator(".game-card").evaluateAll((els) => els.slice(0, 5).map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; }));
  expect(cards.length).toBeGreaterThanOrEqual(4);
  for (const c of cards.slice(0, 4)) expect(c.bottom, "the first four cards fit above the fold").toBeLessThanOrEqual(700);
  // The furniture that used to sit above them is gone on a phone.
  for (const hidden of [".section-heading h2", ".section-heading .eyebrow", ".results-line", ".fresh-counts", ".card-stage-hint", ".compact-meta > span:first-child"])
    await expect(page.locator(hidden).first(), hidden).toBeHidden();
  // Every card still names both teams with the importance score, and keeps its channel logos and GC button.
  const first = page.locator(".game-card").first();
  await expect(first.locator(".matchup-team h3")).toHaveCount(2);
  await expect(first.locator(".importance-score strong")).toBeVisible();
  await expect(first.locator(".gc-icon")).toBeVisible();
  // The refresh button lives in the toolbar row now.
  await expect(page.locator(".refresh-mini")).toBeVisible();
  // Nothing spills sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("on a computer the heading and filters still show as before", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.locator(".section-heading h2")).toBeVisible();
  await expect(page.locator(".results-line")).toBeVisible();
  await expect(page.locator(".refresh-mini")).toBeHidden();
});
