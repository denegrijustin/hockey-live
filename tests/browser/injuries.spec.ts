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

// A 1x1 transparent PNG stands in for ESPN's player pictures.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function open(page: Page, body: unknown = report) {
  await page.route("**/a.espncdn.com/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
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

test("each injury has the player's picture, and initials stand in when there is none", async ({ page }) => {
  await open(page);
  const card = page.getByTestId("injury").filter({ hasText: names[0] });
  await expect(card.getByTestId("inj-headshot")).toHaveAttribute("src", /espncdn\.com/);
  expect(await card.getByTestId("inj-headshot").evaluate((e) => (e as HTMLImageElement).width)).toBe(48);
  const none = { ...report, items: report.items.map((i: { headshot: string | null }, k: number) => (k === 0 ? { ...i, headshot: null } : i)) };
  await page.unroute(`**/api/injuries/${season}`);
  await page.route(`**/api/injuries/${season}`, (route) => route.fulfill({ json: none }));
  await page.reload();
  await goTo(page, "Injury report");
  await expect(page.getByTestId("inj-headshot-fallback").first()).toHaveText(/^[A-Z]{1,2}$/);
});

test("a body figure shows where the injury is: the named body part, its side, or a region for a general report", async ({ page }) => {
  await open(page);
  const zoneOf = async (name: string) => page.getByTestId("injury").filter({ hasText: name }).locator(".inj-figure").evaluate((e) => ({ zone: e.getAttribute("data-zone"), side: e.getAttribute("data-side"), label: e.getAttribute("aria-label") }));
  const knee = await zoneOf("Ryan Poehling"); // "Knee (lower body)"
  expect(knee.zone).toBe("knee");
  expect(knee.label).toContain("Knee");
  expect((await zoneOf("Pavel Mintyukov")).zone).toBe("lower"); // "Lower Body" only: a region, not a spot
  expect((await zoneOf("Jeff Malott")).zone).toBe("illness");
  await expect(page.getByTestId("injury").filter({ hasText: "Ryan Poehling" }).locator(".fig-zone *").first()).toBeVisible();
});

test.describe("the body figure's motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("the spot pulses three times when it comes into view, then stays lit", async ({ page }) => {
    await open(page);
    const fig = page.getByTestId("injury").filter({ hasText: "Ryan Poehling" }).locator(".inj-figure");
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveClass(/play/);
    const style = await fig.locator(".fig-pulse *").first().evaluate((e) => ({ name: getComputedStyle(e).animationName, count: getComputedStyle(e).animationIterationCount }));
    expect(style).toEqual({ name: "zone-pulse", count: "3" }); // three pulses, never a loop
    expect(await fig.locator(".fig-zone *").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none"); // the lit spot itself does not move
  });
});

test("with motion off the spot is simply lit: nothing pulses", async ({ page }) => {
  await open(page);
  const fig = page.getByTestId("injury").filter({ hasText: "Ryan Poehling" }).locator(".inj-figure");
  await fig.scrollIntoViewIfNeeded();
  expect(await fig.locator(".fig-pulse *").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(fig.locator(".fig-zone *").first()).toBeVisible();
});

const withEdm = { ...report, items: report.items.map((i: { team: string }, k: number) => (k < 2 ? { ...i, team: "EDM" } : i)) };

test("the report opens on Edmonton, and picking another team changes the list straight away", async ({ page }) => {
  await open(page, withEdm);
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("EDM");
  const teamsShown = () => page.getByTestId("injury").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-team")))]);
  expect(await teamsShown()).toEqual(["EDM"]);
  const other = withEdm.items.find((i: { team: string }) => i.team !== "EDM")!.team;
  await page.getByLabel("Team", { exact: true }).selectOption(other);
  expect(await teamsShown()).toEqual([other]);
  await page.getByLabel("Team", { exact: true }).selectOption("all");
  expect((await teamsShown()).length).toBeGreaterThan(1);
});

test("Teams hit hardest is a compact row of small chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const boxes = await page.locator(".inj-team").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.max(...boxes)).toBeLessThanOrEqual(46);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("the player's face sits on the injury figure's head", async ({ page }) => {
  await open(page);
  const fig = page.getByTestId("injury").first().locator(".inj-figure");
  await expect(fig.getByTestId("fig-face")).toHaveAttribute("href", /a\.espncdn\.com/);
});

test("the injury cartoon wears the team's colours, and a goalie is in pads with a mask", async ({ page }) => {
  const rep = { ...withEdm, items: withEdm.items.map((i: { pos: string | null }, k: number) => (k === 0 ? { ...i, pos: "G" } : k === 1 ? { ...i, pos: "D" } : i)) };
  await open(page, rep);
  const cards = page.getByTestId("injury");
  const g = cards.locator(".inj-mascot[data-goalie='1']");
  await expect(g).toHaveCount(1);
  await expect(g.locator(".m-mask")).toHaveCount(1);
  await expect(g.locator(".m-pack")).toHaveCount(0);
  const skater = cards.locator(".inj-mascot[data-goalie='0']").first();
  await expect(skater.locator(".m-pack")).toHaveCount(1);
  await expect(skater.locator("rect").first()).toBeVisible();
  expect(await skater.locator("image").first().getAttribute("href")).toMatch(/\/logos\//);
});
