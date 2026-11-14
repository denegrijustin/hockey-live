import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import { selectAllTeams, showPeriod } from "./controls";
import teams from "../../src/data/teams.json" with { type: "json" };

/*
 * One game card, every state. Two groups:
 *  - "Games list" runs against the existing GameCard (shared status text, one .gc-icon rule, 44px targets).
 *  - "Home row" runs against GameCardView's `row` variant. It needs Agent 1 / the lead to mount the component in the Home
 *    Scoreboard (replacing ScoreRow); until `.gcv` is on the page those tests skip themselves.
 */
const season = manifest.current;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const short = (id: string) => (teams as any[]).find((t) => t.id === id).short as string;
const base = { season, type: 2, date: today, scheduleState: "OK", venue: "Test Arena", broadcasts: [] as string[], round: null, end: "" };
const G = {
  upcoming: { ...base, id: 9301, start: at(5), state: "FUT", away: "CHI", home: "EDM", awayScore: null, homeScore: null },
  live: { ...base, id: 9302, start: at(-1), state: "LIVE", away: "MIN", home: "DAL", awayScore: 1, homeScore: 2, period: 2, periodType: "REG", clock: "12:31", intermission: false },
  intermission: { ...base, id: 9303, start: at(-1.5), state: "LIVE", away: "COL", home: "WPG", awayScore: 2, homeScore: 2, period: 1, periodType: "REG", clock: "00:00", intermission: true },
  finalReg: { ...base, id: 9304, start: at(-4), state: "FINAL", end: "REG", away: "BOS", home: "TOR", awayScore: 2, homeScore: 3 },
  finalOt: { ...base, id: 9305, start: at(-4.5), state: "FINAL", end: "OT", away: "SEA", home: "VAN", awayScore: 1, homeScore: 2 },
  finalSo: { ...base, id: 9306, start: at(-5), state: "FINAL", end: "SO", away: "NYR", home: "NJD", awayScore: 3, homeScore: 2 },
  postponed: { ...base, id: 9307, start: at(6), state: "FUT", scheduleState: "PPD", away: "PIT", home: "PHI", awayScore: null, homeScore: null },
};

async function open(page: Page, url: string) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "test fixture", games: Object.values(G) };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto(url);
}

