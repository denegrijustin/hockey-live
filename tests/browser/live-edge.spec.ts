import { test, expect } from "@playwright/test";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };
import edgeFixture from "../../public/data/edge/20262027/EDM.json" with { type: "json" };
test("live data updates without collapsing open cards; failure retains last score", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  const game = {
    ...scoreboardFixture.games.find((g) => g.id === fixture.id)!,
    state: "LIVE",
    homeScore: 0,
  };
  await page.route("**/api/live", async (route) => {
    calls++;
    if (calls > 2)
      return route.fulfill({
        status: 503,
        json: { error: "Temporary outage" },
      });
    await route.fulfill({
      json: {
        updatedAt: new Date().toISOString(),
        date: game.date,
        games: [{ ...game, homeScore: calls - 1 }],
      },
    });
  });
  await page.route("**/api/game/*", (route) =>
    route.fulfill({ json: { ...fixture, state: "LIVE" } }),
  );
  await page.goto("/");
  await expect(page.locator(".live-strip")).toContainText("FLA");
  await page.locator(".live-strip button").first().click();
  const card = page.locator(".live-card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".shot-chart")).toBeVisible();
  await expect(card.locator(".scenario-grid")).toHaveCount(0);
  await card.getByText("Why this game matters", { exact: false }).click();
  await expect(card.locator(".card-details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page.clock.fastForward(31000);
  await expect(card.locator(".matchup-team").last().locator("b")).toHaveText(
    "1",
  );
  await expect(card.locator(".card-details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page.clock.fastForward(31000);
  await expect(page.locator(".live-strip")).toContainText("Update unavailable");
  await expect(card.locator(".matchup-team").last().locator("b")).toHaveText(
    "1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("EDGE comparison shows source season, league benchmarks and shot data", async ({
  page,
}) => {
  await page.route("**/api/edge/**", (route) =>
    route.fulfill({ json: edgeFixture }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "NHL EDGE", exact: true }).click();
  const card = page.locator(".edge-grid .edge-card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Top skating speed");
  await expect(card).toContainText("Previous-season context");
  await expect(card.locator(".edge-metric")).toHaveCount(4);
  await expect(card.locator(".zone-labels")).toContainText("Offensive");
  await expect(card.locator(".location-row")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
