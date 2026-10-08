import { test, expect } from "@playwright/test";

test("compact card, concise expansion, outside collapse and direct Game Center", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".game-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".compact-meta")).toBeVisible();
  await expect(card.getByRole("button", { name: /Open Game Center for/ })).toBeVisible();
  await expect(card.locator(".card-expanded")).toHaveCount(0);

  await card.locator(".game-card-summary").click();
  await expect(card.locator(".card-expanded")).toBeVisible();
  await expect(card.locator(".why-watch")).toBeVisible();
  await expect(card.locator(".projection")).toBeVisible();
  await expect(card.locator(".lineup-brief")).toBeVisible();
  await expect(card.locator(".matchup-comparison")).toHaveCount(0);

  await page.locator(".site-header").click();
  await expect(card.locator(".card-expanded")).toHaveCount(0);

  await card.getByRole("button", { name: /Open Game Center for/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  await expect(card.locator(".card-expanded")).toHaveCount(0);
  await expect(dialog.locator(".matchup-comparison")).toBeVisible();
  await expect(dialog.locator(".goalie-comparison")).toBeVisible();
  await dialog.locator(".game-center-section > summary").filter({ hasText: "Starting goalies" }).click();
  await expect(dialog.locator(".goalie-comparison")).toBeHidden();
  await dialog.getByRole("button", { name: "Close full game view" }).click();
});

test("game cards and Game Center do not overflow a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const card = page.locator(".game-card").first();
  await card.getByRole("button", { name: /Open Game Center for/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
