import { test, expect, type Page } from "@playwright/test";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

const base = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
async function open(page: Page, extra: Record<string, unknown>) {
  const game = { ...base, state: "LIVE", period: 1, periodType: "REG", ...extra };
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] } }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...fixture, state: "LIVE", plays: [] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "All 32", exact: true }).click();
  const filters = page.getByRole("button", { name: /^Filters/ });
  await filters.or(page.getByLabel("Competition")).first().waitFor();
  if (await filters.isVisible()) await filters.click();
  await page.getByLabel("Competition").selectOption(String(game.type));
  await page.getByLabel("Window").selectOption("all");
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
  await expect(int.locator("image")).toHaveAttribute("href", `/logos/${base.home}.svg`);
  // It drives along its route, laying fresh ice behind it.
  const pose = () => int.locator(".int-zamboni").getAttribute("transform");
  const first = await pose();
  await expect.poll(pose, { timeout: 8000 }).not.toBe(first);
  const early = Number(await int.locator(".int-fresh").evaluate((e) => (e as SVGElement).style.strokeDashoffset));
  await expect.poll(async () => Number(await int.locator(".int-fresh").evaluate((e) => (e as SVGElement).style.strokeDashoffset)), { timeout: 8000 }).toBeLessThan(early);
  // The card header says so too.
  await expect(card.locator(".game-date")).toContainText("Intermission");
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
