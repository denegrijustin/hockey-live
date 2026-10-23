import { test, expect, type Page } from "@playwright/test";
import { filterGames, selectAllTeams, showPeriod } from "./controls";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

// This spec is about animated behaviour; the suite default is reduced motion (see playwright.config.ts).
test.use({ reducedMotion: "no-preference" });

const base = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
const HOME = base.home, AWAY = base.away;
// Rink coordinates as the feed gives them: the teams switch ends between periods, so the same team's shots come at both signs of x.
const plays = [
  { id: 1, order: 1, period: 1, periodType: "REG", time: "03:00", type: "shot-on-goal", team: HOME, x: 80, y: 3, player: "H One", penalty: null, duration: null },
  { id: 2, order: 2, period: 1, periodType: "REG", time: "05:00", type: "shot-on-goal", team: AWAY, x: -60, y: 20, player: "A One", penalty: null, duration: null },
  { id: 3, order: 3, period: 2, periodType: "REG", time: "01:00", type: "goal", team: HOME, x: -85, y: -2, player: "H Scorer", penalty: null, duration: null },
  { id: 4, order: 4, period: 2, periodType: "REG", time: "02:00", type: "missed-shot", team: AWAY, x: 55, y: -30, player: "A Two", penalty: null, duration: null },
  { id: 5, order: 5, period: 2, periodType: "REG", time: "03:00", type: "shot-on-goal", team: HOME, x: -72, y: 5, player: "H Two", penalty: null, duration: null },
  { id: 6, order: 6, period: 2, periodType: "REG", time: "04:00", type: "blocked-shot", team: AWAY, x: 60, y: 0, player: "A Three", penalty: null, duration: null },
];
const feed = (extra: Record<string, unknown> = {}) => {
  const goals = [{ id: 3, period: 2, periodType: "REG", time: "01:00", type: "goal", team: HOME, x: -85, y: -2, player: "H Scorer" }];
  return { ...fixture, state: "LIVE", period: 2, periodType: "REG", clock: "12:00", intermission: false, homeShots: 3, awayShots: 2, plays, shots: plays.filter((p) => ["goal", "shot-on-goal"].includes(p.type)), goals, ...extra };
};
async function show(page: Page, game: Record<string, unknown>) {
  await selectAllTeams(page);
  await filterGames(page, { competition: String(game.type), window: "all" });
}

test("a live card shows the ice: shots at each net, the high-danger chances, attempts and the pressure", async ({ page }) => {
  const game = { ...base, state: "LIVE", period: 2, periodType: "REG", clock: "12:00", intermission: false, homeShots: 3, awayShots: 2 };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: feed() }));
  await page.goto("/?view=games");
  await show(page, game);
  const ice = page.locator(".live-card").first().getByTestId("ice-view");
  await expect(ice).toBeVisible();
  // Five shots with a spot (the block has none worth drawing): two are away, three home; one of the home ones is the goal.
  await expect(ice.locator(".ice-shot")).toHaveCount(4);
  await expect(ice.locator(".ice-goal")).toHaveCount(1);
  // Away on the left, home on the right, whichever net they really attacked.
  const xs = await ice.locator("circle.ice-shot, .ice-goal circle").evaluateAll((els) => els.map((e) => Number(e.getAttribute("cx"))));
  expect(xs.filter((x) => x < 0)).toHaveLength(2);
  expect(xs.filter((x) => x > 0)).toHaveLength(3);
  // Stats: shots on goal, high-danger chances (within 24 ft of the net) and attempts, away first.
  const stat = (label: string) => ice.locator(".ice-stat", { hasText: label });
  await expect(stat("Shots on goal")).toContainText(/2\s*Shots on goal\s*3/i);
  await expect(stat("High-danger")).toContainText(/0\s*High-danger chances\s*3/i);
  await expect(stat("Shot attempts")).toContainText(/3\s*Shot attempts\s*3/i);
  await expect(ice.getByTestId("ice-tilt")).toContainText(/pressure|Even/i);
  await expect(ice).toContainText("Shot map · live");
});

