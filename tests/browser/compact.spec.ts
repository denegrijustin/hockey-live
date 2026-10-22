import { expect, test } from "@playwright/test";

// Dead space at the top of the page pushes the games below the fold; keep the first card well up the screen.
test("on a phone the first game card starts high on the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: "2026-10-10T17:00:00Z", date: "2026-10-10", games: [] } }));
  await page.goto("/?view=games");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  const top = await card.evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(top, "the first card should begin within the top quarter of the screen").toBeLessThan(230);
  expect(await page.locator(".site-header").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(56);
  // Teams, Filters and Search are one row.
  const row = page.locator(".phone-controls");
  expect((await row.boundingBox())!.height).toBeLessThan(72);
  const parts = await Promise.all([row.getByRole("button", { name: "Choose teams" }).boundingBox(), row.getByRole("button", { name: /^Filters/ }).boundingBox(), row.getByLabel("Find a matchup").boundingBox()]);
  for (const b of parts) expect(Math.abs(b!.y + b!.height / 2 - (parts[0]!.y + parts[0]!.height / 2)), "Teams, Filters and Search share a row").toBeLessThan(6);
  expect(await page.locator(".game-card").first().evaluate((e) => e.getBoundingClientRect().height), "a compact card").toBeLessThan(200);
  // Nothing spills sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("on a phone the tab bar stays at the bottom while the page scrolls, and the picker scrolls away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.mouse.wheel(0, 1800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const bar = await page.locator(".tab-bar").boundingBox();
  expect(Math.round(bar!.y + bar!.height), "pinned to the bottom edge").toBe(844);
  expect(bar!.height, "a standard 49pt tab bar").toBeGreaterThanOrEqual(49);
  await expect(page.locator(".tab-bar .tab-item")).toHaveCount(5);
  expect(await page.locator(".phone-controls").evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThan(0); // scrolled out of view
});

// The board should open with games, not furniture: four cards visible on a phone without scrolling.
test("on a phone the board opens with game cards showing (three above the fold, with the NHL+ line)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: "2026-10-10T17:00:00Z", date: "2026-10-10", games: [] } }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
  const cards = await page.locator(".game-card").evaluateAll((els) => els.slice(0, 5).map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; }));
  expect(cards.length).toBeGreaterThanOrEqual(4);
  // Card height depends on the device's system font, so this checks what holds on any font: two whole cards fit above the
  // fold and a good part of the third shows, which tells the reader there is more.
  for (const c of cards.slice(0, 2)) expect(c.bottom, "the first two cards fit above the fold").toBeLessThanOrEqual(700);
  expect(700 - cards[2].top, "the third card shows at least 100px").toBeGreaterThanOrEqual(100);
  // The furniture that used to sit above them is gone on a phone.
  for (const hidden of [".section-heading h2", ".section-heading .eyebrow", ".results-line", ".fresh-counts", ".card-stage-hint", ".compact-meta > span:first-child"])
    await expect(page.locator(hidden).first(), hidden).toBeHidden();
  // Every card still names both teams with the importance score, and keeps its channel logos and GC button.
  const first = page.locator(".game-card").first();
  await expect(first.locator(".matchup-team h3")).toHaveCount(2);
  await expect(first.locator(".importance-score strong")).toBeVisible();
  await expect(first.locator(".gc-icon")).toBeVisible();
  // Refreshing is a pull-down, or Refresh data under More; there is no toolbar button.
  await expect(page.locator(".refresh-mini")).toHaveCount(0);
  // Nothing spills sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("on a computer the heading and filters still show as before", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.locator(".section-heading h2")).toBeVisible();
  await expect(page.locator(".results-line")).toBeVisible();
  await expect(page.locator(".refresh-mini")).toBeHidden();
});

test("on a phone the GC tag is a square in line with the channel logos, the same size as each", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: "2026-10-10T17:00:00Z", date: "2026-10-10", games: [] } }));
  await page.goto("/?view=games");
  const card = page.locator(".game-card").filter({ has: page.locator(".network-logo") }).first();
  await expect(card).toBeVisible();
  const gc = await card.locator(".gc-icon").boundingBox();
  const logos = await card.locator(".network-logo").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
  expect(logos.length).toBeGreaterThan(0);
  expect(Math.abs(gc!.width - gc!.height), "GC is square").toBeLessThan(1);
  for (const l of logos) {
    expect(Math.abs(l.w - gc!.width), "same width as the GC tag").toBeLessThan(1);
    expect(Math.abs(l.h - gc!.height), "same height as the GC tag").toBeLessThan(1);
    expect(Math.abs(l.y + l.h / 2 - (gc!.y + gc!.height / 2)), "on the same line").toBeLessThan(1.5);
    expect(l.x + l.w, "the GC tag is last on the row, beside the logos").toBeLessThanOrEqual(gc!.x + 1);
  }
});
