import { expect, test, type Page } from "@playwright/test";
import { goTo, goToAllGames } from "./nav";
import { DATA_DAY, DATA_NOW } from "./clock";

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(DATA_NOW);
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
}

test.describe("wide screens", () => {
  test("a sidebar lists every view, marks the current one, and switches views", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "desktop layout");
    await open(page, 1440, 900);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button")).toHaveCount(16); // every view: four primary plus twelve in the groups
    await expect(nav.getByRole("button", { name: "Games", exact: true })).toHaveAttribute("aria-current", "page"); // the league-wide list is the Games view
    await expect(nav.getByRole("button", { name: "Home", exact: true })).not.toHaveAttribute("aria-current", "page");
    await expect(page.locator(".tab-bar")).toHaveCount(0);
    await nav.getByRole("button", { name: "Standings" }).click();
    await expect(nav.getByRole("button", { name: "Standings" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("tbody tr")).toHaveCount(32);
    // It stays in view while the page scrolls.
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    expect((await nav.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    // Content sits to its right, and the Game Center is a window with Close, not a sheet.
    await goToAllGames(page);
    await expect(page.locator(".control-dock")).toBeVisible();
    expect((await page.locator(".control-dock").boundingBox())!.x).toBeGreaterThan((await nav.boundingBox())!.x + (await nav.boundingBox())!.width);
    await page.locator(".game-card-summary").first().click();
    await page.locator(".primary-game-center").first().click();
    const dialog = page.locator("dialog.game-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".close-full")).toBeVisible();
    await expect(dialog.locator(".close-done")).toBeHidden();
  });
});

test.describe("phones", () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, "phone layout"));

  test("a tab bar holds four destinations and More; More opens a grouped menu with the rest", async ({ page }) => {
    await open(page, 390, 844);
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar.getByRole("button")).toHaveCount(5);
    for (const name of ["Home", "Games", "Standings", "Teams", "More"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Games", exact: true })).toHaveAttribute("aria-current", "page"); // the league-wide list is the Games tab
    await expect(bar.getByRole("button", { name: "Team trends" })).toHaveCount(0); // Trends and Players live in More now
    await bar.getByRole("button", { name: "Standings" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(32);
    await expect(bar.getByRole("button", { name: "Standings" })).toHaveAttribute("aria-current", "page");
    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("button")).toHaveCount(14); // twelve views + My teams + Refresh data
    for (const name of ["Last night", "Schedule", "Team trends", "Playoff odds", "Picks", "NHL+", "NHL EDGE", "Imperialism map", "Players", "Injury report", "Following", "Settings", "My teams", "Refresh data"]) await expect(sheet.getByRole("button", { name: new RegExp(`^${name.replace(/[+]/g, "\\+")}`) })).toBeVisible();
    for (const group of ["Games & schedule", "League intelligence", "Players & teams", "Application"]) await expect(sheet.getByRole("region", { name: group })).toBeVisible();
    await sheet.getByRole("button", { name: /^Team trends/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator(".chart-wrap svg")).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page"); // Team trends is in More, so More is highlighted
    await bar.getByRole("button", { name: "More" }).click();
    await sheet.getByRole("button", { name: /^NHL\+/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator(".nhlplus").first()).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page"); // a More view is showing
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  });

  test("the More menu closes with Escape, a tap outside, or tapping More again, and can refresh the data", async ({ page }) => {
    await open(page, 390, 844);
    const more = page.getByRole("button", { name: "More", exact: true });
    const menu = page.getByRole("dialog", { name: "More" });
    await more.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await more.click();
    await page.mouse.click(195, 120); // outside the menu, above the tab bar
    await expect(menu).toBeHidden();
    await more.click();
    await more.click();
    await expect(menu).toBeHidden();
    let refreshed = false;
    await page.evaluate(() => window.addEventListener("iceboard:refresh", () => ((window as any).__refreshed = true)));
    await more.click();
    await menu.getByRole("button", { name: /^Refresh data/ }).click();
    refreshed = await page.evaluate(() => !!(window as any).__refreshed);
    expect(refreshed).toBe(true);
    await expect(menu).toBeHidden();
  });

  test("the Game Center is a bottom sheet with a grabber and a Done button", async ({ page }) => {
    await open(page, 390, 844);
    await page.locator(".game-card-summary").first().click();
    await page.locator(".primary-game-center").first().click();
    const dialog = page.locator("dialog.game-dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400); // slide-up finishes
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(Math.round(box.y + box.height) - 844), "docked to the bottom edge").toBeLessThanOrEqual(4);
    expect(Math.abs(box.y), "the Game Center takes the whole screen").toBeLessThanOrEqual(4);
    await expect(dialog.locator(".sheet-grabber")).toBeVisible();
    await expect(dialog.locator(".close-done")).toBeVisible();
    await expect(dialog.locator(".close-full")).toBeHidden();
    await dialog.getByRole("button", { name: "Close full game view" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a swipe down on the Game Center handle closes it", async ({ page }) => {
    await open(page, 390, 844);
    await page.locator(".game-card-summary").first().click();
    await page.locator(".primary-game-center").first().click();
    const dialog = page.locator("dialog.game-dialog");
    await expect(dialog).toBeVisible();
    const bar = dialog.locator(".dialog-toolbar");
    const touch = (type: string, y: number) => bar.dispatchEvent(type, { pointerType: "touch", pointerId: 9, clientY: y, bubbles: true });
    await touch("pointerdown", 100);
    await touch("pointermove", 220);
    await touch("pointerup", 260);
    await expect(dialog).toBeHidden();
  });

  test("the tab bar clears the home indicator and never hides the end of the page", async ({ page }) => {
    await open(page, 390, 844);
    // Cards below the fold size themselves as they scroll into view, so scroll to the end twice.
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(300);
    }
    const bar = (await page.locator(".tab-bar").boundingBox())!;
    const last = (await page.locator("footer").boundingBox())!;
    expect(last.y + last.height, "the footer is fully above the tab bar").toBeLessThanOrEqual(bar.y + 1);
  });
});
