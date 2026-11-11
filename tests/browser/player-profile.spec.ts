import { expect, test, type Page } from "@playwright/test";

const SEASON = 20262027;
const g = (gameId: number, gameDate: string, opp: string, goals: number, assists: number) => ({ gameId, gameDate, gameTypeId: 2, homeRoadFlag: gameId % 2 ? "H" : "R", opponentAbbrev: opp, teamAbbrev: "EDM", goals, assists, points: goals + assists, plusMinus: 1, shots: 3, pim: 0, powerPlayGoals: 0, shifts: 27, shorthandedGoals: 0, toi: "25:15" });
const skater = {
  id: 8478402, name: "Connor McDavid", number: 97, headshot: "", position: "C", team: "EDM", birthDate: "1997-01-13", height: 73, weight: 194, shoots: "L", updatedAt: new Date().toISOString(),
  seasons: [{ season: SEASON, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 18, goals: 10, assists: 37, points: 47, plusMinus: 22, shots: 49, pim: 2, avgToi: "23:40", shootingPctg: 0.204082, teamName: { default: "Edmonton Oilers" } }],
  featuredStats: { season: SEASON, regularSeason: { subSeason: { gamesPlayed: 18, goals: 10, assists: 37, points: 47, plusMinus: 22, shots: 49, pim: 2, shootingPctg: 0.204082 }, career: {} } },
  last5Games: [g(2026020276, "2026-11-07", "VAN", 0, 3), g(2026020260, "2026-11-05", "CGY", 1, 1), g(2026020250, "2026-11-03", "SEA", 0, 0), g(2026020240, "2026-11-01", "LAK", 2, 0), g(2026020230, "2026-10-30", "ANA", 0, 1)],
};
const goalie = {
  id: 8477424, name: "Juuse Saros", number: 74, headshot: "", position: "G", team: "NSH", birthDate: "1995-04-19", height: 71, weight: 180, shoots: "L", updatedAt: new Date().toISOString(),
  seasons: [{ season: SEASON, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 12, gamesStarted: 12, wins: 5, losses: 3, otLosses: 4, shutouts: 0, goalsAgainst: 32, shotsAgainst: 361, goalsAgainstAvg: 2.621757, savePctg: 0.911357, timeOnIce: "732:20", teamName: { default: "Nashville Predators" } }],
  featuredStats: { season: SEASON, regularSeason: { subSeason: { gamesPlayed: 12, goalsAgainstAvg: 2.621757, losses: 3, otLosses: 4, savePctg: 0.911357, shutouts: 0, wins: 5 }, career: {} } },
  last5Games: [
    { gameId: 2026020266, gameDate: "2026-11-07", opponentAbbrev: "STL", homeRoadFlag: "H", decision: "W", gamesStarted: 1, goalsAgainst: 1, shotsAgainst: 25, savePctg: 0.96, toi: "60:00" },
    { gameId: 2026020255, gameDate: "2026-11-05", opponentAbbrev: "DAL", homeRoadFlag: "R", decision: "L", gamesStarted: 1, goalsAgainst: 4, shotsAgainst: 30, savePctg: 0.867, toi: "58:00" },
    { gameId: 2026020245, gameDate: "2026-11-03", opponentAbbrev: "MIN", homeRoadFlag: "R", decision: "O", gamesStarted: 1, goalsAgainst: 3, shotsAgainst: 28, savePctg: 0.893, toi: "65:00" },
  ],
};
const roster = (team: string, list: any[], goalies: any[] = []) => ({ season: SEASON, gameType: 2, updatedAt: new Date().toISOString(), skaters: list, goalies });
const sk = (id: number, name: string, goals: number, assists: number) => ({ id, name, team: "EDM", position: "C", gp: 18, goals, assists, shots: 40, plusMinus: 1, pim: 0, toi: 1000, headshot: "", hits: 7 });
const log10 = { id: 8478402, season: SEASON, updatedAt: new Date().toISOString(), games: Array.from({ length: 10 }, (_, i) => g(2026020100 + i, `2026-10-${String(10 + i * 2).padStart(2, "0")}`, "VAN", i % 3 === 0 ? 1 : 0, 1)) };

