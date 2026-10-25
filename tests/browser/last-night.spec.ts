import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const et = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const game = (id: number, offset: number, away: string, home: string, aw: number, hw: number, end = "REG", state = "FINAL") => ({ id, season, type: 2, date: et(offset), start: `${et(offset)}T23:${String(id % 60).padStart(2, "0")}:00Z`, state, scheduleState: "OK", venue: "Test Arena", home, away, homeScore: state === "FINAL" ? hw : null, awayScore: state === "FINAL" ? aw : null, end: state === "FINAL" ? end : "", broadcasts: [], round: null });
const games = [game(9601, -1, "ANA", "PHI", 5, 4, "OT"), game(9602, -1, "LAK", "NJD", 1, 3), game(9603, -1, "TOR", "EDM", 7, 2), game(9604, 0, "BOS", "CHI", 0, 0, "", "FUT"), game(9600, -2, "NYR", "OTT", 2, 1)];
const sk = (id: number, name: string, team: string, o: object = {}) => ({ id, name, team, position: "C", headshot: `https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`, toi: "17:00", goals: 0, assists: 0, shots: 2, plusMinus: 0, pim: 0, hits: 1, blocks: 0, takeaways: 0, giveaways: 0, saves: null, shotsAgainst: null, goalsAgainst: null, ...o });
const boxes: Record<number, unknown> = {
  9601: { id: 9601, state: "OFF", homeShots: 30, awayShots: 33, players: [sk(1, "Jake Sanderson", "ANA", { goals: 1, assists: 2, shots: 2, plusMinus: 3 }), sk(2, "Drake Batherson", "PHI", { goals: 3, assists: 1, shots: 3, plusMinus: 2 })] },
  9602: { id: 9602, state: "OFF", homeShots: 25, awayShots: 22, players: [sk(3, "Sean Durzi", "LAK", { plusMinus: -3, pim: 2 }), sk(4, "Ty Emberson", "NJD", { plusMinus: -2 })] },
  9603: { id: 9603, state: "OFF", homeShots: 20, awayShots: 40, players: [sk(5, "Shakir Mukhamadullin", "EDM", { plusMinus: -4, giveaways: 2 }), sk(6, "Dylan Strome", "TOR", { goals: 2, assists: 1, shots: 5, plusMinus: 3 })] },
};
const mpGames = { schema: 1, source: "MoneyPuck.com", season, seasonId: season, sourceUpdated: { summary: new Date().toISOString(), shots: new Date().toISOString() }, through: 9603, derived: "x", games: { 9601: { id: 9601, goalies: [{ id: 70, name: "Pyotr Kochetkov", team: "CAR", xGA: 2.1, GA: 0, SOG: 24 }] } } };

async function open(page: Page, url = "/?view=yesterday") {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/boxscore/*", (route) => { const id = Number(route.request().url().split("/").pop()); return boxes[id] ? route.fulfill({ json: boxes[id] }) : route.fulfill({ status: 404, body: "{}" }); });
  await page.route("**/data/games/*.json", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route(/\/data\/moneypuck\/\d+\/games\.json/, (route) => route.fulfill({ json: mpGames }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const g = games.find((x) => x.id === id);
    if (!g) return route.fulfill({ status: 404, body: "{}" });
    let n = 0;
    const shot = (team: string, i: number, period: number, time: string, type = "shot-on-goal", player = "Skater") => ({ id: id * 100 + ++n, order: n, type, team, x: team === g.home ? 80 - (i % 4) : -78 + (i % 4), y: (i % 5) - 2, period, periodType: "REG", time, player });
    const plays = [...Array.from({ length: 6 }, (_, i) => shot(g.home, i, 1 + (i % 3), `${2 + i}:00`)), ...Array.from({ length: 5 }, (_, i) => shot(g.away, i, 1 + (i % 3), `${4 + i}:30`)), shot(g.home, 1, 2, "08:10", "goal", "Home Scorer"), shot(g.away, 2, 3, "02:40", "goal", "Away Scorer")];
    return route.fulfill({ json: { ...g, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), stats: [{ label: "hit", home: 12, away: 9 }, { label: "faceoff", home: 20, away: 18 }] } });
  });
  await page.route("**/assets.nhle.com/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(url);
}

test("Last night lists yesterday's finals, away team first, with overtime marked and the winner bold", async ({ page }) => {
  await open(page);
  const box = page.getByTestId("last-night");
  await expect(box).toBeVisible({ timeout: 30000 });
  await expect(box.locator(".ln-finals li")).toHaveCount(3); // today's unplayed game and the day before are not here
  await expect(box.locator(".ln-finals li").first()).toContainText("ANA");
  await expect(box.locator(".ln-finals li").first().locator(".ln-score small")).toHaveText("OT");
  await expect(box.locator(".ln-finals li").first().locator(".ln-score strong.win")).toHaveText("5");
  await expect(box.locator("h2")).toHaveText("Last night in the NHL");
});

