import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";
import { seedPrefs } from "./prefs";

/* Home cards show the home arena's scoreboard: the arena's artwork with the real score strip over its own (or a board drawn in the team's colours), and the strip opens the Game Center. */
const games = [mk.live(9801, "CAR", "EDM", { period: 2, clock: "16:34", score: [1, 2] }), mk.upcoming(9802, "TOR", "NJD", { time: "02:00" })];

for (const width of [1440, 390]) {
  test(`at ${width}px: an arena scoreboard per card, the score strip on it is readable and opens the Game Center`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 });
    await seedPrefs(page, {}); await mockApis(page, { games });
    await page.goto("/");
    const edm = page.locator('.sb-row[data-game="9801"] [data-testid=arena-board]');
    await expect(edm).toHaveAttribute("data-board", "art");
    await expect(edm.locator(".jb-art > img")).toHaveAttribute("src", "/scoreboards/EDM.webp");
    const strip = edm.locator(".jb-ribbon");
    await expect(strip).toContainText("CAR"); await expect(strip).toContainText("EDM"); await expect(strip).toContainText("16:34");
    await expect(strip.locator(".jb-away .sb-score")).toHaveText("1"); await expect(strip.locator(".jb-home .sb-score")).toHaveText("2");
    // the strip covers the artwork's own strip and stays inside the picture, with type big enough to read
    const [s, art] = [await strip.boundingBox(), await edm.locator(".jb-art").boundingBox()];
    expect(s!.x).toBeGreaterThanOrEqual(art!.x - 1); expect(s!.x + s!.width).toBeLessThanOrEqual(art!.x + art!.width + 1); expect(s!.y + s!.height).toBeLessThanOrEqual(art!.y + art!.height + 1);
    expect(Number.parseFloat(await strip.locator(".jb-score").first().evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    // a team with no artwork yet: a board drawn in its colours, with the arena's name
    const dal = page.locator('.sb-row[data-game="9802"] [data-testid=arena-board]');
    await expect(dal).toHaveAttribute("data-board", "drawn");
    await expect(dal.locator(".jb-marquee")).toHaveText("Prudential Center");
    await strip.click();
    await expect(page.locator("dialog.game-dialog[open]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
