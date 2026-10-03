import { test, expect } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
test("default teams, league selection, graphs and season navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.locator(".team-menu summary span")).toHaveText("3");
  await expect(page.getByRole("button", { name: "EDM", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "CHI", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "MIN", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const card = page.locator(".game-card").first();
  await expect(card.locator(".tv-network")).toBeVisible();
  await expect(card.locator(".team-record")).toHaveCount(2);
  await expect(card.locator(".team-record").first()).toContainText(/playoffs/i);
  await expect(card.locator(".team-record").first()).not.toContainText(/record/i);
  await expect(card.locator(".season-series")).toContainText("H2H THIS SEASON");
  await expect(card.locator(".tv-network")).not.toContainText("T#");
  await expect(card.locator(".network-logo img").first()).toBeVisible();
  await expect(card.getByLabel("Pregame projection")).toBeHidden();
  await card.locator(".game-card-summary").click();
  await expect(card.getByLabel("Pregame projection")).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({path: `../nhl-projection-${test.info().project.name}.png`});
  await expect(card.locator(".form-chart")).toContainText("RECENT FORM");
  await expect(card.locator(".scenario-grid")).toHaveCount(0);
  await card.getByText("Why this game matters", { exact: false }).click();
  await expect(card.locator(".detail-body").first()).toContainText(
    "Equal ratings share ranks.",
  );
  await page.getByRole("button", { name: "All 32", exact: true }).click();
  await expect(page.locator(".results-line")).toContainText(
    "32 selected teams",
  );
  await page.getByRole("button", { name: "My three", exact: true }).click();
  await page.getByRole("button", { name: "Team trends", exact: true }).click();
  await expect(page.locator(".chart-wrap svg")).toBeVisible();
  await expect(page.getByLabel("Metric")).toHaveValue("playoffs");
  await expect(page.locator(".trend-panel")).toContainText("Current season only");
  await expect(page.locator(".chart-wrap image")).toHaveCount(3);
  await page.getByRole("button", { name: "Game center", exact: true }).click();
  await page.getByLabel("Season", { exact: true }).selectOption("20252026");
  await expect(page.locator(".game-card").first()).toContainText("FINAL");
  await page.getByRole("button", { name: "Team trends", exact: true }).click();
  await expect(page.locator(".chart-wrap svg")).toBeVisible();
  await expect(page.getByLabel("Metric")).toHaveValue("difference");
  await expect(page.getByLabel("Metric").locator('option[value="playoffs"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(32);
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Game Center defaults to chronological order; All 32 narrows the window, not the sort", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.getByLabel("Sort by")).toHaveValue("date");
  await expect(page.getByLabel("Window")).toHaveValue("30");
  await expect(page.locator(".game-day-heading").first()).toBeVisible();
  await expect(page.locator(".results-line")).toContainText(
    "Today's games first",
  );
  await page.getByRole("button", { name: "All 32", exact: true }).click();
  await expect(page.getByLabel("Sort by")).toHaveValue("date");
  await expect(page.getByLabel("Window")).toHaveValue("7");
  await expect(page.locator(".game-day-heading").first()).toBeVisible();
  // A visitor can still switch to importance ranking manually.
  await page.getByLabel("Sort by").selectOption("importance");
  await expect(page.locator(".game-day-heading")).toHaveCount(0);
  await expect(page.locator(".results-line")).toContainText(
    "Rank = league-wide",
  );
  await page.getByRole("button", { name: "My three", exact: true }).click();
  await expect(page.getByLabel("Window")).toHaveValue("30");
});
test("featured team shortcuts filter to exactly one team", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();

  for (const id of ["EDM", "CHI", "MIN"] as const) {
    await page.getByRole("button", { name: id, exact: true }).click();
    await expect(page.locator(".team-menu summary span")).toHaveText("1");
    await expect(page.locator(".results-line")).toContainText("1 selected team");
    await expect(page.locator(".game-card").first()).toBeVisible();
    expect(
      await page.locator(".game-card").evaluateAll(
        (cards, teamId) =>
          cards.every((card) =>
            Boolean(card.querySelector(`img[src="/logos/${teamId}.svg"]`)),
          ),
        id,
      ),
    ).toBe(true);
  }
});
test("finished-today games collapse into a compact expandable strip", async ({
  page,
}) => {
  const today = new Date().toLocaleDateString("en-CA");
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
  const season = manifest.current;
  const snapshot = {
    season,
    updatedAt: new Date().toISOString(),
    source: "test fixture",
    games: [
      {
        id: 9101,
        season,
        type: 2,
        date: today,
        start: `${today}T18:00:00Z`,
        state: "FINAL",
        scheduleState: "OK",
        venue: "Test Arena",
        home: "EDM",
        away: "CHI",
        homeScore: 4,
        awayScore: 2,
        end: "REG",
        broadcasts: [],
        round: null,
      },
      {
        id: 9102,
        season,
        type: 2,
        date: tomorrow,
        start: `${tomorrow}T23:00:00Z`,
        state: "FUT",
        scheduleState: "OK",
        venue: "Test Arena",
        home: "MIN",
        away: "CHI",
        homeScore: null,
        awayScore: null,
        end: "",
        broadcasts: [],
        round: null,
      },
    ],
  };
  await page.route(`**/api/season/${season}`, (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.route(`**/data/seasons/${season}.json`, (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.goto("/");
  // The finished-today strip sits before the main upcoming grid in the DOM,
  // and its own card is hidden (inside a closed <details>) until expanded —
  // so scope to the grid that follows the strip to find the visible one.
  await expect(
    page.locator(".finished-today ~ .game-grid .game-card").first(),
  ).toBeVisible();
  const strip = page.locator(".finished-today");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Finished today");
  await expect(strip).toContainText("1");
  await expect(strip).toContainText("CHI 2");
  await expect(strip).toContainText("4 EDM");
  // Collapsed by default: the full game card exists but isn't shown yet,
  // since it's inside the closed <details>.
  await expect(strip).not.toHaveAttribute("open", "");
  await expect(strip.locator(".game-card")).toBeHidden();
  await strip.locator("> summary").click();
  await expect(strip).toHaveAttribute("open", "");
  await expect(strip.locator(".game-card")).toBeVisible();
  await expect(strip.locator(".game-card")).toContainText("Edmonton");
});
test("recent actual game contribution and mobile card layout", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.getByRole("button", { name: /Past games/ }).click();
  await page.getByLabel("Competition").selectOption("1");
  await page.getByLabel("Sort by").selectOption("date");
  const card = page.locator(".game-card").first();
  await card.locator(".game-card-summary").click();
  await card.getByText("Player impact · actual").click();
  await expect(card).toContainText("Actual box-score index");
  await expect(card.locator(".impact-row").first()).toBeVisible();
  if (info.project.name === "mobile") {
    expect(
      await page
        .locator(".game-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(1);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const spacing = await card.locator(".matchup").evaluate((matchup) => {
      const box = (element: Element) => element.getBoundingClientRect();
      const teams = box(matchup.querySelector(".matchup-teams")!);
      const importance = box(matchup.querySelector(".importance-score")!);
      const rows = [...matchup.querySelectorAll(".matchup-team")].map((row) => {
        const label = box(row.querySelector(":scope > div")!);
        const score = box(row.querySelector(":scope > b, :scope > small")!);
        return score.left - label.right;
      });
      return { importanceGap: importance.left - teams.right, scoreGaps: rows };
    });
    expect(spacing.importanceGap).toBeGreaterThanOrEqual(8);
    for (const gap of spacing.scoreGaps) expect(gap).toBeGreaterThanOrEqual(7);
  }
});
