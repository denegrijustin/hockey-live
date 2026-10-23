import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import { goTo } from "./nav";

// This spec is about animated behaviour; the suite default is reduced motion (see playwright.config.ts).
test.use({ reducedMotion: "no-preference" });

const season = manifest.current;
const day = (o: number) => new Date(Date.now() + o * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const g = (id: number, o: number, away: string, home: string, state: string, sc: [number | null, number | null], extra = {}) => ({ id, season, type: 2, date: day(o), start: `${day(o)}T23:00:00Z`, state, scheduleState: "OK", venue: "Test Arena", home, away, homeScore: sc[1], awayScore: sc[0], end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null, ...extra });
const games = [g(1, -9, "BOS", "TOR", "FINAL", [2, 3], { end: "OT", homeShots: 24, awayShots: 31 }), g(2, -8, "COL", "WPG", "FINAL", [1, 4]), g(3, -2, "SEA", "VAN", "FINAL", [3, 2]), g(4, 1, "CHI", "EDM", "FUT", [null, null])];
const pick = (id: number, o: number, kind: "ml" | "pl", side: "home" | "away", team: string, away: string, home: string, line: number | null, price: number, result?: "win" | "loss", extra = {}) => ({ id: `${id}-${kind}`, gameId: id, date: day(o), start: `${day(o)}T23:00:00Z`, away, home, kind, side, team, line, price, model: 0.56, fair: 0.5, edge: 0.06, ...(result ? { result, units: result === "win" ? (price > 0 ? price / 100 : 100 / -price) : -1, final: "2–3", margin: result === "win" ? 1 : -1 } : {}), ...extra });
const snapshot = { schema: 1, season, startedAt: new Date(Date.now() - 10 * 86400000).toISOString(), updatedAt: new Date().toISOString(), picks: [
  pick(1, -9, "ml", "home", "TOR", "BOS", "TOR", null, 120, "win"), pick(2, -8, "pl", "home", "WPG", "COL", "WPG", -1.5, 210, "win", { margin: 3 }), pick(3, -2, "ml", "home", "VAN", "SEA", "VAN", null, -130, "loss"), pick(4, 1, "ml", "away", "CHI", "CHI", "EDM", null, 140),
] };

async function open(page: Page, picks: unknown = snapshot) {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/picks/${season}`, (route) => route.fulfill({ json: picks }));
  const s = { season, updatedAt: new Date().toISOString(), source: "fixture", games };
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: s }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: s }));
  await page.goto("/");
  await goTo(page, "Picks");
  await expect(page.getByRole("heading", { name: "Picks", level: 1 })).toBeVisible();
}

test("Picks shows this week's picks with the chance scale and a verdict, the record, and each graded pick with its reason", async ({ page }) => {
  await open(page);
  const card = page.getByTestId("pick").first();
  await expect(card).toContainText("CHI");
  await expect(card).toContainText("+140");
  await expect(card.locator(".pk-tick.flip")).toContainText("50% flip");
  await expect(card.locator(".pk-tick.even")).toContainText("Break-even");
  await expect(card.locator(".pk-verdict")).toHaveText(/edge|No edge/);
  await expect(card.locator(".pk-why")).toContainText("model says 56%");
  // The record: 2-1, a weekly chart with a break-even line.
  await expect(page.locator(".pk-stats")).toContainText("2–1");
  await expect(page.locator(".pk-chart .pr-bar")).not.toHaveCount(0);
  await expect(page.locator(".pk-chart .pk-zero")).toHaveCount(1);
  expect(await page.locator(".pk-chart .pr-bar").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("bar-grow"); // the chart draws in
  // Graded picks say plainly why they won or missed.
  const graded = page.getByTestId("graded-pick");
  await expect(graded).toHaveCount(3);
  await expect(graded.filter({ hasText: "Won:" }).first()).toContainText(/beat|covered/);
  await expect(graded.filter({ hasText: "Missed:" }).first()).toContainText("model had 56%");
});

test("Picks is honest: with few graded picks it says so and never oversells", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("pk-honest")).toContainText("Only 3 graded picks");
  await expect(page.getByTestId("pk-honest")).toContainText(/coin flip|unproven/);
  const text = (await page.locator(".picks").innerText()).toLowerCase();
  expect(text).not.toMatch(/parlay|guarantee|lock of|can't lose|sure thing/);
});

test("an empty snapshot says the record has not started instead of showing zeros", async ({ page }) => {
  await open(page, { schema: 1, season, startedAt: null, updatedAt: null, picks: [] });
  await expect(page.getByText(/No picks have been logged yet/)).toBeVisible();
  await expect(page.locator(".pk-stats")).toHaveCount(0);
  await expect(page.getByTestId("pk-honest")).toContainText("Only 0 graded picks");
});

test("Picks fits a 360px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await expect(page.getByTestId("pick").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});
