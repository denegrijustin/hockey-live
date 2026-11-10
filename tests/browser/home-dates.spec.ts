import { expect, test } from "@playwright/test";
import { etDay, mk, mockApis } from "./fixtures-games";

const games = [
  mk.final(9951, "BOS", "TOR", { offset: -2 }),
  mk.final(9955, "NJD", "NYR", { offset: -1 }), // Previous day steps game days, so yesterday needs a game
  mk.upcoming(9952, "CHI", "EDM"),
  mk.upcoming(9953, "SEA", "VAN", { offset: 1 }),
  mk.upcoming(9954, "MIN", "DAL", { offset: 4 }),
];
const heading = (p: import("@playwright/test").Page) => p.locator(".sb-day h1");

test.describe("home date strip", () => {
  test("previous / next step the day, Today returns, and the strip is present", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.getByTestId("date-strip")).toBeVisible();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(heading(page)).toHaveText("Tomorrow");
    await page.getByTestId("date-today").click();
    await expect(heading(page)).toHaveText("Today");
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(heading(page)).toHaveText("Yesterday");
  });

  test("the picker jumps to a chosen date and puts it in the URL as &date=", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    const target = etDay(4);
    await page.getByTestId("date-picker").fill(target);
    await expect(page).toHaveURL(new RegExp(`date=${target}`));
    await expect(page.locator('.sb-row[data-game="9954"]')).toBeVisible();
  });

  test("the URL carries no date while the person is on the automatic day, and Today clears it", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    expect(page.url()).not.toContain("date=");
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/date=/);
    await page.getByTestId("date-today").click();
    expect(page.url()).not.toContain("date=");
  });

  test("a link with ?date= opens that day, and browser Back returns to the previous day", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto(`/?view=scoreboard&date=${etDay(1)}`);
    await expect(heading(page)).toHaveText("Tomorrow");
    await page.getByRole("button", { name: "Next day" }).click();
    await page.goBack();
    await expect(heading(page)).toHaveText("Tomorrow");
  });

  test("an invalid ?date= falls back to the automatic day without an error", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/?date=2026-13-45");
    await expect(heading(page)).toHaveText("Today");
    await expect(page.locator(".empty.error")).toHaveCount(0);
  });

  test("the selected date survives opening and closing the Game Center", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto(`/?date=${etDay(1)}`);
    await expect(heading(page)).toHaveText("Tomorrow");
    await page.locator('.sb-row[data-game="9953"] .sb-main').click();
    await expect(page.locator("dialog.game-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.game-dialog")).toHaveCount(0);
    await expect(heading(page)).toHaveText("Tomorrow");
    await expect(page).toHaveURL(new RegExp(`date=${etDay(1)}`));
  });

  test("midnight Eastern rolls the automatic day over but not a day the person picked", async ({ page }) => {
    const start = new Date("2026-11-10T23:59:00-05:00");
    await page.clock.install({ time: start });
    await mockApis(page, { games: [mk.upcoming(9961, "CHI", "EDM", { date: "2026-11-10" }), mk.upcoming(9962, "SEA", "VAN", { date: "2026-11-11" })] });
    await page.goto("/");
    await expect(page.locator(".sb-day span")).toHaveText("Tuesday, November 10");
    await page.clock.fastForward(120_000);
    await expect(page.locator(".sb-day span")).toHaveText("Wednesday, November 11");
    await expect(heading(page)).toHaveText("Today");
  });

  test("an empty day shows the empty state with the strip still usable; stepping out of it works", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto(`/?date=${etDay(2)}`); // no games two days from now
    await expect(page.getByTestId("home-empty")).toBeVisible();
    await expect(page.getByTestId("date-strip")).toBeVisible();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.getByTestId("home-empty")).toHaveCount(0);
  });
});
