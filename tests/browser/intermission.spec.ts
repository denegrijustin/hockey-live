import { test, expect, type Page } from "@playwright/test";
import { filterGames, selectAllTeams } from "./controls";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };
import teams from "../../src/data/teams.json" with { type: "json" };
import { zamboniColors } from "../../src/lib/intermission.mjs";

// This spec is about animated behaviour; the suite default is reduced motion (see playwright.config.ts).
test.use({ reducedMotion: "no-preference" });

const base = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
const homeTeam = (teams as { id: string; color: string; cardColor?: string }[]).find((t) => t.id === base.home)!;
async function open(page: Page, extra: Record<string, unknown>) {
  const game = { ...base, state: "LIVE", period: 1, periodType: "REG", ...extra };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.goto("/?view=games");
  await selectAllTeams(page);
  await filterGames(page, { competition: String(game.type), window: "all" });
  return page.locator(".live-card").first();
}

test("a game in intermission shows the feed's countdown and the Zamboni on its card", async ({ page }) => {
  const card = await open(page, { intermission: true, clock: "13:48" });
  const int = card.getByTestId("intermission");
  await expect(int).toBeVisible();
  await expect(int.locator(".int-t")).toHaveText(/1[34]:\d\d/);
  await expect(int).toContainText("INTERMISSION · END OF P1");
  await expect(int).toContainText("until period 2");
  await expect(int.locator(".int-zamboni")).toBeVisible();
  await expect(int.locator(".int-sign")).toBeVisible();
  await expect(int.locator("image")).toHaveAttribute("href", `/logos/retro/${base.home}.png`);
  // It is in the home team's colors.
  const hex = (await int.locator(".int-zamboni").evaluate((e) => getComputedStyle(e).getPropertyValue("--z-body"))).trim();
  expect(hex).toBe(zamboniColors(homeTeam.cardColor ?? homeTeam.color).body);
  const n = parseInt(hex.slice(1), 16);
  expect(await int.locator(".int-zbody").evaluate((e) => getComputedStyle(e).fill)).toBe(`rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`);
  // The card header says so too.
  await expect(card.locator(".game-date")).toContainText("Intermission");
  // The Zamboni rink is the only rink on the card: no second shot-map rink while the ice is being resurfaced.
  await expect(card.locator(".ice-view")).toHaveCount(0);
});

test("the countdown runs down between polls", async ({ page }) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: "13:48" });
  const t = card.locator(".int-t");
  await expect(t).toHaveText(/^13:[34]\d$/);
  const secs = async () => {
    const [m, s] = (await t.innerText()).split(":").map(Number);
    return m * 60 + s;
  };
  const before = await secs();
  await page.clock.fastForward(10_000);
  await expect.poll(async () => before - (await secs())).toBeGreaterThanOrEqual(9);
});

test("with no clock in the feed it counts 17 minutes from first sight, and a game in play shows no Zamboni", async ({ page }) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: null });
  await expect(card.locator(".int-t")).toHaveText(/^1[67]:\d\d$/);
  await page.unroute("**/api/live");
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: base.date, games: [{ ...base, state: "LIVE", period: 2, intermission: false, clock: "12:30" }] } }));
  await page.clock.fastForward(35_000);
  await expect(card.getByTestId("intermission")).toHaveCount(0);
});

test("the Game Center carries it too, and reduced motion keeps the ice fresh and the Zamboni parked", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = await open(page, { intermission: true, clock: "9:05" });
  await expect(card.getByTestId("intermission").locator(".int-zamboni")).toHaveCount(0);
  expect(await card.locator(".int-fresh").evaluate((e) => getComputedStyle(e).strokeDashoffset)).toBe("0px");
  await card.locator(".gc-icon").click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog.getByTestId("intermission")).toContainText(/until period 2/);
});