test("a finished game keeps its ice view, and a game that has not started has none", async ({ page }) => {
  const done = { ...base, state: "FINAL", period: 3, periodType: "REG", clock: "00:00", homeScore: 2, awayScore: 1, intermission: false };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: done.date, games: [done] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: feed({ state: "FINAL", period: 3, clock: "00:00" }) }));
  await page.goto("/?view=games");
  await show(page, done);
  await showPeriod(page, "past");
  const card = page.locator(".game-card").first();
  await card.scrollIntoViewIfNeeded(); // the feed is fetched only for a card that is on screen
  await expect(card).toContainText("FINAL");
  await expect(card.getByTestId("ice-view")).toContainText("Shot map · final");
  // A game that has not started has no ice view, and so adds nothing to the small card.
  await showPeriod(page, "future");
  const upcoming = page.locator(".game-card").first();
  await upcoming.scrollIntoViewIfNeeded();
  await expect(upcoming).not.toContainText("FINAL");
  await expect(page.getByTestId("ice-view")).toHaveCount(0);
});

test("a goal runs five seconds on the card: puck in the net, then the red light with GOAL circling, then it clears; the first sight of a game does not", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  const game = (home: number) => ({ ...base, state: "LIVE", period: 2, periodType: "REG", clock: "12:00", intermission: false, homeScore: home, awayScore: 0, homeShots: 3, awayShots: 2 });
  await page.route("**/api/live", (route) => {
    calls++;
    const g = game(calls >= 2 ? 1 : 0);
    return route.fulfill({ json: { updatedAt: new Date().toISOString(), date: g.date, games: [g] } });
  });
  await page.route("**/api/game/*", (route) => route.fulfill({ json: feed() }));
  await page.goto("/?view=games");
  await show(page, game(0));
  const card = page.locator(".live-card").first();
  await expect(card.getByTestId("ice-view")).toBeVisible();
  await expect(card.getByTestId("goal-flash")).toHaveCount(0); // seeing the game is not a goal
  await page.clock.fastForward(31_000); // the next poll: the home team is up one
  const flash = card.getByTestId("goal-flash");
  await expect(flash).toBeVisible();
  await expect(flash).toContainText("GOAL!");
  await expect(flash).toHaveAttribute("data-side", "home");
  await expect(flash).toContainText(HOME);
  await expect(flash).toContainText("H Scorer"); // from the game feed
  await expect(flash).toContainText(`${AWAY} 0 – 1 ${HOME}`);
  // The puck goes into the net, then the red goal light comes on with GOAL going round it.
  await expect(flash.locator(".gf-puck")).toHaveCount(1);
  await expect(flash.locator(".gf-lamp")).toHaveCount(1);
  await expect(flash.locator(".gf-word")).toHaveCount(3);
  expect(await flash.locator(".gf-word").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("gf-orbit");
  expect(await flash.locator(".gf-beams").evaluate((e) => getComputedStyle(e).animationName)).toBe("gf-spin");
  await expect(card).toHaveClass(/goal-glow/);
  await page.clock.fastForward(4_000); // still up at four seconds
  await expect(card.getByTestId("goal-flash")).toHaveCount(1);
  await page.clock.fastForward(2_000); // gone after five
  await expect(card.getByTestId("goal-flash")).toHaveCount(0);
  await expect(card).not.toHaveClass(/goal-glow/);
});

test("with reduced motion the goal banner is the same, held still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/live", (route) => {
    calls++;
    const g = { ...base, state: "LIVE", period: 2, periodType: "REG", clock: "12:00", intermission: false, homeScore: 0, awayScore: calls >= 2 ? 1 : 0 };
    return route.fulfill({ json: { updatedAt: new Date().toISOString(), date: g.date, games: [g] } });
  });
  await page.route("**/api/game/*", (route) => route.fulfill({ json: feed({ goals: [{ id: 9, period: 2, periodType: "REG", time: "09:00", type: "goal", team: AWAY, x: 80, y: 0, player: "A Scorer" }] }) }));
  await page.goto("/?view=games");
  await show(page, { ...base, state: "LIVE" });
  await page.clock.fastForward(31_000);
  const flash = page.locator(".live-card").first().getByTestId("goal-flash");
  await expect(flash).toContainText("GOAL!");
  await expect(flash).toHaveAttribute("data-side", "away");
  // Held still: no net, no circling; the light is on with GOAL in front of it.
  expect(await flash.locator(".gf-word").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await flash.locator(".gf-beams").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await flash.locator(".gf-net").evaluate((e) => getComputedStyle(e).display)).toBe("none");
  await expect(flash.locator(".gf-lamp")).toBeVisible();
});
