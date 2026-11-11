import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import { normalizeGameFeed } from "../../src/lib/game-data.mjs";

/**
 * Momentum pane (shot-attempt pressure). Period 1 is the REAL recorded NHL feed (tests/fixtures/raw-live-game.json, normalised by the
 * app's own normalizer). Periods 2 and 3 are DERIVED from it (teams swapped, ids offset) plus two derived goals, labelled so; the
 * recorded game has no goals. The pane must be mounted in the Game Center for these specs (the lead integrates the tab).
 */
const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const raw = JSON.parse(readFileSync(new URL("../fixtures/raw-live-game.json", import.meta.url), "utf8"));
const real = normalizeGameFeed(raw);
const swap = (t: string | null) => (t === real.home ? real.away : t === real.away ? real.home : t);
const derivedP2 = real.plays.filter((p: any) => p.period === 1 && p.type !== "period-start").map((p: any) => ({ ...p, id: p.id + 10000, order: p.order + 10000, period: 2, team: swap(p.team), sit: p.sit ? p.sit.split("").reverse().join("") : p.sit }));
const goals = [
  { id: 20001, order: 4000, period: 1, periodType: "REG", time: "12:00", type: "goal", team: real.away, x: -80, y: 2, player: "Derived Scorer", sit: "1551", score: { home: 0, away: 1 } },
  { id: 20002, order: 14000, period: 2, periodType: "REG", time: "12:00", type: "goal", team: real.home, x: 80, y: -2, player: "Derived Scorer", sit: "1551", score: { home: 1, away: 1 } },
];
const plays = [...real.plays, ...goals.filter((g) => g.period === 1), ...derivedP2, ...goals.filter((g) => g.period === 2)].sort((a: any, b: any) => a.order - b.order);
const game = { id: 9601, season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null, home: real.home, away: real.away, state: "LIVE", period: 2, periodType: "REG", clock: "01:00", homeScore: 1, awayScore: 1, start: new Date(Date.now() - 4000000).toISOString(), homeShots: 12, awayShots: 9, intermission: false };

async function open(page: Page, feedPlays: any[] = plays) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [game] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => route.fulfill({ json: { ...game, roster: real.roster, plays: feedPlays, shots: feedPlays.filter((p: any) => p.type === "shot-on-goal"), goals: feedPlays.filter((p: any) => p.type === "goal"), stats: [] } }));
  await page.goto("/");
  await page.locator(`.sb-row[data-game="${game.id}"] .sb-main`).click();
  const pane = page.locator("dialog.game-dialog").getByTestId("momentum-chart");
  await pane.scrollIntoViewIfNeeded();
  return pane;
}

test("renders the pressure chart with an honest label, summary table and text alternative", async ({ page }) => {
  const pane = await open(page);
  await expect(pane).toBeVisible();
  await expect(pane.getByTestId("momentum-label")).toContainText("Iceboard metric: shot-attempt pressure — not possession, not xG, not win probability");
  const svg = pane.getByTestId("momentum-svg");
  await expect(svg).toHaveAttribute("role", "img");
  const aria = (await svg.getAttribute("aria-label")) ?? "";
  expect(aria).toContain("shot-attempt pressure");
  expect(aria).toMatch(/Goals: 1st 12:00 \w+/);
  expect(aria).not.toMatch(/NaN|undefined/);
  await expect(pane.locator(".mo-goal")).toHaveCount(2);
  await expect(pane.locator(".mo-pp").first()).toBeAttached(); // the recorded 5v4 power play
  await expect(pane.locator(".mo-pen").first()).toBeAttached();
  await expect(pane.locator(".mo-period text")).toHaveText(["1st", "2nd", "3rd"]);
  await expect(pane.getByTestId("momentum-readout")).toContainText(/^P\d \d\d:\d\d — /);
  // the written alternative and the table say the same thing, computed from the same data
  const summary = pane.getByTestId("momentum-summary");
  await expect(summary).toContainText(/led the shot-attempt pressure in the 1st/);
  await expect(summary.locator("tbody tr")).toHaveCount(3); // 1st, 2nd, game
  await expect(pane.locator("details.mo-how summary")).toHaveText("How this is calculated");
  await pane.locator("details.mo-how summary").click();
  await expect(pane.locator("details.mo-how")).toContainText("fixed 1.5");
  await expect(pane.locator(".mo-xg")).toHaveCount(0); // xG flow is for completed games only
});

test("keyboard: arrow keys move the inspect cursor and the readout follows", async ({ page }) => {
  const pane = await open(page);
  const slider = pane.getByRole("slider", { name: "Inspect the timeline" });
  const readout = pane.getByTestId("momentum-readout");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(readout).toContainText("P1 00:00 —");
  await page.keyboard.press("ArrowRight");
  await expect(readout).toContainText("P1 00:10 —");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(readout).toContainText("P1 00:30 —");
  await page.keyboard.press("ArrowLeft");
  await expect(readout).toContainText("P1 00:20 —");
  await expect(slider).toHaveAttribute("aria-valuetext", /P1 00:20 —/);
  await page.keyboard.press("End");
  await expect(readout).toContainText(/P2 20:00 —/); // the latest point reads as the end of the last received period
});

test("period buttons zoom to a period and back", async ({ page }) => {
  const pane = await open(page);
  const second = pane.getByRole("button", { name: "Zoom to the 2nd period" });
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  const slider = pane.getByRole("slider", { name: "Inspect the timeline" });
  await expect(slider).toHaveAttribute("min", "1200");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(pane.getByTestId("momentum-readout")).toContainText("P2 00:00 —");
  await expect(pane.locator(".mo-goal")).toHaveCount(1); // only the 2nd-period goal is in view
  await pane.getByRole("button", { name: "Full game" }).click();
  await expect(pane.getByRole("button", { name: "Full game" })).toHaveAttribute("aria-pressed", "true");
  await expect(pane.locator(".mo-goal")).toHaveCount(2);
});

test("no sideways scroll at 360px, and tap targets are at least 44px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const pane = await open(page);
  await expect(pane).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const box = await pane.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360 + 0.5);
  for (const b of await pane.locator(".mo-btn").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  expect((await pane.getByRole("slider", { name: "Inspect the timeline" }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test("reduced motion: the chart is static (no running animations or transitions)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pane = await open(page);
  await expect(pane.getByTestId("momentum-svg")).toBeVisible();
  const running = await pane.evaluate((el) => el.getAnimations({ subtree: true }).length);
  expect(running).toBe(0);
});

test("without plays it says so factually", async ({ page }) => {
  const pane = await open(page, []);
  await expect(pane).toHaveAttribute("data-state", "empty");
  await expect(pane).toContainText("No play-by-play yet.");
  await expect(pane.getByTestId("momentum-svg")).toHaveCount(0);
});
