import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA");
const game = (id: number, offset: number, away: string, home: string, state = "FUT", score: [number, number] | [null, null] = [null, null]) => ({
  id, season, type: 2, date: day(offset), start: `${day(offset)}T23:00:00Z`, state, scheduleState: "OK", venue: "Test Arena",
  home, away, homeScore: score[1], awayScore: score[0], end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null,
});

async function open(page: Page, url = "/") {
  const snapshot = {
    season, updatedAt: new Date().toISOString(), source: "test fixture",
    games: [game(9201, 0, "CHI", "EDM"), game(9202, 0, "MIN", "DAL"), game(9203, 0, "BOS", "TOR", "FINAL", [2, 3]), game(9204, 1, "NYR", "NJD")],
  };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto(url);
}

test.describe("scoreboard home", () => {
  test("opens on the day's games with win probability and none of the schedule controls", async ({ page }) => {
    await open(page);
    await expect(page.locator(".sb-row")).toHaveCount(3);
    await expect(page.locator(".sb-prob")).toHaveCount(2); // the final has none
    await expect(page.locator(".control-dock")).toHaveCount(0);
    await expect(page.locator(".game-card")).toHaveCount(0);
  });

  test("tapping a game shows a few key stats; Full game center is the second step", async ({ page }) => {
    await open(page);
    const row = page.locator(".sb-row.soon").first();
    await expect(page.getByTestId("key-stats")).toHaveCount(0);
    await row.locator(".sb-main").click();
    const stats = row.getByTestId("key-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("Record");
    await expect(page.locator("dialog.game-dialog")).toHaveCount(0);
    await stats.getByRole("button", { name: "Full game center" }).click();
    await expect(page.locator("dialog.game-dialog, .game-panel").first()).toBeVisible();
  });

  test("days can be stepped, and the old game list is still the Schedule view", async ({ page }) => {
    await open(page);
    const heading = page.locator(".sb-day h1");
    const before = await heading.innerText();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(heading).not.toHaveText(before);
    await expect(page.locator(".sb-row")).toHaveCount(1);
    await open(page, "/?view=games");
    await expect(page.locator(".game-card").first()).toBeVisible();
    await expect(page.locator(".sb-row")).toHaveCount(0);
  });
});
