import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../src/data/teams.json" with { type: "json" };
import { buildInjuryReport, parseEspnInjuries } from "../../src/lib/injuries.mjs";

const season = manifest.current;
const espn = JSON.parse(readFileSync("tests/fixtures/espn-injuries.json", "utf8"));
const names = parseEspnInjuries(espn, teams as never).map((i: { name: string }) => i.name);
const sk = (name: string, gp: number, goals: number, assists: number, shots: number) => ({ skaterFullName: name, gamesPlayed: gp, goals, assists, shots, plusMinus: 0, penaltyMinutes: 0, timeOnIcePerGame: 1200, teamAbbrevs: "TOR" });
const L = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const filler = Array.from({ length: 40 }, (_, i) => sk(`Filler ${L(i)}`, 10, i % 5, i % 4, 20 + i));
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const report = buildInjuryReport({ espn, teams, today, season, skaters: [...filler, sk(names[0], 8, 9, 8, 50)] });
const game = { id: 9601, season, type: 2, date: today, start: new Date(Date.now() + 5 * 3600000).toISOString(), state: "FUT", scheduleState: "OK", venue: "Scotiabank Arena", home: "TOR", away: "ANA", homeScore: null, awayScore: null, end: "", broadcasts: [], round: null };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function open(page: Page, injuries: unknown = report, expand = true) {
  await page.route("**/a.espncdn.com/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [game] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/api/injuries/${season}`, (route) => (injuries ? route.fulfill({ json: injuries }) : route.fulfill({ status: 502, body: "{}" })));
  await page.goto("/");
  await page.locator(`.sb-row[data-game="${game.id}"] .sb-main`).click();
  // The injuries are an expandable section, closed until asked for.
  if (expand) await page.getByTestId("game-injuries").locator("summary").click();
}

test("opening a game shows each side's injuries: who, the injury, how serious, when back and impact", async ({ page }) => {
  await open(page);
  const box = page.getByTestId("game-injuries");
  await expect(box.locator('.gi-side[data-team="ANA"]')).toContainText("5 out");
  await expect(box.locator('.gi-side[data-team="TOR"]')).toContainText("out");
  const first = box.locator('.gi-side[data-team="ANA"] [data-testid="game-injury"]').first();
  await expect(first).toContainText(names[0]); // highest impact first
  await expect(first.locator(".gi-sev")).toHaveText(/Day-to-day|Short-term|Moderate|Long-term|Season-ending|Unknown/);
  await expect(first.locator(".gi-line")).toContainText("·");
  await expect(first.locator(".gi-impact")).toContainText(/High impact|Medium impact|Low impact/);
  await expect(first.locator(".gi-impact")).toContainText("this season");
  // Only the first four of a long list, with the rest a tap away.
  await expect(box.locator('.gi-side[data-team="ANA"] [data-testid="game-injury"]')).toHaveCount(4);
  await box.locator('.gi-side[data-team="ANA"]').getByRole("button", { name: /Show all 5/ }).click();
  await expect(box.locator('.gi-side[data-team="ANA"] [data-testid="game-injury"]')).toHaveCount(5);
  // The way on to the Game Center is still there.
  await expect(page.getByRole("button", { name: /Full game center/ })).toBeVisible();
});

test("a team with no reported injuries says so", async ({ page }) => {
  await open(page, { ...report, items: report.items.filter((i: { team: string }) => i.team === "ANA") });
  await expect(page.locator('.gi-side[data-team="TOR"]')).toContainText("No injuries reported");
});

test("an unavailable injury report says so inside the card, and the rest of the card still works", async ({ page }) => {
  await open(page, null);
  await expect(page.getByTestId("game-injuries")).toContainText("unavailable");
  await expect(page.getByTestId("key-stats")).toBeVisible();
});

test("injuries inside a card fit a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await expect(page.getByTestId("game-injuries").locator(".gi-side").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});

test("injuries are an expandable section: closed by default, so the key stats stay the main thing in the opened card", async ({ page }) => {
  await open(page, report, false);
  const box = page.getByTestId("game-injuries");
  await expect(page.getByTestId("key-stats")).toBeVisible();
  await expect(box).not.toHaveAttribute("open", "");
  await expect(box.locator("summary")).toContainText("ANA 5 · TOR 5 out");
  await expect(box.locator(".gi-side").first()).toBeHidden();
  await box.locator("summary").click();
  await expect(box.locator(".gi-side").first()).toBeVisible();
  await expect(page.getByTestId("key-stats")).toBeVisible();
});

test("in the Game Center the injuries are their own expandable section", async ({ page }) => {
  await open(page, report, false);
  await page.locator(`.sb-row[data-game="${game.id}"]`).getByRole("button", { name: /Open Game Center/ }).click();
  const dialog = page.locator("dialog.game-dialog, .game-panel").first();
  const box = dialog.getByTestId("game-injuries");
  await expect(box).toBeVisible();
  await expect(box).not.toHaveAttribute("open", "");
  // It is a section of its own, not tucked into the starting goalies.
  expect(await box.evaluate((e) => !e.closest(".game-center-section:not(.game-injuries)"))).toBe(true);
  await box.locator("summary").click();
  await expect(box.locator('.gi-side[data-team="ANA"]')).toContainText("out");
});

test("each injured player in a card has his picture and a body figure for the injury", async ({ page }) => {
  await open(page);
  const row = page.getByTestId("game-injuries").locator('.gi-side[data-team="ANA"] [data-testid="game-injury"]').first();
  await expect(row.getByTestId("inj-headshot")).toHaveAttribute("src", /espncdn\.com/);
  await expect(row.locator(".inj-figure")).toHaveAttribute("data-zone", /.+/);
  const [pic, fig] = await Promise.all([row.getByTestId("inj-headshot").boundingBox(), row.locator(".inj-figure").boundingBox()]);
  expect(pic!.x + pic!.width).toBeLessThanOrEqual(fig!.x); // the picture and the figure do not overlap
});