async function setup(page: Page, counts: Record<string, number> = {}) {
  await page.route("**/api/injuries/**", (r) => r.fulfill({ json: { season: SEASON, updatedAt: new Date().toISOString(), sourceUpdated: null, items: [{ id: "1", name: "Connor McDavid", team: "EDM", status: "Day-to-day", kind: "Upper body" }], teams: [] } }));
  await page.route("**/api/players/**", (r) => {
    const team = r.request().url().split("/").pop()!;
    return r.fulfill({ json: team === "NSH" ? roster("NSH", [], [{ id: 8477424, name: "Juuse Saros", team: "NSH", position: "G", gp: 12, saves: 329, shotsAgainst: 361, goalsAgainst: 32, savePct: 0.911, headshot: "" }, { id: 8480000, name: "Backup Goalie", team: "NSH", position: "G", gp: 4, saves: 80, shotsAgainst: 90, goalsAgainst: 10, savePct: 0.889, headshot: "" }]) : roster(team, [sk(8478402, "Connor McDavid", 10, 37), sk(8477934, "Leon Draisaitl", 12, 20), sk(8479999, "Third Skater", 2, 3)]) });
  });
  await page.route(/\/api\/player\/\d{7}$/, (r) => {
    const id = r.request().url().split("/").pop()!;
    counts[id] = (counts[id] ?? 0) + 1;
    if (id === "8478402") return r.fulfill({ json: skater });
    if (id === "8477424") return r.fulfill({ json: goalie });
    if (id === "8470001") return r.fulfill({ json: { id: 8470001, name: "Nobody Yet", number: null, headshot: "", position: "D", team: "EDM", seasons: [], updatedAt: new Date().toISOString() } });
    return r.fulfill({ status: 404, body: "{}" });
  });
  await page.route(/\/api\/player\/\d{7}\/log\//, (r) => r.fulfill({ json: log10 }));
}
const dlg = (page: Page) => page.locator("dialog.player-dialog[open]");

test("skater profile: header, labelled stats, recent games, chart text, team context, injury badge", async ({ page }) => {
  const counts: Record<string, number> = {};
  await setup(page, counts);
  await page.goto("/?view=players");
  const opener = page.getByRole("button", { name: "View Connor McDavid details" }).first();
  await opener.click();
  const d = dlg(page);
  await expect(d.getByRole("heading", { name: "Connor McDavid" })).toBeVisible();
  await expect(d).toContainText("#97 · C · Shoots L");
  await expect(d.getByRole("region", { name: "Season 2026–27, regular season" })).toContainText("Shooting %");
  await expect(d.getByRole("region", { name: "Season 2026–27, regular season" })).toContainText("23:40");
  await expect(d.getByTestId("player-injury")).toContainText("Day-to-day");
  await expect(d.getByRole("region", { name: "Recent games" })).toContainText("Last 5 games played: Oct 30–Nov 7");
  await expect(d.getByRole("button", { name: /Open Game Center: Nov 7/ })).toBeVisible();
  await expect(d.locator("svg[role=img]")).toHaveAttribute("aria-label", /Points per game\. Last 5 games played.*Nov 7: 3/);
  await expect(d.getByRole("region", { name: "Team context" })).toContainText("Share of team goals");
  await expect(d.getByRole("region", { name: "Team context" })).toContainText("Derived");
  await d.getByRole("button", { name: "Last 10" }).click();
  await expect(d.getByRole("region", { name: "Recent games" })).toContainText("Last 10 games played");
  expect(counts["8478402"]).toBe(1);
  await d.getByRole("button", { name: "Close player details" }).click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("goalie layout has goalie stats, no skater columns, and a save percentage chart", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=players&player=8477424");
  const d = dlg(page);
  await expect(d.getByRole("heading", { name: "Juuse Saros" })).toBeVisible();
  await expect(d).toContainText("Catches L");
  const stats = d.getByRole("region", { name: "Season 2026–27, regular season" });
  for (const k of ["Starts", "OTL", "GAA", "SV%", "SO", "Saves", "Shots against"]) await expect(stats).toContainText(k);
  await expect(stats).toContainText("2.62");
  await expect(stats).toContainText(".911");
  await expect(stats).not.toContainText("Shooting %");
  await expect(d.locator("svg[role=img]")).toHaveAttribute("aria-label", /Save percentage per game/);
  await expect(d.getByRole("region", { name: "Team context" })).toContainText("SV% rank among team goalies");
});

test("a player with no published stats and a failed fetch both say so", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=players&player=8470001");
  await expect(dlg(page)).toContainText("Statistics for this season have not been published yet.");
  await expect(dlg(page)).toContainText("No games played this season yet");
  await page.goBack();
  await page.goto("/?view=players&player=8479999");
  await expect(dlg(page).getByRole("alert")).toContainText("could not be found");
  await expect(dlg(page).getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a deep link opens the profile, Back closes it and removes the parameter, the team link opens the team", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=players");
  await page.getByRole("button", { name: "View Connor McDavid details" }).first().click();
  await expect(dlg(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("player")).toBe("8478402");
  await page.goBack();
  await expect(dlg(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("player")).toBe(false);
  await page.goForward();
  await expect(dlg(page)).toBeVisible();
  await dlg(page).getByRole("button", { name: "Close player details" }).click();
  await expect(dlg(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("player")).toBe(false);
  await page.goto("/?view=players&player=8478402");
  await dlg(page).getByRole("button", { name: /Open Edmonton Oilers team profile/ }).click();
  await expect(page.locator("dialog.player-dialog[open]")).toHaveCount(0);
  await expect(page.locator("dialog.team-dialog[open]")).toBeVisible();
  expect(new URL(page.url()).searchParams.has("player")).toBe(false);
});

test("Escape closes and returns focus; the profile fits a 360px phone", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/?view=players");
  const opener = page.getByRole("button", { name: "View Connor McDavid details" }).first();
  await opener.click();
  await expect(dlg(page).getByRole("region", { name: "Recent games" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dlg(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const small = await dlg(page).locator("button:visible, a:visible").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent));
  expect(small).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dlg(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});
