import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";

// A fixed "now": 2026-11-10 10:00 ET. The hockey day is the Eastern date (2026-11-10), whatever zone the viewer is in.
const NOW = new Date("2026-11-10T10:00:00-05:00");
const ET_DAY = "2026-11-10";
const localTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
const GAMES = [
  mk.upcoming(9501, "CHI", "EDM", { date: ET_DAY, start: "2026-11-11T00:00:00Z" }),
  mk.upcoming(9502, "SEA", "VAN", { date: ET_DAY, start: "2026-11-11T04:30:00Z" }),
  mk.upcoming(9503, "MIN", "DAL", { date: "2026-11-11", start: "2026-11-12T00:00:00Z" }),
];

for (const tz of ["Pacific/Auckland", "America/Los_Angeles", "Europe/Helsinki"]) {
  test.describe(`viewer in ${tz}`, () => {
    test.use({ timezoneId: tz });

    test("the day heading follows the Eastern game date, the start times follow the viewer's zone", async ({ page }) => {
      await page.clock.install({ time: NOW });
      await mockApis(page, { games: GAMES });
      await page.goto("/");
      await expect(page.locator(".sb-day h1")).toHaveText("Today");
      await expect(page.locator(".sb-day span")).toHaveText("Tuesday, November 10");
      await expect(page.locator('.sb-row[data-game="9501"] .sb-status')).toHaveText(localTime(GAMES[0].start, tz));
      // The 23:30 ET puck drop is on the Eastern day 10th even where the local date is already the 11th.
      await expect(page.locator('.sb-row[data-game="9502"]')).toBeVisible();
      await expect(page.locator('.sb-row[data-game="9502"] .sb-status')).toHaveText(localTime(GAMES[1].start, tz));
      await expect(page.locator('.sb-row[data-game="9503"]')).toHaveCount(0); // tomorrow's game is not on today's board
    });

    test("stepping to the next day shows Tomorrow, with that day's game at its local time", async ({ page }) => {
      await page.clock.install({ time: NOW });
      await mockApis(page, { games: GAMES });
      await page.goto("/");
      await page.getByRole("button", { name: "Next day" }).click();
      await expect(page.locator(".sb-day h1")).toHaveText("Tomorrow");
      await expect(page.locator(".sb-day span")).toHaveText("Wednesday, November 11");
      await expect(page.locator('.sb-row[data-game="9503"] .sb-status')).toHaveText(localTime(GAMES[2].start, tz));
    });

    test("useEtToday: the day rolls over at Eastern midnight, not at the viewer's midnight", async ({ page }) => {
      // 23:58 ET on the 10th. In Auckland and Helsinki the local date is already the 11th; in Los Angeles it is still the 10th.
      await page.clock.install({ time: new Date("2026-11-10T23:58:00-05:00") });
      await mockApis(page, { games: GAMES });
      await page.goto("/");
      await expect(page.locator(".sb-day span")).toHaveText("Tuesday, November 10");
      await page.clock.fastForward(3 * 60_000);
      await expect(page.locator(".sb-day span")).toHaveText("Wednesday, November 11");
      await expect(page.locator(".sb-day h1")).toHaveText("Today");
    });
  });
}
