import { test, expect, type Page } from "@playwright/test";
import { mk, mockApis, type FxGame } from "./fixtures-games";

// Game Center layout (Phase 5, Agent 1): header, tabs, routing, live region. Games and feeds are test mocks (deterministic, labelled as such).
const LIVE = 2026020901, SCHED = 2026020902, FINAL = 2026020903, OT = 2026020904;
const goal = (id: number, team: string, period: number, time: string, player: string) => ({ id, order: id, period, periodType: "REG", time, type: "goal", team, player, penalty: null });
const games = (): FxGame[] => [
  mk.live(LIVE, "FLA", "CAR", { score: [1, 0], period: 2, clock: "08:15" }),
  mk.upcoming(SCHED, "TOR", "MTL", { time: "23:30" }),
  mk.final(FINAL, "BOS", "NYR", { score: [1, 3] }),
  mk.ot(OT, "EDM", "CGY", { score: [3, 2] }),
];

async function setup(page: Page, opts: { detail?: (id: number) => unknown } = {}) {
  const m = await mockApis(page, {
    games: games(),
    live: games().filter((g) => g.state === "LIVE"),
    gameDetail: opts.detail ?? ((id) => {
      const g = games().find((x) => x.id === id)!;
      const plays = id === LIVE ? [goal(11, "FLA", 1, "12:04", "Test Scorer")] : id === FINAL ? [goal(21, "NYR", 1, "05:00", "A"), goal(22, "NYR", 2, "06:00", "B"), goal(23, "BOS", 3, "07:00", "C"), goal(24, "NYR", 3, "19:00", "D")] : [];
      return { ...g, plays, shots: [], goals: plays.map((p) => ({ id: p.id, period: p.period, time: p.time, team: p.team, player: p.player })), stats: id === FINAL ? [{ label: "Shots on goal", away: 20, home: 30 }] : [] };
    }),
  });
  return m;
}
const dialog = (page: Page) => page.locator("dialog.game-dialog");

