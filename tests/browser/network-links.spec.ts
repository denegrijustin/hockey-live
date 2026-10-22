import { test, expect } from "@playwright/test";
import { filterGames, selectAllTeams } from "./controls";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

// Whatever channel a game is on, its logo opens the game on ESPN (the ESPN app on a phone that has it, espn.com otherwise).
test("every channel logo on a card links to the game on ESPN", async ({ page }) => {
  const base = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
  const game = { ...base, state: "LIVE", period: 1, periodType: "REG", intermission: false, clock: "10:00", broadcasts: ["TNT", "SN", "NHLN"] };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.route("**/api/espn/*", (route) => route.fulfill({ json: { games: { [`${game.away}-${game.home}`]: "401999999" } } }));
  await page.goto("/?view=games");
  await selectAllTeams(page);
  await filterGames(page, { competition: String(game.type), window: "all" });
  const card = page.locator(".live-card").first();
  const links = card.locator("a.network-logo-link");
  await expect(links).toHaveCount(3); // TNT, Sportsnet and NHL Network: none of them ESPN's own
  for (let i = 0; i < 3; i++) {
    await expect(links.nth(i)).toHaveAttribute("href", "https://www.espn.com/nhl/game/_/gameId/401999999");
    await expect(links.nth(i)).toHaveAttribute("target", "_blank");
    await expect(links.nth(i)).toHaveAttribute("aria-label", /ESPN app/);
  }
});
