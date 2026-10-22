import { expect, test, type Page } from "@playwright/test";
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

test.beforeEach(({ isMobile }) => test.skip(!isMobile, "phone layout"));

async function open(page: Page, live: unknown = null) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => (live ? route.fulfill({ json: live }) : route.fulfill({ status: 503, body: "{}" })));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
}
const touch = (page: Page, el: ReturnType<Page["locator"]>, type: string, y: number, id = 11) => el.dispatchEvent(type, { pointerType: "touch", pointerId: id, clientY: y, bubbles: true });

test("Teams, Filters and Search sit in one row; the old toolbar, picker and status line are gone", async ({ page }) => {
  await open(page);
  const row = page.locator(".phone-controls");
  await expect(row.getByRole("button", { name: "Choose teams" })).toBeVisible();
  await expect(row.getByRole("button", { name: /^Filters/ })).toBeVisible();
  await expect(row.getByLabel("Find a matchup")).toBeVisible();
  await expect(page.locator(".team-picker, .section-heading, .freshness, .refresh-mini")).toHaveCount(0);
});

test("Filters is a sheet with Status, Competition, Window and Sort by; Reset and Done work", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Upcoming/ })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["Competition", "Window", "Sort by"]) await expect(sheet.getByLabel(label)).toBeVisible();
  await expect(sheet.getByLabel("Find a matchup")).toHaveCount(0); // search lives in the control row
  await sheet.getByRole("button", { name: /^Past games/ }).click();
  await sheet.getByLabel("Sort by").selectOption("importance");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".phone-controls").getByRole("button", { name: /^Filters/ })).toContainText("2"); // two filters changed
  await page.getByRole("button", { name: /^Filters/ }).click();
  await sheet.getByRole("button", { name: "Reset" }).click();
  await expect(sheet.getByRole("button", { name: /^Upcoming/ })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByLabel("Sort by")).toHaveValue("date");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".phone-controls").getByRole("button", { name: /^Filters/ })).not.toContainText("2");
});

test("a swipe down closes the Filters sheet", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  const bar = sheet.locator(".sheet-bar");
  await touch(page, bar, "pointerdown", 500);
  await touch(page, bar, "pointermove", 600);
  await touch(page, bar, "pointermove", 700);
  await touch(page, bar, "pointerup", 700);
  await expect(sheet).toBeHidden();
});

test("the Teams sheet searches, picks All 32 and My three, and updates the count", async ({ page }) => {
  await open(page);
  const count = page.locator(".phone-controls .pc-button b").first();
  await expect(count).toHaveText("3");
  await page.getByRole("button", { name: "Choose teams" }).click();
  const sheet = page.getByRole("dialog", { name: "Teams" });
  await expect(sheet.getByRole("checkbox")).toHaveCount(32);
  await sheet.getByLabel("Find a team").fill("wild");
  await expect(sheet.getByRole("checkbox")).toHaveCount(1);
  await sheet.getByLabel("Find a team").fill("");
  await sheet.getByRole("button", { name: "All 32", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "All 32", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "My three", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "My three", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Clear" }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(count).toHaveText("0");
});

test("Search narrows the games from the control row", async ({ page }) => {
  await open(page);
  const before = await page.locator(".game-card").count();
  await page.getByLabel("Find a matchup").fill("Wild");
  await expect.poll(() => page.locator(".game-card").count()).toBeLessThan(before);
  await expect(page.locator(".game-card").first()).toContainText("Wild");
});

test("the header shows a status pill: saved copy when live scores are down", async ({ page }) => {
  await open(page);
  await expect(page.locator(".status-pill")).toHaveAttribute("data-state", "saved");
  await expect(page.locator(".status-pill")).toContainText("saved copy");
  await expect(page.locator(".status-banner")).toContainText("Live scores unavailable");
  await expect(page.locator(".status-banner").getByRole("button", { name: "Retry" })).toBeVisible();
});

test("with live scores working there is no banner, and the pill says live when a game is on", async ({ page }) => {
  const games = scoreboardFixture.games.map((g) => ({ ...g, state: "LIVE", intermission: false, period: 2, periodType: "REG", clock: "10:00" }));
  await open(page, { ...scoreboardFixture, updatedAt: new Date().toISOString(), games });
  await expect(page.locator(".status-pill")).toHaveAttribute("data-state", "live");
  await expect(page.locator(".status-banner")).toHaveCount(0);
  await expect(page.getByTestId("live-dot")).toBeVisible(); // a dot on the Games tab
});

test("pulling down from the top refreshes the data; a short pull does not", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.addEventListener("iceboard:refresh", () => ((window as any).__refreshes = ((window as any).__refreshes ?? 0) + 1)));
  const client = await page.context().newCDPSession(page);
  const drag = async (to: number) => {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 200 }] });
    for (let y = 200; y <= to; y += 20) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await drag(260); // a short pull
  expect(await page.evaluate(() => (window as any).__refreshes ?? 0)).toBe(0);
  await drag(520); // a long pull
  await expect.poll(() => page.evaluate(() => (window as any).__refreshes ?? 0)).toBe(1);
});

test("hover styling does not stick to the tab bar after a tap", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Standings", exact: true }).tap();
  const bg = await page.getByRole("button", { name: "Scoreboard", exact: true }).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe("rgba(0, 0, 0, 0)");
});
