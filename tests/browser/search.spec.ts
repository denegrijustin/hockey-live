import { expect, test, type Page } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";

const games = [
  mk.upcoming(9801, "CHI", "EDM"),
  mk.live(9802, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] }),
  mk.final(9803, "BOS", "TOR"),
];
async function open(page: Page, url = "/") {
  await mockApis(page, { games });
  await page.goto(url);
  await expect(page.locator(".sb-row").first()).toBeVisible();
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "Search" });
const box = (page: Page) => dialog(page).getByRole("combobox");

test.describe("search palette", () => {
  test("header button opens it, results are grouped, Escape closes and returns focus", async ({ page }) => {
    await open(page);
    const trigger = page.getByRole("button", { name: "Search", exact: true });
    await trigger.click();
    await expect(dialog(page)).toBeVisible();
    await expect(box(page)).toBeFocused();
    await box(page).fill("bos");
    await expect(dialog(page).getByRole("option").first()).toContainText("Boston Bruins");
    await expect(dialog(page).getByText("Teams", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Ctrl+K and / open it; / is ignored while typing in an input", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // The Games screen has its own matchup field: typing "/" there must not open search.
    await page.goto("/?view=games");
    const find = page.locator('input[aria-label="Find a matchup"], input[type="search"][placeholder^="Team or opponent"]').first();
    await expect(find).toBeVisible();
    await find.focus();
    await page.keyboard.type("a/b");
    await expect(dialog(page)).toHaveCount(0);
    await expect(find).toHaveValue("a/b");
  });

  test("arrow keys move the active option and Enter picks it (a page)", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await box(page).fill("stand");
    const options = dialog(page).getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    const id = await options.first().getAttribute("id");
    await expect(box(page)).toHaveAttribute("aria-activedescendant", id!);
    await box(page).fill("t");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await box(page).fill("standings");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/view=standings/);
  });

  test("picking a game opens its Game Center on Home, even from another screen", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/?view=standings");
    await expect(page.getByRole("heading", { name: /Standings/ }).first()).toBeVisible();
    await page.keyboard.press("Control+k");
    await box(page).fill("chi vs edm");
    await expect(dialog(page).getByText("Games", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.game-dialog")).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveURL(/view=standings/);
  });

  test("picking a team goes to its team address", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await box(page).fill("EDM");
    await expect(dialog(page).getByRole("option").first()).toContainText("Edmonton Oilers");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=teams&team=EDM/);
  });

  test("empty and no-result states", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await box(page).fill("zzzzqq");
    await expect(dialog(page).getByRole("status")).toContainText("No teams, games, players or pages match");
    await box(page).fill("");
    await expect(dialog(page).getByRole("option").first()).toBeVisible();
  });

  test("Tab stays inside the dialog", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await expect(box(page)).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.search-dialog"))).toBe(true);
    }
  });

  test("at 360px it is a full-width sheet and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await box(page).fill("a");
    const r = await dialog(page).boundingBox();
    expect(r!.width).toBeGreaterThanOrEqual(359);
    expect(await dialog(page).evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`readable in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await page.keyboard.press("Control+k");
      await box(page).fill("bos");
      const lum = (c: string) => { const m = c.match(/\d+(\.\d+)?/g)!.map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      const { bg, fg } = await dialog(page).evaluate((d) => ({ bg: getComputedStyle(d).backgroundColor, fg: getComputedStyle(d.querySelector(".search-text b")!).color }));
      expect(Math.abs(lum(bg) - lum(fg))).toBeGreaterThan(0.4);
      if (scheme === "light") expect(lum(bg)).toBeGreaterThan(0.5); else expect(lum(bg)).toBeLessThan(0.5);
    });
  }
});
