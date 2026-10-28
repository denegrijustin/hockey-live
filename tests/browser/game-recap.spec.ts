import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null };
let n = 0;
const play = (type: string, team: string, x: number, y: number, period: number, time: string, player = "Skater") => ({ id: ++n, order: n, type, team, x, y, period, periodType: "REG", time, player });
const live = { ...base, id: 9501, home: "TOR", away: "BOS", state: "LIVE", period: 3, periodType: "REG", clock: "10:00", awayScore: 1, homeScore: 1, start: new Date(Date.now() - 6000000).toISOString(), homeShots: 12, awayShots: 9 };
const final = { ...base, id: 9502, home: "DAL", away: "MIN", state: "FINAL", end: "REG", awayScore: 1, homeScore: 3, start: new Date(Date.now() - 12000000).toISOString(), homeShots: 30, awayShots: 22 };
const slot = (team: string, i: number, period: number, time: string, type = "shot-on-goal", player = "Skater") => play(type, team, team === "TOR" || team === "DAL" ? 80 - (i % 4) : -78 + (i % 4), (i % 5) - 2, period, time, player);
const feedPlays = (home: string, away: string) => [
  ...Array.from({ length: 6 }, (_, i) => slot(home, i, 1 + (i % 3), `${2 + i}:00`)),
  ...Array.from({ length: 4 }, (_, i) => slot(away, i, 1 + (i % 3), `${4 + i}:30`)),
  play("goal", home, 82, 1, 2, "08:10", "Auston Matthews"), play("goal", away, -80, -3, 3, "02:40", "Brad Marchand"), play("missed-shot", home, 60, 20, 3, "04:00"),
];
const stats = [{ label: "hit", home: 21, away: 14 }, { label: "faceoff", home: 15, away: 11 }];

async function open(page: Page) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [live, final] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const g = id === live.id ? live : final;
    const plays = feedPlays(g.home, g.away);
    return route.fulfill({ json: { ...g, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), stats } });
  });
  await page.goto("/");
}

test("an opened live card shows the game recap, filling in from the live feed", async ({ page }) => {
  await open(page);
  const row = page.locator(`.sb-row[data-game="${live.id}"]`);
  await row.locator(".sb-main").click();
  const recap = row.getByTestId("game-recap");
  await expect(recap).toBeVisible();
  await expect(recap.locator(".mini-heading")).toContainText("Updating as it is played");
  await expect(recap).toHaveAttribute("data-source", "estimate");
  await expect(recap.locator(".gr-deserved")).toContainText("Deserved to win");
  await expect(recap.locator(".gr-race svg")).toBeVisible();
  await expect(recap.locator(".gr-goal")).toHaveCount(2); // both goals are on the race chart
  await expect(recap.locator(".gr-map")).toHaveCount(2);
  const pcts = (await recap.locator(".gr-dbar b").allInnerTexts()).join(" ");
  expect(pcts).toMatch(/BOS \d+%/);
  expect(pcts).toMatch(/\d+% TOR/);
  // Numbers side by side: attempts, shots on goal, expected goals, xG per attempt, faceoffs, hits.
  await expect(recap.locator(".gr-row")).toHaveCount(6);
  await expect(recap.locator(".gr-compare")).toContainText("Hits");
  await expect(recap.locator(".gr-goals li")).toHaveCount(2);
  await expect(recap.locator(".gr-goals")).toContainText("Matthews");
  await expect(recap.locator(".gr-note")).toContainText("estimated");
  // The old heat map is gone.
  await expect(page.getByTestId("heat-ice")).toHaveCount(0);
});

test("a finished game's card shows the recap with the final numbers", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /completed/ }).click();
  const recap = page.locator(`.sb-row[data-game="${final.id}"]`).getByTestId("game-recap");
  await expect(recap).toBeVisible();
  await expect(recap.locator(".mini-heading")).toContainText("Final");
  await expect(recap.locator(".gr-shot").first()).toBeVisible();
  await expect(recap.locator(".gr-goals li")).toHaveCount(2);
});

for (const [label, width] of [["a 360px phone", 360], ["a laptop", 1280]] as const) {
  test(`the recap fits ${label} with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.locator(`.sb-row[data-game="${live.id}"] .sb-main`).click();
    const recap = page.getByTestId("game-recap").first();
    await expect(recap).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await recap.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    // The two shot maps sit side by side (or beside the numbers on a wide screen), not stacked off-screen.
    const [a, h] = await Promise.all([recap.locator(".gr-map.away").boundingBox(), recap.locator(".gr-map.home").boundingBox()]);
    expect(Math.abs(a!.y - h!.y)).toBeLessThan(4);
  });
}

test("a game in the second period shows only the 1st and 2nd on the race chart, and the shot maps use dark team colours with goals ringed in the second colour", async ({ page }) => {
  const inSecond = { ...live, period: 2, clock: "08:00" };
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [inSecond, final] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    const plays = feedPlays("TOR", "BOS").map((p) => ({ ...p, period: Math.min(p.period, 2) }));
    return route.fulfill({ json: { ...inSecond, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), stats } });
  });
  await page.goto("/");
  const row = page.locator(`.sb-row[data-game="${live.id}"]`);
  await row.locator(".sb-main").click();
  const recap = row.getByTestId("game-recap");
  await expect(recap).toBeVisible();
  const labels = await recap.locator(".gr-race .gr-ax").allTextContents();
  expect(labels).toContain("1st");
  expect(labels).toContain("2nd");
  expect(labels).not.toContain("3rd");
  expect(await recap.locator(".gr-race .gr-sep").count()).toBe(1); // one boundary: between the 1st and 2nd
  // Shot-map markers: dark enough for white ice, the two teams told apart, and a goal outlined in a different colour than its fill.
  const dots = await recap.locator(".gr-map circle.gr-shot").evaluateAll((els) => els.map((e) => ({ home: e.classList.contains("home"), goal: e.classList.contains("goal"), fill: (e as SVGElement).style.fill, stroke: (e as SVGElement).style.stroke })));
  const lum = (css: string) => { const m = css.match(/\d+/g)!.map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; };
  const solid = dots.filter((d) => d.fill);
  expect(solid.length).toBeGreaterThan(0);
  for (const d of solid) expect(lum(d.fill)).toBeLessThan(0.5);
  expect(new Set(solid.filter((d) => d.home).map((d) => d.fill)).size).toBe(1);
  expect(solid.find((d) => d.home)!.fill).not.toBe(solid.find((d) => !d.home)!.fill);
  for (const g of dots.filter((d) => d.goal)) expect(g.stroke).not.toBe(g.fill);
});

test("the Game Center has the shot chart for a live game and for a finished one", async ({ page }) => {
  await open(page);
  for (const g of [live, final]) {
    if (g === final) await page.getByRole("button", { name: /completed/ }).click();
    await page.locator(`.sb-row[data-game="${g.id}"] .gc-icon`).click();
    const dialog = page.locator("dialog.game-dialog[open]");
    const section = dialog.getByTestId("gc-recap-section");
    await expect(section).toBeVisible({ timeout: 30000 });
    await expect(section.locator(".gr-map")).toHaveCount(2); // both teams' shot charts
    await expect(section.locator("circle.gr-shot").first()).toBeVisible();
    await expect(section.locator(".gr-deserved")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (g === final) await page.getByRole("button", { name: /completed/ }).click();
  }
});
