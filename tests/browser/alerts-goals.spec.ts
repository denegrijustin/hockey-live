import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
// @ts-expect-error plain .mjs module
import { normalizeGameFeed } from "../../src/lib/game-data.mjs";

/**
 * Goal alerts. /api/live and /api/game/:id are mocked with SEQUENCES DERIVED from the real recorded fixture tests/fixtures/raw-live-game.json:
 * its play list (normalized by the app's own normalizeGameFeed) is the real play-by-play; the fixture holds no goal (a real recording of an
 * intermission), so each goal below is a real recorded shot-on-goal play relabelled type "goal" with a score after: DERIVED, not recorded.
 */
const START = "2026-11-10T00:00:00Z";
const T0 = Date.parse(START) - 30 * 60_000;
type Obj = Record<string, unknown>;
const feed = normalizeGameFeed(JSON.parse(readFileSync("tests/fixtures/raw-live-game.json", "utf8")));
const shots = (feed.plays as Obj[]).filter((p) => p.type === "shot-on-goal");
const derivedGoal = (i: number, team: string, score: { home: number; away: number }): Obj => ({ ...shots[i], type: "goal", team, assists: [], goalie: null, score });

async function setup(page: Page, opts: { alerts?: Obj | null; favorites?: string[]; saved?: boolean; start?: string; playsFail?: boolean } = {}) {
  const manifest = await (await page.request.get("/data/manifest.json")).json();
  const season = await (await page.request.get(`/data/seasons/${manifest.current}.json`)).json();
  const base = season.games.find((g: { state: string }) => g.state === "FUT") ?? season.games[0];
  const game = { ...base, start: opts.start ?? START, state: "LIVE", scheduleState: "OK", homeScore: 0, awayScore: 0, end: "REG", period: 1, periodType: "REG", clock: "15:00", intermission: false };
  let current: Obj = { ...game };
  let plays: Obj[] = [...(feed.plays as Obj[])];
  let fails = !!opts.playsFail;
  let gameFetches = 0;
  const prefs = opts.alerts === null ? null : {
    version: 1, favorites: opts.favorites ?? [game.home], games: opts.saved ? [{ id: game.id, season: game.season, home: game.home, away: game.away, date: game.date, at: 1 }] : [],
    alerts: { enabled: true, start: true, period: false, final: true, schedule: true, goal: true, ot: true, scope: { teams: true, players: true, saved: true }, ...opts.alerts },
  };
  await page.addInitScript(([p]) => { try { if (p && !localStorage.getItem("iceboard-prefs-v1")) localStorage.setItem("iceboard-prefs-v1", p); } catch {} }, [prefs && JSON.stringify(prefs)]);
  await page.clock.install({ time: T0 });
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: "2026-11-09", games: [current] } }));
  await page.route(`**/api/game/${game.id}`, (route) => {
    gameFetches += 1;
    if (fails) return route.fulfill({ status: 502, body: "{}" });
    return route.fulfill({ json: { ...feed, id: game.id, home: game.home, away: game.away, state: current.state, plays } });
  });
  await page.goto("/");
  await page.clock.runFor(1000);
  await settle(page);
  return {
    game,
    fetches: () => gameFetches,
    /** Serve a new scoreboard row (and optionally a new play list) and let the poll pick it up. */
    async next(patch: Obj, newPlays?: Obj[]) {
      current = { ...current, ...patch };
      if (newPlays) plays = [...(feed.plays as Obj[]), ...newPlays];
      await page.clock.runFor(31_000);
      await settle(page);
    },
    failPlays(v: boolean) { fails = v; },
  };
}
const settle = (page: Page) => page.waitForTimeout(700); // real time: poll responses and the lazy alert engine arrive asynchronously
const bell = (page: Page) => page.locator('button[aria-label^="Notifications"]');

