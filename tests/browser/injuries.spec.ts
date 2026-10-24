import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../src/data/teams.json" with { type: "json" };
import { buildInjuryReport, parseEspnInjuries } from "../../src/lib/injuries.mjs";
import { goTo } from "./nav";

const season = manifest.current;
const espn = JSON.parse(readFileSync("tests/fixtures/espn-injuries.json", "utf8"));
const names = parseEspnInjuries(espn, teams as never).map((i: { name: string }) => i.name);
const sk = (name: string, gp: number, goals: number, assists: number, shots: number) => ({ skaterFullName: name, gamesPlayed: gp, goals, assists, shots, plusMinus: 0, penaltyMinutes: 0, timeOnIcePerGame: 1200, teamAbbrevs: "TOR" });
const letters = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const filler = (n: number, base: number) => Array.from({ length: n }, (_, i) => sk(`Filler ${letters(i)}`, 10, base + (i % 5), i % 4, 20 + i));
// The first injured player is a star this season; the second has one game this season but a big last season; the third has no history at all.
const skaters = [...filler(40, 0), sk(names[0], 7, 8, 8, 45), sk(names[1], 1, 0, 0, 2)];
const prevSkaters = [...filler(40, 6), sk(names[1], 75, 60, 70, 300)];
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const report = buildInjuryReport({ espn, teams, today, season, skaters, prevSkaters });

async function open(page: Page, body: unknown = report) {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ json: body }));
  await page.goto("/");
  await goTo(page, "Injury report");
  await expect(page.getByRole("heading", { name: "Injury report", level: 1 })).toBeVisible();
}

test("each injury shows the type, how serious it is, when the player may be back, and his impact", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("inj-counts")).toContainText(String(report.counts.total));
  const first = page.getByTestId("injury").filter({ hasText: names[0] });
  await expect(first).toContainText(names[0]);
  await expect(first.locator(".inj-sev")).toHaveText(/Day-to-day|Short-term|Moderate|Long-term|Season-ending|Unknown/);
  await expect(first.locator(".inj-facts")).toContainText("Injury");
  await expect(first.locator(".inj-facts")).toContainText("Back");
  await expect(first.locator(".inj-impact")).toContainText(/High impact|Medium impact|Low impact/);
  await expect(first.locator(".inj-impact")).toContainText("this season");
  // The most impactful injured player (here: the one with the big last season) comes first, the star of this season next.
  await expect(page.getByTestId("injury").first()).toContainText(names[1]);
  const levels = await page.getByTestId("injury").evaluateAll((els) => els.map((e) => e.getAttribute("data-impact")));
  expect(levels[0]).toBe("high");
});

test("impact falls back to last season when there are no earlier games this season, and says so when there is no history", async ({ page }) => {
  await open(page);
  const card = (name: string) => page.getByTestId("injury").filter({ hasText: name });
  await expect(card(names[1]).locator(".inj-impact")).toContainText("games last season");
  await expect(card(names[1]).locator(".inj-impact")).toContainText(/High impact/);
  await expect(card(names[3]).locator(".inj-impact")).toContainText("No earlier games to judge by");
});

test("the team, seriousness and sort controls narrow and reorder the list", async ({ page }) => {
  await open(page);
  const all = await page.getByTestId("injury").count();
  await page.getByLabel("Team", { exact: true }).selectOption("ANA");
  const ana = await page.getByTestId("injury").count();
  expect(ana).toBeGreaterThan(0);
  expect(ana).toBeLessThan(all);
  expect(await page.getByTestId("injury").evaluateAll((els) => els.every((e) => e.getAttribute("data-team") === "ANA"))).toBe(true);
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Long-term / season" }).click();
  expect(await page.getByTestId("injury").evaluateAll((els) => els.every((e) => /Long-term|Season-ending/.test(e.querySelector(".inj-sev")!.textContent ?? "")))).toBe(true);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Sort").selectOption("team");
  const teamsInOrder = await page.getByTestId("injury").evaluateAll((els) => els.map((e) => e.getAttribute("data-team")));
  expect(teamsInOrder).toEqual([...teamsInOrder].sort((a, b) => ((teams as { id: string; name: string }[]).find((t) => t.id === a)!.name).localeCompare((teams as { id: string; name: string }[]).find((t) => t.id === b)!.name)));
});

test("a team tile in Teams hit hardest filters to that team", async ({ page }) => {
  await open(page);
  const tile = page.locator(".inj-team").first();
  const code = (await tile.locator("b").innerText()).trim();
  await tile.click();
  expect(await page.getByTestId("injury").evaluateAll((els, c) => els.every((e) => e.getAttribute("data-team") === c), code)).toBe(true);
});

test("the injury report fits a 360px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await expect(page.getByTestId("injury").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});

test("an unavailable report says so instead of showing nothing", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ status: 502, body: "{}" }));
  await page.goto("/");
  await goTo(page, "Injury report");
  await expect(page.getByText(/injury report is unavailable/i)).toBeVisible();
});
