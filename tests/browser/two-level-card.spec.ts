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

test("live games lead the board and completed-today games sit below unfinished games", async ({ page }) => {
  const today = new Date().toLocaleDateString("en-CA");
  const at = (hour: number) => `${today}T${String(hour).padStart(2, "0")}:00:00Z`;
  const base = { season: 20262027, type: 2, date: today, scheduleState: "OK", venue: "Test Arena", broadcasts: ["ESPN (US)"], round: null, end: "REG" };
  const live = { ...base, id: 2026020991, start: at(18), state: "LIVE", home: "EDM", away: "CHI", homeScore: 1, awayScore: 1, period: 2, periodType: "REG", clock: "10:00", intermission: false };
  const future = { ...base, id: 2026020992, start: at(17), state: "FUT", home: "MIN", away: "EDM", homeScore: null, awayScore: null };
  const final = { ...base, id: 2026020993, start: at(16), state: "FINAL", home: "CHI", away: "MIN", homeScore: 2, awayScore: 3 };
  await page.route("**/api/season/20262027", route => route.fulfill({ json: { season: 20262027, updatedAt: new Date().toISOString(), source: "test", games: [final, future, live] } }));
  await page.route("**/api/live", route => route.fulfill({ json: { date: today, updatedAt: new Date().toISOString(), games: [live] } }));
  await page.route("**/api/game/*", route => route.fulfill({ json: { ...live, updatedAt: new Date().toISOString(), shots: [], goals: [], stats: [], plays: [] } }));
  await page.goto("/");
  const cards = page.locator(".game-grid > .game-card");
  await expect(cards.first()).toHaveClass(/live-card/);
  await expect(page.locator(".finished-today-bottom")).toContainText("Finished today");
  expect(await page.evaluate(() => {
    const grid = document.querySelector(".results-line + .game-grid");
    const finished = document.querySelector(".finished-today-bottom");
    return Boolean(grid && finished && (grid.compareDocumentPosition(finished) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
});