test("the Zamboni does laps all through the intermission and leaves the ice with 10 seconds to go", async ({ page }) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: "13:48" });
  const int = card.getByTestId("intermission");
  const fresh = async () => Number(await int.locator(".int-fresh").evaluate((e) => (e as SVGElement).style.strokeDashoffset));
  const pose = () => int.locator(".int-zamboni").getAttribute("transform");
  await expect.poll(fresh).toBeGreaterThan(0);
  const early = await fresh();
  const first = await pose();
  await page.clock.fastForward(120_000); // two minutes on: more of the ice is done and the machine has moved on
  await expect.poll(fresh).toBeLessThan(early);
  expect(await pose()).not.toBe(first);
  await page.clock.fastForward(11 * 60_000 + 30_000); // 18 seconds left: the last lap is done, and it heads for the gate
  await expect(int.locator(".int-t")).toHaveText(/^0:(1[5-9])$/);
  await expect.poll(fresh).toBe(0); // the whole sheet is fresh
  const x = async () => Number(/translate\(([-\d.]+)/.exec((await pose()) ?? "")?.[1]);
  await expect.poll(x).toBeLessThan(46); // on its way to the gate in the left boards
  await page.clock.fastForward(9_000); // 10 seconds left
  await expect(int.locator(".int-t")).toHaveText(/^0:(0\d|10)$/);
  await expect.poll(x).toBeLessThan(-15); // off the ice
  await expect(int).toContainText("fresh ice for the next period");
});

test("the Scoreboard home shows the Zamboni on a game in intermission, without opening it", async ({ page }) => {
  // The Scoreboard opens on today's games, so the live game is dated today (Eastern).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const game = { ...base, date: today, state: "LIVE", period: 1, periodType: "REG", intermission: true, clock: "13:48" };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: today, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.goto("/");
  const row = page.locator(`.sb-row[data-game="${game.id}"]`);
  const int = row.getByTestId("intermission");
  await expect(int).toBeVisible();
  await expect(int.locator(".int-zamboni")).toBeVisible();
  await expect(int.locator(".int-t")).toHaveText(/1[34]:\d\d/);
  await expect(row.getByTestId("key-stats")).toHaveCount(0);
});

test("the logo at centre ice sits straight on the ice, with no square chip behind it", async ({ page }) => {
  const card = await open(page, { intermission: true, clock: "9:00" });
  const logo = card.locator(".int-rink .team-logo-svg");
  await expect(logo).toHaveCount(1);
  await expect(logo.locator("image")).toBeVisible();
  await expect(logo.locator(".logo-chip")).toHaveCount(0);
});

test("the rear blade paints the trail and the roof sign stays horizontal through turns", async ({ page }, testInfo) => {
  await page.clock.install();
  const card = await open(page, { intermission: true, clock: "15:00" });
  const rink = card.locator('.int-rink');
  await expect(card.locator('.int-zamboni')).toHaveAttribute('transform', /translate/);
  let sawTurn = false;
  for (let step = 0; step < 30; step++) {
    const geometry = await rink.evaluate((svg) => {
      const machine = svg.querySelector('.int-zamboni') as SVGGElement;
      const sign = svg.querySelector('.int-placard') as SVGGElement;
      const paint = svg.querySelector('.int-fresh') as SVGPathElement;
      const matrix = machine.transform.baseVal.consolidate()!.matrix;
      const signMatrix = sign.transform.baseVal.consolidate()!.matrix;
      const end = paint.getPointAtLength(paint.getTotalLength() * (1 - Number(paint.style.strokeDashoffset) / 100));
      const rear = new DOMPoint(-10, 0).matrixTransform(matrix);
      const combined = matrix.multiply(signMatrix);
      return { gap: Math.hypot(end.x-rear.x, end.y-rear.y), angle: Math.atan2(combined.b, combined.a), turning: Math.abs(matrix.b) > .1 };
    });
    expect(geometry.gap).toBeLessThan(.1);
    expect(Math.abs(geometry.angle)).toBeLessThan(.001);
    sawTurn ||= geometry.turning;
    await page.clock.fastForward(28_000);
  }
  expect(sawTurn).toBe(true);
  await expect(card.locator('.int-sign-t')).toHaveText('BRING NHL TO KC');
  await rink.screenshot({ path: testInfo.outputPath('zamboni.png') });
});
