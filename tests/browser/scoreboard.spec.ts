import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
let base = Date.now();
const day = (offset: number) => new Date(base + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const game = (id: number, offset: number, away: string, home: string, state = "FUT", score: [number, number] | [null, null] = [null, null]) => ({
  id, season, type: 2, date: day(offset), start: `${day(offset)}T23:00:00Z`, state, scheduleState: "OK", venue: "Test Arena",
  home, away, homeScore: score[1], awayScore: score[0], end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null,
});

async function open(page: Page, url = "/") {
  const snapshot = {
    season, updatedAt: new Date().toISOString(), source: "test fixture",
    games: [game(9201, 0, "CHI", "EDM"), game(9202, 0, "MIN", "DAL"), game(9203, 0, "BOS", "TOR", "FINAL", [2, 3]), game(9204, 1, "NYR", "NJD"), game(9205, 0, "SEA", "VAN", "FINAL", [1, 4]), { ...game(9206, 0, "COL", "WPG", "LIVE", [2, 2]), period: 3, periodType: "REG", clock: "04:10" }],
  };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto(url);
}

test.describe("scoreboard home", () => {
  test("opens on the day's games with win probability and none of the schedule controls", async ({ page }) => {
    await open(page);
    await expect(page.locator(".sb-row")).toHaveCount(5);
    await expect(page.locator(".sb-prob")).toHaveCount(3); // the finals have none
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

  test("a page left open rolls over to the new day, and uses the feed-independent Eastern date", async ({ page }) => {
    const start = new Date("2026-10-10T23:59:00-04:00");
    base = start.getTime();
    await page.clock.install({ time: start });
    await open(page);
    const heading = page.locator(".sb-day h1");
    const date = page.locator(".sb-day span");
    await expect(heading).toHaveText("Today");
    await expect(date).toHaveText("Saturday, October 10");
    await page.clock.fastForward(120_000);
    await expect(date).toHaveText("Sunday, October 11"); // midnight Eastern passed
    await expect(heading).toHaveText("Today");
    base = Date.now();
  });
  test("status buttons count the day's games and filter the board; Completed shows them expanded", async ({ page }) => {
    await open(page);
    const bar = page.getByRole("group", { name: "Show games by status" });
    await expect(bar.getByRole("button", { name: /1 in progress/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /2 completed/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /2 upcoming/ })).toBeVisible();
    // Sections, in the order the board reads: the live game is either brewing an upset or in progress, then upcoming, then completed.
    const names = await page.locator(".sb-group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.at(-2)).toBe("Upcoming");
    expect(names.at(-1)).toBe("Completed");
    expect(["Upset brewing", "In progress"]).toContain(names[0]);
    // One tap on Completed: only the finals, each already expanded.
    await bar.getByRole("button", { name: /2 completed/ }).click();
    await expect(page.locator(".sb-row")).toHaveCount(2);
    await expect(page.getByTestId("key-stats")).toHaveCount(2);
    await expect(bar.getByRole("button", { name: /2 completed/ })).toHaveAttribute("aria-pressed", "true");
    // Tapping it again brings the whole board back.
    await bar.getByRole("button", { name: /2 completed/ }).click();
    await expect(page.locator(".sb-row")).toHaveCount(5);
    await expect(page.getByTestId("key-stats")).toHaveCount(0);
    await bar.getByRole("button", { name: /2 upcoming/ }).click();
    await expect(page.locator(".sb-row.soon")).toHaveCount(2);
    await expect(page.locator(".sb-row.final")).toHaveCount(0);
  });

  test("games sit in puck-drop slots, the most watchable first, and each shows its watchability", async ({ page }) => {
    await open(page);
    const slot = page.locator(".sb-group.soon .sb-slot");
    await expect(slot).toHaveCount(1); // both upcoming games drop at the same time
    await expect(slot.locator(".sb-slot-h")).toContainText("–");
    const scores = await slot.locator(".sb-watch b").allInnerTexts();
    expect(scores).toHaveLength(2);
    expect(Number(scores[0])).toBeGreaterThanOrEqual(Number(scores[1]));
  });

  test("the board fits a 360px phone with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    await expect(page.locator(".sb-row").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
    await page.getByRole("button", { name: /completed/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  });
});