test("best nights, the goalie of the night, and best and worst with what built each score", async ({ page }) => {
  await open(page);
  const box = page.getByTestId("last-night");
  await expect(box.locator(".ln-best li").first()).toContainText("Drake Batherson", { timeout: 30000 }); // 3G 1A beats 1G 2A
  const scores = (await box.locator(".ln-best .ln-gs").allInnerTexts()).map((t) => Number(t.replace("−", "-")));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  await expect(box.getByTestId("goalie-of-the-night")).toContainText("Kochetkov");
  await expect(box.getByTestId("goalie-of-the-night")).toContainText("+2.10");
  const chart = box.locator(".ln-chart");
  await expect(chart.locator(".ln-group").first().locator("li")).toHaveCount(5);
  await expect(chart.locator(".ln-group").nth(1).locator("li")).toHaveCount(1); // six skaters in the fixture: five best, one left for the worst
  await expect(chart.locator(".ln-group").nth(1).locator("li").first()).toContainText("Mukhamadullin"); // the worst night
  await expect(chart.locator(".ln-group").nth(1).locator(".ln-gs").first()).toContainText("−");
  expect(await chart.locator(".ln-bar").count()).toBeGreaterThan(0);
  await expect(chart.locator(".ln-note")).toContainText("box score");
});

test("it has its own tab", async ({ page }) => {
  await open(page, "/");
  if (page.viewportSize()!.width < 700) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Last night", exact: true }).click();
  await expect(page.getByTestId("last-night")).toBeVisible({ timeout: 30000 });
});

for (const [label, width] of [["a 360px phone", 360], ["a laptop", 1280]] as const) {
  test(`Last night fits ${label} with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await expect(page.locator(".ln-chart .ln-bar").first()).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.getByTestId("last-night").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  });
}

test("a game opens from the list: its own best and worst nights, the game flow, shot maps and period breakdown, and Back returns", async ({ page }) => {
  await open(page);
  const box = page.getByTestId("last-night");
  await expect(box.locator(".ln-finals li").first()).toBeVisible({ timeout: 30000 });
  await box.locator(".ln-finals li").first().getByRole("button").click(); // ANA at PHI
  const game = page.getByTestId("last-night-game");
  await expect(game).toBeVisible();
  await expect(game).toContainText("at Philadelphia Flyers");
  await expect(game.locator(".ln-bigscore")).toContainText("5");
  // Only this game's players are in its best and worst chart.
  const names = await game.locator(".ln-chart .ln-who b").allInnerTexts();
  expect(names.every((n) => ["Jake Sanderson", "Drake Batherson"].includes(n))).toBe(true);
  await expect(game.getByTestId("game-recap")).toBeVisible({ timeout: 30000 });
  await expect(game.locator(".gr-map")).toHaveCount(2);
  await expect(game.locator(".gr-period").first()).toBeVisible();
  await game.getByRole("button", { name: "xG" }).click();
  await expect(game.locator(".gr-prow").first()).toContainText(/\d\.\d\d/);
  await game.getByRole("button", { name: /All of last night/ }).click();
  await expect(box.locator(".ln-finals li")).toHaveCount(3);
});

test("a game from last night fits a 360px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  await page.getByTestId("last-night").locator(".ln-finals li").nth(2).getByRole("button").click();
  await expect(page.getByTestId("game-recap")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.getByTestId("last-night-game").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

for (const [label, width] of [["a 360px phone", 360], ["a laptop", 1280]] as const) {
  test(`final scores on ${label}: team, score and team sit side by side and never overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const rows = page.getByTestId("last-night").locator(".ln-finals li");
    await expect(rows.first()).toBeVisible({ timeout: 30000 });
    for (let i = 0; i < (await rows.count()); i++) {
      const [away, score, home, row] = await Promise.all([
        rows.nth(i).locator(".ln-side").first().boundingBox(), rows.nth(i).locator(".ln-score").boundingBox(), rows.nth(i).locator(".ln-side.home").boundingBox(), rows.nth(i).boundingBox(),
      ]);
      expect(away!.x + away!.width).toBeLessThanOrEqual(score!.x + 1);
      expect(score!.x + score!.width).toBeLessThanOrEqual(home!.x + 1);
      expect(home!.x + home!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
    }
  });
}
