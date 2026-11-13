import { expect, test } from "@playwright/test";
import { filterGames, selectAllTeams } from "./controls";
import fx from "../fixtures/live-scoreboard.json" with { type: "json" };

// The expanded card's projection is a win-chance chart on the home team's colour; with a play-by-play it draws the history so far.
test("the expanded card shows the win-chance chart, on the home colour, with its history line", async ({ page }) => {
  const start = new Date(Date.now() - 2 * 3600e3).toISOString();
  const games = fx.games.map((g) => ({ ...g, start, state: "LIVE", intermission: false, period: 3, periodType: "REG", clock: "06:10", awayScore: 2, homeScore: 3, homeShots: 30, awayShots: 22 }));
  await page.route("**/api/live", (r) => r.fulfill({ json: { ...fx, games } }));
  await page.route(/\/api\/game\/\d+(\?.*)?$/, (r) => {
    const gid = Number(new URL(r.request().url()).pathname.split("/").pop());
    const g = games.find((x) => x.id === gid) ?? games[0];
    let id = 1;
    const plays: any[] = [];
    const add = (period: number, time: string, team: string, type: string) => plays.push({ id: id++, order: id, period, periodType: "REG", time, type, team, player: null, penalty: null, duration: null, x: null, y: null });
    for (let m = 1; m < 46; m += 2) { const per = Math.floor(m / 20) + 1; add(per, `${String(m - (per - 1) * 20).padStart(2, "0")}:30`, m % 3 ? g.home : g.away, "shot-on-goal"); }
    add(1, "07:00", g.away, "goal"); add(2, "03:00", g.home, "goal"); add(2, "12:00", g.home, "goal"); add(3, "02:00", g.away, "goal"); add(3, "05:00", g.home, "goal");
    r.fulfill({ json: { ...g, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), roster: [], situation: null, updatedAt: new Date().toISOString(), stats: [] } });
  });
  await page.goto("/?view=games");
  await selectAllTeams(page);
  await filterGames(page, { competition: String(games[0].type), window: "all" });
  const card = page.locator(".game-card").first();
  await card.locator(".game-card-summary").click();
  const win = card.locator(".win");
  await expect(win).toBeVisible();
  await expect(win.locator(".win-chip")).toHaveCount(2);
  await expect(win.locator(".win-chip.lead")).toHaveCount(1);
  await expect(win.locator(".win-badge-in b")).toContainText("%");
  // the history line fills in once the play-by-play arrives (the card reads the feed only while the chart is on screen)
  await win.scrollIntoViewIfNeeded();
  await expect(win.locator(".win-line")).toBeAttached({ timeout: 15000 });
  expect(((await win.locator(".win-line").getAttribute("d")) ?? "").split("L").length).toBeGreaterThan(10);
  expect(await win.evaluate((e) => getComputedStyle(e).backgroundImage)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
