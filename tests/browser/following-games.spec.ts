import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const game = (id: number, offset: number, away: string, home: string, state = "FUT", score: [number, number] | [null, null] = [null, null], extra: object = {}) => ({
  id, season, type: 2, date: day(offset), start: `${day(offset)}T23:00:00Z`, state, scheduleState: "OK", venue: "Test Arena",
  home, away, homeScore: score[1], awayScore: score[0], end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null, ...extra,
});
const SAVE_EDM = "Save game Chicago Blackhawks at Edmonton Oilers";
const REMOVE_EDM = "Remove saved game Chicago Blackhawks at Edmonton Oilers";

async function open(page: Page, url: string, prefs?: object) {
  const snapshot = {
    season, updatedAt: new Date().toISOString(), source: "test fixture",
    games: [
      game(2026020201, 0, "CHI", "EDM"), game(2026020202, 0, "MIN", "DAL"), game(2026020203, 0, "BOS", "TOR", "FINAL", [2, 3]),
      game(2026020204, 1, "NYR", "NJD"), game(2026020207, 0, "COL", "SEA", "FUT", [null, null], { scheduleState: "PPD" }),
      game(2026020208, 0, "VGK", "LAK", "FINAL", [1, 0]),
    ],
  };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  if (prefs) await page.addInitScript((p) => { if (!localStorage.getItem("iceboard-prefs-v1")) localStorage.setItem("iceboard-prefs-v1", JSON.stringify(p)); }, prefs);
  await page.goto(url);
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const tabGames = (page: Page) => page.getByRole("tab", { name: "Games" });

test("save from a card, it persists across reload and shows in Following, then remove", async ({ page }) => {
  await open(page, "/");
  const save = page.getByRole("button", { name: SAVE_EDM });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  const box = (await save.boundingBox())!;
  if (page.viewportSize()!.width < 1100) { expect(box.width).toBeGreaterThanOrEqual(43.5); expect(box.height).toBeGreaterThanOrEqual(43.5); }
  await save.click();
  await expect(page.getByRole("button", { name: REMOVE_EDM })).toHaveAttribute("aria-pressed", "true");
  // finished games are not offered
  await expect(page.getByRole("button", { name: /^Save game Boston Bruins at Toronto Maple Leafs/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: REMOVE_EDM })).toBeVisible();
  await page.goto("/?view=following");
  await tabGames(page).click();
  await expect(page.getByTestId("saved-games").locator("[data-saved-game='2026020201']")).toBeVisible();
  await page.getByRole("button", { name: REMOVE_EDM }).click();
  await expect(page.getByTestId("saved-empty")).toBeVisible();
  await page.reload();
  await tabGames(page).click();
  await expect(page.getByTestId("saved-empty")).toBeVisible();
});

test("save from the Game Center header", async ({ page }) => {
  await open(page, "/");
  await page.locator(".sb-row.soon .sb-main").first().click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  const btn = dialog.getByRole("button", { name: /^Save game / });
  await btn.click();
  await expect(dialog.getByRole("button", { name: /^Remove saved game / })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.goto("/?view=following");
  await tabGames(page).click();
  await expect(page.locator("[data-saved-game]")).toHaveCount(1);
});

test("Following tabs: roving tabindex and arrow keys", async ({ page }) => {
  await open(page, "/?view=following");
  const players = page.getByRole("tab", { name: "Players" });
  await expect(players).toHaveAttribute("aria-selected", "true");
  await expect(tabGames(page)).toHaveAttribute("tabindex", "-1");
  await players.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabGames(page)).toHaveAttribute("aria-selected", "true");
  await expect(tabGames(page)).toBeFocused();
  await expect(page.getByRole("tabpanel")).toBeVisible();
});

test("saved states: upcoming, postponed, finished group, and a game gone from the schedule", async ({ page }) => {
  const at = Date.now();
  const saved = (id: number, away: string, home: string, date: string) => ({ id, season, away, home, date, at });
  await open(page, "/?view=following", { version: 1, games: [saved(2026020201, "CHI", "EDM", day(0)), saved(2026020207, "COL", "SEA", day(0)), saved(2026020203, "BOS", "TOR", day(0)), saved(2026020208, "VGK", "LAK", day(0)), saved(2026029999, "OTT", "MTL", day(2))] });
  await tabGames(page).click();
  const list = page.getByTestId("saved-games");
  await expect(list.locator("[data-saved-game='2026020201']")).toBeVisible();
  await expect(list.locator("[data-saved-game='2026020207']")).toContainText("Postponed");
  const missing = list.locator("[data-saved-missing='2026029999']");
  await expect(missing).toContainText("Schedule changed or removed");
  await expect(missing).toContainText("OTT at MTL");
  const finished = page.getByRole("region", { name: "Finished saved games" });
  await expect(finished.locator("[data-saved-game]")).toHaveCount(2);
  await expect(list.locator("[data-saved-game='2026020203']")).toBeVisible();
  await finished.getByRole("button", { name: "Remove all finished" }).click();
  await expect(page.getByRole("region", { name: "Finished saved games" })).toHaveCount(0);
  await expect(list.locator("[data-saved-game]")).toHaveCount(2);
  await missing.getByRole("button", { name: /^Remove saved game/ }).click();
  await expect(missing).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
});

test("Recommended for you appears only with context and its explanation matches the facts", async ({ page }) => {
  await open(page, "/?view=games");
  await expect(page.getByTestId("recommended")).toHaveCount(0);
  await open(page, "/?view=games", { version: 1, favorites: ["EDM"], games: [{ id: 2026020202, season, away: "MIN", home: "DAL", date: day(0), at: 1 }] });
  const rec = page.getByTestId("recommended");
  await expect(rec).toBeVisible();
  const whys = rec.getByTestId("rec-why");
  await expect(whys.first()).toContainText(/^Your team: EDM/);
  const edm = rec.locator("[data-game-id='2026020201'] [data-testid='rec-why']");
  await expect(edm).not.toContainText("Saved by you");
  const dal = rec.locator("[data-game-id='2026020202'] [data-testid='rec-why']");
  await expect(dal).toContainText("Saved by you");
  await expect(dal).not.toContainText("Your team");
  // postponed and finished games are never recommended
  await expect(rec.locator("[data-game-id='2026020207'], [data-game-id='2026020203']")).toHaveCount(0);
});

test("360px: Following and the recommendation do not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, "/?view=games", { version: 1, favorites: ["EDM"], games: [{ id: 2026020201, season, away: "CHI", home: "EDM", date: day(0), at: 1 }, { id: 2026029999, season, away: "OTT", home: "MTL", date: day(1), at: 1 }] });
  await expect(page.getByTestId("recommended")).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.goto("/?view=following");
  await tabGames(page).click();
  await expect(page.locator("[data-saved-game='2026020201']")).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});
