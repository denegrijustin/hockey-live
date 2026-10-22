import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({ isMobile }) => test.skip(!!isMobile, "desktop layout"));

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 950 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
}

test("on a wide screen the Game Center docks at the side and the list stays usable", async ({ page }) => {
  await open(page, 1600);
  await page.locator(".gc-icon").first().click();
  const panel = page.locator("dialog.game-dialog.is-panel");
  await expect(panel).toBeVisible();
  await page.waitForTimeout(400); // the slide-in finishes
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x + box.width), "docked to the right edge").toBe(1600);
  expect(box.width).toBeGreaterThanOrEqual(500);
  await expect(page.locator("body")).toHaveAttribute("data-gc-panel", /\d+/);
  // The list sits to its left, still scrollable and clickable, with no sideways scroll.
  const card = (await page.locator(".game-card").first().boundingBox())!;
  expect(card.x + card.width).toBeLessThanOrEqual(box.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1601);
  await page.mouse.move(400, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(panel).toBeVisible(); // not a modal: scrolling the page works with it open
});

test("opening another game swaps the panel; only one is ever open; Escape and Close dismiss it", async ({ page }) => {
  await open(page, 1600);
  const icons = page.locator(".gc-icon");
  await icons.nth(0).click();
  const panel = page.locator("dialog.game-dialog.is-panel");
  await expect(panel).toHaveCount(1);
  const first = await panel.getAttribute("aria-label");
  await icons.nth(1).click(); // the page behind it is still clickable
  await expect.poll(() => panel.getAttribute("aria-label")).not.toBe(first);
  await expect(panel).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-gc-panel", /.*/);
  await icons.nth(0).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close full game view" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-gc-panel", /.*/);
});

test("below 1500px it is still the modal window", async ({ page }) => {
  await open(page, 1440);
  await page.locator(".gc-icon").first().click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveClass(/is-panel/);
  await expect(page.locator("body")).not.toHaveAttribute("data-gc-panel", /.*/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the filters are one toolbar row on desktop, still labelled for screen readers", async ({ page }) => {
  await open(page, 1440);
  const row = page.locator("#game-filters");
  expect((await row.boundingBox())!.height, "a single row").toBeLessThan(80);
  for (const label of ["Competition", "Window", "Sort by", "Find a matchup"]) await expect(page.getByLabel(label)).toBeVisible();
});
