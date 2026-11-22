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
    // every team now has its arena's artwork
    const nj = page.locator('.sb-row[data-game="9802"] [data-testid=arena-board]');
    await expect(nj).toHaveAttribute("data-board", "art");
    await expect(nj.locator(".jb-art > img")).toHaveAttribute("src", "/scoreboards/NJD.webp");
    await strip.click();
    await expect(page.locator("dialog.game-dialog[open]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("live, on a phone: the stats go under the board (the video screen is too small), and scrolling never drops them (no flicker)", async ({ page }) => {
  const { normalizeGameFeed } = await import("../../src/lib/game-data.mjs");
  const raw = JSON.parse((await import("node:fs")).readFileSync("tests/fixtures/gc/real-reg.json", "utf8").replace(/"COL"/g, '"BOS"').replace(/"SEA"/g, '"WSH"'));
  const feed = normalizeGameFeed(raw);
  await page.setViewportSize({ width: 390, height: 844 });
  const g = mk.live(9901, "WSH", "BOS", { period: 3, clock: "19:54", score: [4, 5] });
  await seedPrefs(page, {}); await mockApis(page, { games: [g, mk.upcoming(9902, "TOR", "DAL", { time: "03:00" })], live: [g], gameDetail: () => ({ ...feed, ...g, state: "LIVE" }) });
  await page.goto("/");
  const row = page.locator('.sb-row[data-game="9901"]');
  await expect(row.locator(".jb-alt")).toBeVisible({ timeout: 30000 });
  await expect(row.getByTestId("board-screen")).toBeHidden();
  const [screen, strip] = [await row.locator(".jb-art").boundingBox(), await row.locator(".jb-ribbon").boundingBox()];
  expect(strip!.y + strip!.height).toBeLessThanOrEqual(screen!.y + screen!.height + 1);
  // the feed watcher is near the bottom of the card: scroll it out of view and the numbers stay, so the card does not change height
  await row.locator(".jb-art").scrollIntoViewIfNeeded();
  const h = (await row.boundingBox())!.height;
  await page.mouse.wheel(0, 150); await page.waitForTimeout(600);
  await expect(row.locator(".jb-alt")).toBeVisible();
  expect(Math.abs((await row.boundingBox())!.height - h)).toBeLessThan(2);
});
