import { expect, test, type Page } from "@playwright/test";

// Game alerts: an in-app feature driven by the /api/live poll. The poll is mocked with a sequence of snapshots and the clock is driven by hand.
const START = "2026-11-10T00:00:00Z";
const T0 = Date.parse(START) - 30 * 60_000;
type Live = Record<string, unknown>;

async function setup(page: Page, opts: { alerts?: Record<string, unknown> | null; favorites?: string[] } = {}) {
  const manifest = await (await page.request.get("/data/manifest.json")).json();
  const season = await (await page.request.get(`/data/seasons/${manifest.current}.json`)).json();
  const base = season.games.find((g: { state: string }) => g.state === "FUT") ?? season.games[0];
  const game = { ...base, start: START, state: "FUT", scheduleState: "OK", homeScore: null, awayScore: null, end: "REG", period: null, periodType: null, clock: null, intermission: false };
  let current: Live = { ...game };
  const serve = () => ({ updatedAt: new Date().toISOString(), date: "2026-11-09", games: [current] });
  const prefs = opts.alerts === null ? null : { version: 1, favorites: opts.favorites ?? [game.home], alerts: { enabled: true, start: true, period: false, final: true, schedule: true, scope: { teams: true, players: true, saved: true }, ...opts.alerts } };
  await page.addInitScript(([p]) => { try { if (p && !localStorage.getItem("iceboard-prefs-v1")) localStorage.setItem("iceboard-prefs-v1", p); } catch {} }, [prefs && JSON.stringify(prefs)]);
  await page.clock.install({ time: T0 });
  await page.route("**/api/live", (route) => route.fulfill({ json: serve() }));
  await page.goto("/");
  await page.clock.runFor(1000);
  await settle(page);
  return {
    game,
    /** Serve a new snapshot of the game and let the poll pick it up. */
    async next(patch: Live) { current = { ...game, ...patch }; await page.clock.runFor(31_000); await settle(page); },
  };
}
const settle = (page: Page) => page.waitForTimeout(600); // real time: the poll response and the lazy alert engine arrive asynchronously
const bell = (page: Page) => page.locator('button[aria-label^="Notifications"]');
const LIVE = { state: "LIVE", period: 1, periodType: "REG", homeScore: 0, awayScore: 0, clock: "19:00" };

test("alerts are off by default: no bell, nothing stored", async ({ page }) => {
  const s = await setup(page, { alerts: null });
  await s.next(LIVE);
  await s.next({ state: "OFF", homeScore: 3, awayScore: 2 });
  await expect(bell(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("iceboard-alerts-v1"))).toBeNull();
});

test("a favorite team's puck drop gives one alert with an unread count, and a reload adds no duplicate", async ({ page }) => {
  const s = await setup(page);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  await s.next(LIVE);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await page.reload();
  await page.clock.runFor(31_000);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await bell(page).click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".alert-item")).toHaveCount(1);
  await expect(dialog.locator(".alert-item")).toContainText("Puck drop");
  await page.keyboard.press("Escape");
  await expect(bell(page)).toHaveAccessibleName("Notifications"); // opening marked it read
});

test("a final (with the overtime tag) and a postponement each alert once", async ({ page }) => {
  const s = await setup(page);
  await s.next(LIVE);
  await s.next({ state: "OFF", end: "OT", homeScore: 4, awayScore: 3, period: 4, periodType: "OT" });
  await s.next({ state: "OFF", end: "OT", homeScore: 4, awayScore: 3, period: 4, periodType: "OT" });
  await expect(bell(page)).toHaveAccessibleName("Notifications, 2 unread");
  await bell(page).click();
  await expect(page.locator(".alert-item").first()).toContainText("Final (OT)");
  await page.keyboard.press("Escape");
});
test("a postponed game alerts", async ({ page }) => {
  const s = await setup(page);
  await s.next({ scheduleState: "PPD" });
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await bell(page).click();
  await expect(page.locator(".alert-item")).toContainText("postponed");
});

test("turned-off categories and teams that are not followed stay silent", async ({ page }) => {
  const s = await setup(page, { alerts: { start: false, final: false, schedule: false } });
  await s.next(LIVE);
  await s.next({ state: "OFF", homeScore: 3, awayScore: 2 });
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});
test("a team that is not a favorite is silent", async ({ page }) => {
  const s = await setup(page, { favorites: [] });
  await s.next(LIVE);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});

test("the center works by keyboard, opens the game, clears, and fits 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const s = await setup(page);
  await s.next(LIVE);
  await bell(page).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  for (const b of await dialog.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await bell(page).click();
  await dialog.getByRole("button", { name: "Open game" }).click();
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await bell(page).click();
  await dialog.getByRole("button", { name: "Clear all" }).click();
  await expect(dialog).toContainText("No notifications yet");
  await expect(dialog).toContainText("Settings");
});