test.describe("Games list card", () => {
  const card = (page: Page, g: { away: string; home: string }) => page.locator(".game-card").filter({ has: page.locator("h3", { hasText: short(g.home) }) }).filter({ has: page.locator("h3", { hasText: short(g.away) }) }).first();

  test("status text comes from the shared formatter in every state", async ({ page }) => {
    await open(page, "/?view=games");
    await selectAllTeams(page);
    await expect(card(page, G.live).locator(".game-date")).toContainText("P2 · 12:31");
    await expect(card(page, G.intermission).locator(".game-date")).toContainText("P1 · Intermission");
    await expect(card(page, G.postponed).locator(".game-date")).toContainText("Postponed");
    await expect(card(page, G.upcoming).locator(".game-date")).toContainText(/\d{1,2}:\d{2}\s?(AM|PM)\s\S+/); // local time with its zone
    await showPeriod(page, "past");
    await expect(card(page, G.finalReg).locator(".game-date")).toContainText(/Final$/);
    await expect(card(page, G.finalOt).locator(".game-date")).toContainText("Final/OT");
    await expect(card(page, G.finalSo).locator(".game-date")).toContainText("Final/SO");
  });

  test("logos share one size and the GC tag has a 44px hit area", async ({ page }) => {
    await open(page, "/?view=games");
    const c = card(page, G.live);
    await expect(c).toBeVisible();
    const sizes = await page.locator(".game-card .matchup-team img:not(.int-who img)").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width)))]);
    expect(sizes).toEqual([32]);
    const gc = c.locator(".gc-icon");
    const hit = await gc.evaluate((el) => { const r = el.getBoundingClientRect(), b = getComputedStyle(el, "::before"); return { w: r.width + Math.abs(parseFloat(b.left)) * 2, h: r.height + Math.abs(parseFloat(b.top)) * 2 }; });
    expect(hit.h).toBeGreaterThanOrEqual(44);
    expect(hit.w).toBeGreaterThanOrEqual(44);
  });

  test("360px: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, "/?view=games");
    await expect(page.locator(".game-card").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("Home row (GameCardView, variant row)", () => {
  const row = (page: Page, g: { id: number }) => page.locator(`.sb-row[data-game="${g.id}"]`);
  const ready = async (page: Page) => {
    await open(page, "/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    test.skip((await page.locator(".gcv").count()) === 0, "needs GameCardView mounted on Home by the Scoreboard owner");
  };
  const showFinals = async (page: Page) => { await page.locator(".sb-chip.final").click(); };

  test("status text, live indicator and pill per state", async ({ page }) => {
    await ready(page);
    await expect(row(page, G.upcoming).locator(".sb-status")).toHaveText(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
    await expect(row(page, G.live).locator(".sb-status")).toContainText("P2 · 12:31");
    await expect(row(page, G.live).locator(".sb-status i")).toBeVisible();
    await expect(row(page, G.intermission).locator(".sb-status")).toContainText("P1 · Intermission");
    await expect(row(page, G.postponed).locator(".gcv-pill")).toHaveText("Postponed");
    await expect(row(page, G.postponed).locator(".sb-score .ts-num")).toHaveText(["", ""]);
    await showFinals(page);
    await expect(row(page, G.finalReg).locator(".sb-status")).toHaveText("Final");
    await expect(row(page, G.finalOt).locator(".sb-status")).toHaveText("Final/OT");
    await expect(row(page, G.finalSo).locator(".sb-status")).toHaveText("Final/SO");
  });

  test("final: the winner is emphasised and the loser dimmed", async ({ page }) => {
    await ready(page);
    await showFinals(page);
    const r = row(page, G.finalReg); // BOS 2, TOR 3
    await expect(r.locator(".sb-team.won")).toContainText(short("TOR"));
    await expect(r.locator(".sb-team.lost")).toContainText(short("BOS"));
    const [w, l] = await Promise.all([r.locator(".sb-team.won .sb-score").evaluate((e) => +getComputedStyle(e).fontWeight), r.locator(".sb-team.lost .sb-score").evaluate((e) => +getComputedStyle(e).fontWeight)]);
    expect(w).toBeGreaterThan(l);
  });

  test("one primary button, nothing interactive inside it, secondary controls are siblings", async ({ page }) => {
    await ready(page);
    for (const g of [G.upcoming, G.live, G.postponed]) {
      const r = row(page, g);
      await expect(r.locator("button.sb-main")).toHaveCount(1);
      await expect(r.locator(".sb-main button, .sb-main a")).toHaveCount(0);
      await expect(r.locator("button.sb-main")).toHaveAttribute("aria-label", /Open the full game view\.$/);
      await expect(r.getByRole("button", { name: /Open Game Center for/ })).toHaveCount(1);
    }
    await expect(row(page, G.live).locator(".sb-main")).toHaveAttribute("aria-label", /2, live, period 2, 12:31 left/);
  });

  test("the main button and the GC tag both open the Game Center", async ({ page }) => {
    await ready(page);
    await row(page, G.upcoming).locator(".sb-main").click();
    await expect(page.locator("dialog.game-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close game details" }).click();
    await row(page, G.upcoming).getByRole("button", { name: /Open Game Center for/ }).click();
    await expect(page.locator("dialog.game-dialog")).toBeVisible();
  });

  test("a 40-character team name wraps inside the card, the full name stays in the title", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 }); // below the two-column desktop layout, where names have the narrower column
    await ready(page);
    const name = row(page, G.upcoming).locator(".sb-name").first();
    const long = "Extraordinarily Long Franchise Nickname!";
    expect(long).toHaveLength(40);
    await name.evaluate((el, t) => { el.setAttribute("title", t); el.innerHTML = `<b>${t}</b>`; }, long);
    // the card wraps a long name onto more lines rather than cutting it; it never pushes past the card
    expect(await name.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    expect(await name.evaluate((e) => { const c = e.closest(".sb-row")!.getBoundingClientRect(), r = e.getBoundingClientRect(); return r.right <= c.right; })).toBe(true);
    await expect(name).toHaveAttribute("title", long);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test("360px: no horizontal overflow, targets at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    for (const loc of [row(page, G.live).locator(".sb-main"), row(page, G.live).locator(".gc-icon")]) {
      const box = await loc.evaluate((el) => { const r = el.getBoundingClientRect(), b = getComputedStyle(el, "::before"); return { h: Math.max(r.height, r.height + Math.abs(parseFloat(b.top) || 0) * 2) }; });
      expect(box.h).toBeGreaterThanOrEqual(44);
    }
    expect((await page.locator(".sb-row .team-logo:not(.int-who .team-logo)").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width)))])).length).toBe(1); // one logo size on every row
  });
});