test.describe("Game Center header", () => {
  test("scheduled game shows the puck drop and no score", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${SCHED}`);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByTestId("gc-status")).toHaveAttribute("data-state", "upcoming");
    await expect(dialog(page).getByTestId("gc-sub")).toContainText("Puck drop");
    await expect(dialog(page).getByTestId("gc-score")).toHaveCount(0);
    await expect(dialog(page).getByTestId("gc-linescore")).toHaveCount(0);
    await expect(dialog(page).locator(".dialog-team")).toHaveCount(2);
  });
  test("live game shows period and clock with a live pill, and the score leads the hierarchy", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${LIVE}`);
    const header = dialog(page).getByTestId("gc-header");
    await expect(header.getByTestId("gc-status")).toHaveAttribute("data-state", "live");
    await expect(header.getByTestId("gc-clock")).toContainText("2nd · 08:15");
    await expect(header.getByTestId("gc-linescore")).toBeVisible();
    const sizes = await header.evaluate((el) => {
      const px = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).fontSize) : 0);
      const score = px(el.querySelector("[data-testid=gc-score]"));
      const others = [...el.querySelectorAll("h3, .gc-clock, .gc-pill, .gc-sub, .gc-linescore")].map(px);
      return { score, max: Math.max(...others) };
    });
    expect(sizes.score).toBeGreaterThan(sizes.max * 1.5);
  });
  test("final and overtime finals say so, with a line score that adds up", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${FINAL}`);
    const header = dialog(page).getByTestId("gc-header");
    await expect(header.getByTestId("gc-status")).toHaveText("Final");
    const rows = header.getByTestId("gc-linescore").locator("tbody tr");
    await expect(rows.nth(0)).toContainText("BOS"); // away first
    await expect(rows.nth(1).locator("td")).toHaveText(["1", "1", "1", "3"]);
    await page.goto(`/?game=${OT}`);
    await expect(dialog(page).getByTestId("gc-status")).toHaveText("Final/OT");
  });
});

test.describe("Game Center tabs", () => {
  test("tablist semantics, roving tabindex, arrows/Home/End, panes stay mounted", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${LIVE}`);
    const tabs = dialog(page).getByRole("tablist", { name: "Game sections" });
    await expect(tabs.getByRole("tab")).toHaveText(["Overview", "Play-by-Play", "Team Stats", "Players", "Matchup Intelligence"]);
    await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog(page).getByRole("tabpanel")).toHaveCount(1); // hidden panels are not exposed
    expect(await dialog(page).locator('[role="tabpanel"][hidden]').count()).toBe(4); // but all five stay mounted
    await tabs.getByRole("tab", { name: "Overview" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Play-by-Play" })).toBeFocused();
    await expect(tabs.getByRole("tab", { name: "Play-by-Play" })).toHaveAttribute("tabindex", "0");
    await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "-1");
    expect(page.url()).toContain("tab=pbp");
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab", { name: "Matchup Intelligence" })).toBeFocused();
    await expect(dialog(page).locator("#gc-pane-intel")).toBeVisible();
    await expect(dialog(page).locator("#gc-pane-overview")).toBeHidden();
    await page.keyboard.press("ArrowRight"); // wraps
    await expect(tabs.getByRole("tab", { name: "Overview" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Home");
    await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(page.url()).not.toContain("tab=");
  });
  for (const width of [390, 360]) {
    test(`the tab bar sticks under the toolbar and nothing overflows at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setup(page);
      await page.goto(`/?game=${FINAL}`);
      const d = dialog(page);
      await expect(d.getByTestId("gc-tabs")).toBeVisible();
      await d.evaluate((el) => { const filler = document.createElement("div"); filler.style.height = "2400px"; el.querySelector(".gc-pane:not([hidden])")!.append(filler); });
      await d.evaluate((el) => { el.scrollTop = 900; });
      const r = await d.evaluate((el) => {
        const t = el.querySelector(".gc-tabs")!.getBoundingClientRect(), bar = el.querySelector(".dialog-toolbar")!.getBoundingClientRect(), box = el.getBoundingClientRect();
        return { tabTop: t.top - box.top, barBottom: bar.bottom - box.top, overflowX: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - innerWidth, tabH: t.height };
      });
      expect(r.tabTop).toBeGreaterThanOrEqual(r.barBottom - 1); // never under the toolbar
      expect(r.tabTop - r.barBottom).toBeLessThanOrEqual(16); // and stuck right below it
      expect(r.tabH).toBeGreaterThanOrEqual(44);
      expect(r.overflowX).toBeLessThanOrEqual(1);
      expect(r.page).toBeLessThanOrEqual(0);
      await expect(d.getByRole("tab", { name: "Overview" })).toBeInViewport();
    });
  }
});

test.describe("Game Center routing", () => {
  test("opening pushes a history entry, Back closes, Close removes the parameters", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    const before = page.url();
    await page.locator(`[data-game-id="${FINAL}"] .sb-main, [data-game="${FINAL}"] .sb-main`).first().click().catch(() => {});
    // Open through the app's own event, the single entry point search and alerts use.
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent("iceboard:open-game", { detail: { id, tab: "stats" } })), FINAL);
    await expect(dialog(page)).toBeVisible();
    expect(page.url()).toContain(`game=${FINAL}`);
    expect(page.url()).toContain("tab=stats");
    await expect(dialog(page).getByRole("tab", { name: "Team Stats" })).toHaveAttribute("aria-selected", "true");
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(before);
    await page.goForward();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close full game view" }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).not.toContain("game=");
  });
  test("a deep link opens the game, tab and event; closing it removes the parameters", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${FINAL}&tab=players`);
    await expect(dialog(page).getByRole("tab", { name: "Players" })).toHaveAttribute("aria-selected", "true");
    await page.goto(`/?game=${FINAL}&event=22`);
    await expect(dialog(page).getByRole("tab", { name: "Play-by-Play" })).toHaveAttribute("aria-selected", "true");
    await dialog(page).getByRole("button", { name: "Close full game view" }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).not.toMatch(/game=|tab=|event=/);
  });
  test("an unknown or malformed game id is a polite not-found, not a crash", async ({ page }) => {
    await setup(page);
    await page.goto("/?game=2026029999");
    await expect(page.getByTestId("gc-not-found")).toContainText("Game not found");
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Dismiss" }).click();
    expect(page.url()).not.toContain("game=");
    await page.goto("/?game=abc&tab=zzz");
    await expect(page.locator("main, #root").first()).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId("gc-not-found")).toHaveCount(0);
  });
  test("an open-game event with a tab and an event selects them on an already open Game Center", async ({ page }) => {
    await setup(page);
    await page.goto(`/?game=${FINAL}`);
    await expect(dialog(page)).toBeVisible();
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent("iceboard:open-game", { detail: { id, tab: "pbp", event: 23 } })), FINAL);
    await expect(dialog(page).getByRole("tab", { name: "Play-by-Play" })).toHaveAttribute("aria-selected", "true");
    expect(page.url()).toContain("event=23");
  });
});

test.describe("Game Center live region", () => {
  test("is silent on first render and announces a goal when the score changes", async ({ page }) => {
    await page.clock.install();
    let score: [number, number] = [1, 0];
    let plays = [goal(11, "FLA", 1, "12:04", "Test Scorer")];
    const m = await setup(page, { detail: (id) => ({ ...games().find((x) => x.id === id)!, awayScore: score[0], homeScore: score[1], plays, shots: [], goals: [], stats: [] }) });
    await page.goto(`/?game=${LIVE}`);
    const region = dialog(page).getByTestId("gc-live-region");
    await expect(region).toHaveAttribute("role", "status");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("aria-atomic", "true");
    await expect(dialog(page).getByTestId("gc-score").first()).toHaveText("1");
    await page.clock.runFor(2000);
    await expect(region).toHaveText(""); // nothing on first render or on clock ticks
    expect(await page.locator("[data-testid=gc-live-region]").count()).toBe(1);
    // The clock moving is not announced.
    await page.clock.runFor(20000);
    await expect(region).toHaveText("");
    // A goal arrives in both the live scoreboard and the game feed.
    score = [1, 1];
    plays = [...plays, goal(12, "CAR", 2, "08:15", "Other Scorer")];
    const live = games().filter((g) => g.id === LIVE).map((g) => ({ ...g, awayScore: 1, homeScore: 1 }));
    m.setLive(live);
    await page.clock.runFor(60000);
    await expect(region).toContainText("Goal, CAR 1, FLA 1", { timeout: 10000 });
    await expect(region).toContainText("08:15 2nd");
  });
});
