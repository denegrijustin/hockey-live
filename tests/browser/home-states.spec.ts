import { expect, test } from "@playwright/test";
import { count, mk, mockApis } from "./fixtures-games";

// Card states on the Home board. Today's puck drops are all 23:00 UTC unless stated; finals are dated today so they show on the same day.
const games = [
  mk.upcoming(9301, "CHI", "EDM"),
  mk.live(9302, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] }),
  mk.intermission(9303, "SEA", "VAN"),
  mk.final(9304, "BOS", "TOR", { score: [2, 3] }),
  mk.ot(9305, "NYR", "NJD"),
  mk.so(9306, "MIN", "DAL"),
  mk.live(9307, "LAK", "ANA", { period: 4, periodType: "OT", clock: "02:15", score: [3, 3] }),
  mk.live(9308, "TBL", "FLA", { period: 5, periodType: "SO", clock: "", score: [2, 2] }),
];

test.describe("home card states", () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
  });

  test("upcoming shows the puck-drop time and no score", async ({ page }) => {
    const row = page.locator('.sb-row[data-game="9301"]');
    await expect(row).toHaveClass(/soon/);
    await expect(row.locator(".sb-status")).toHaveText(/^\d{1,2}:\d{2}\s?[AP]M$/);
    await expect(row.locator(".ts-num")).toHaveText(["", ""]);
  });

  test("live shows period and clock with the score", async ({ page }) => {
    const row = page.locator('.sb-row[data-game="9302"]');
    await expect(row).toHaveClass(/live/);
    await expect(row.locator(".sb-status")).toContainText("P3 · 04:10");
    await expect(row.locator(".ts-num")).toHaveText(["2", "2"]);
    await expect(row.locator(".sb-main")).toHaveAttribute("aria-label", /Colorado Avalanche at Winnipeg Jets\. COL 2, WPG 2, live, period 3, 04:10 left/);
  });

  test("intermission, overtime and shootout read as such", async ({ page }) => {
    await expect(page.locator('.sb-row[data-game="9303"] .sb-status')).toContainText("P1 · Intermission");
    await expect(page.locator('.sb-row[data-game="9307"] .sb-status')).toContainText("OT · 02:15");
    await expect(page.locator('.sb-row[data-game="9308"] .sb-status')).toContainText(/^SO/);
  });

  test("finals (regulation, OT, SO) are in the Completed strip with the right tag, scores and winner wording", async ({ page }) => {
    const done = page.getByTestId("sb-done");
    await expect(done.locator("li")).toHaveCount(3);
    await expect(done.locator('[data-game-id="9304"] em')).toHaveText("F");
    await expect(done.locator('[data-game-id="9305"] em')).toHaveText("F/OT");
    await expect(done.locator('[data-game-id="9306"] em')).toHaveText("F/SO");
    await expect(done.locator('[data-game-id="9305"] .sb-main')).toHaveAttribute("aria-label", /final in OT/i);
    await expect(done.locator('[data-game-id="9306"] .sb-main')).toHaveAttribute("aria-label", /final in SO/i);
  });

  test("the Completed filter shows each final as a row with its final label", async ({ page }) => {
    await page.getByRole("button", { name: /3 completed/ }).click();
    await expect(page.locator(".sb-row")).toHaveCount(3);
    await expect(page.locator('.sb-row[data-game="9304"] .sb-status')).toHaveText(/^Final$/);
    await expect(page.locator('.sb-row[data-game="9305"] .sb-status')).toHaveText(/^Final\/OT$/);
    await expect(page.locator('.sb-row[data-game="9306"] .sb-status')).toHaveText(/^Final\/SO$/);
    // The winner is marked: the loser's team block is dimmed (.lost) on the 3-2 home win.
    await expect(page.locator('.sb-row[data-game="9304"] .sb-team.lost')).toHaveCount(1);
  });

  test("status chip counts agree with the cards", async ({ page }) => {
    const bar = page.getByRole("group", { name: "Show games by status" });
    await expect(bar.getByRole("button", { name: /4 in progress/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /3 completed/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /1 upcoming/ })).toBeVisible();
  });

  test("no game is rendered as two rows", async ({ page }) => {
    const ids = await page.locator(".sb-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

test.describe("home card states: exact shared status text", () => {
  test("every row's status equals gameStatus().label (Final/OT, Final/SO)", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    await page.getByRole("button", { name: /3 completed/ }).click();
    await expect(page.locator('.sb-row[data-game="9305"] .sb-status')).toHaveText("Final/OT");
    await expect(page.locator('.sb-row[data-game="9306"] .sb-status')).toHaveText("Final/SO");
  });
});

test.describe("home card states: postponed", () => {
  test("a postponed game says Postponed instead of a start time", async ({ page }) => {
    const g = [mk.postponed(9310, "CHI", "EDM"), mk.upcoming(9311, "MIN", "DAL")];
    const m = await mockApis(page, { games: g });
    await page.goto("/");
    await expect(page.locator('.sb-row[data-game="9310"] .sb-status')).toHaveText(/Postponed/, { timeout: 3000 });
    expect(count(m.log, "/api/game/9310")).toBe(0);
  });
});
