import { expect, test } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null, end: "" };
const snapshot = {
  season, updatedAt: new Date().toISOString(), source: "fixture",
  games: [
    { ...base, id: 9301, away: "COL", home: "WPG", state: "LIVE", awayScore: 2, homeScore: 2, period: 3, periodType: "REG", clock: "04:10", start: new Date(Date.now() - 3600000).toISOString() },
    { ...base, id: 9302, away: "CHI", home: "EDM", state: "FUT", awayScore: null, homeScore: null, start: new Date(Date.now() + 20 * 60000).toISOString() },
  ],
};
async function open(page: import("@playwright/test").Page) {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  await expect(page.locator(".wn-tile").first()).toBeVisible();
}

test("motion is on by default: the ring fills in and the late-game glow loops", async ({ page }) => {
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  const glow = await page.locator(".wn-tile.hot").evaluate((e) => getComputedStyle(e, "::after").animationName);
  expect(glow).toBe("late-glow");
  await expect(page.locator(".sr-fill").first()).toBeVisible();
});

test("reduced motion switches every effect off and shows the ring already full", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(await page.locator(".wn-tile.hot").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
  expect(await page.locator(".wn-when i").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  const fill = page.locator(".sr-fill").first();
  expect(await fill.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  // Not mid-fill: the dash offset is already at its final value.
  const circle = 2 * Math.PI * 21;
  const offset = Number(await fill.getAttribute("stroke-dashoffset"));
  expect(offset).toBeLessThan(circle);
});

test("a hidden tab pauses the looping animations", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.locator("html")).toHaveAttribute("data-hidden", "");
  expect(await page.locator(".wn-when i").first().evaluate((e) => getComputedStyle(e).animationPlayState)).toBe("paused");
});