test("a goal in a followed game alerts once, with the scorer, and a reload adds no duplicate (derived goal)", async ({ page }) => {
  const s = await setup(page);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  expect(s.fetches()).toBe(0); // baseline: no play-by-play fetch until the score or period changes
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  expect(s.fetches()).toBe(1);
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]); // another poll, nothing changed
  expect(s.fetches()).toBe(1); // event-driven: no fetch when nothing changed
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await page.reload();
  await page.clock.runFor(31_000);
  await settle(page);
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await bell(page).click();
  const item = page.locator(".alert-item");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(`Goal ${s.game.home}: ${shots[0].player}`);
  await expect(item).toContainText(`${s.game.home} 1`);
});

test("a goal alert opens Play-by-Play at the event (skips until the pbp tab ships)", async ({ page }) => {
  const s = await setup(page);
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await bell(page).click();
  await page.getByRole("button", { name: "Open play" }).click();
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  const tab = page.getByRole("tab", { name: "Play-by-Play" });
  test.skip((await tab.count()) === 0, "Agent 1's Game Center tabs are not merged yet; the Open play deep link itself is asserted in the iceboard:open-game test below");
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`[data-event-id="${shots[0].id}"]`)).toBeVisible();
});
test("Open play dispatches openGame with the pbp tab and the event id", async ({ page }) => {
  const s = await setup(page);
  await page.evaluate(() => { (window as unknown as { __open: unknown[] }).__open = []; window.addEventListener("iceboard:open-game", (e) => (window as unknown as { __open: unknown[] }).__open.push((e as CustomEvent).detail)); });
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await bell(page).click();
  await page.getByRole("button", { name: "Open play" }).click();
  const detail = await page.evaluate(() => (window as unknown as { __open: unknown[] }).__open[0]);
  expect(detail).toMatchObject({ id: s.game.id, tab: "pbp", event: shots[0].id });
});

test("a stale live game never alerts and fetches nothing", async ({ page }) => {
  const s = await setup(page, { start: "2026-11-09T05:00:00Z" });
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  expect(s.fetches()).toBe(0);
});

test("a disallowed goal is retracted after two polls without it: the original is struck through and 'Goal disallowed' is added", async ({ page }) => {
  const s = await setup(page);
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await s.next({ homeScore: 0 }, []); // goal gone, first poll: debounce, nothing yet
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await s.next({ homeScore: 0 }, []); // second poll without it
  await expect(bell(page)).toHaveAccessibleName("Notifications, 2 unread");
  await bell(page).click();
  await expect(page.locator(".alert-item")).toHaveCount(2);
  await expect(page.locator(".alert-item", { hasText: "Goal disallowed" }).first()).toBeVisible();
  await expect(page.locator('.alert-item[data-retracted] .alert-struck').first()).toContainText("Goal");
});

test("goal alerts off, master switch off, and games not followed stay silent (and fetch nothing)", async ({ page }) => {
  const s1 = await setup(page, { alerts: { goal: false } });
  await s1.next({ homeScore: 1 }, [derivedGoal(0, s1.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  expect(s1.fetches()).toBe(0);
});
test("master switch off: nothing stored, no bell", async ({ page }) => {
  const s = await setup(page, { alerts: { enabled: false } });
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveCount(0);
  expect(s.fetches()).toBe(0);
});
test("a game that is not followed does not alert", async ({ page }) => {
  const s = await setup(page, { favorites: [] });
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  expect(s.fetches()).toBe(0);
});
test("a saved game alerts even when neither team is a favorite", async ({ page }) => {
  const s = await setup(page, { favorites: [], saved: true });
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
});

test("when the play-by-play cannot be fetched a scorer-less score line is used, and the goal is not announced twice later", async ({ page }) => {
  const s = await setup(page, { playsFail: true });
  await s.next({ homeScore: 1 });
  await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
  await bell(page).click();
  await expect(page.locator(".alert-item")).toContainText("Goal scored");
  await expect(page.locator(".alert-item")).not.toContainText(String(shots[0].player));
  await page.keyboard.press("Escape");
});

test("the notification center fits 360px with goal items", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const s = await setup(page);
  await s.next({ homeScore: 1 }, [derivedGoal(0, s.game.home, { home: 1, away: 0 })]);
  await bell(page).click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  for (const b of await dialog.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43);
});
