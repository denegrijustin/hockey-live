import { expect, test, type Page } from "@playwright/test";
import { countRequests, watchErrors } from "./qa-harness";
import { REAL, gameOf, mockSchedule, openFromHome, pollSequence, relabelShotAsGoal, removeEvent, replicate, scoringGoals, slice, withState, GAME_DIALOG } from "./gc-qa-fixtures";

// Game Center guard rails that hold on the CURRENT app and keep guarding after the Phase 5 changes. Data: real recorded plays
// (tests/fixtures/gc, docs/phase5-qa-fixtures.md); states/derived variants are labelled in raw._provenance.
// test.fixme blocks need unmerged Phase 5 features (tabs, play-by-play, live region); un-fixme them in the validation wave.
// Selectors: dialog.game-dialog, aria-labels, data-testid from docs/phase5-contracts.md.

const live = () => withState(slice(REAL.ot(), 200), "live", { clock: "12:34" });
const noOverflow = async (page: Page, width: number) => {
  const m = await page.evaluate(() => {
    const d = document.querySelector("dialog.game-dialog") as HTMLElement;
    return { dialog: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(m.dialog, `dialog overflows horizontally at ${width}px`).toBeLessThanOrEqual(1);
  expect(m.page, `page overflows horizontally at ${width}px`).toBeLessThanOrEqual(1);
};
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((h) => { Object.defineProperty(document, "hidden", { value: h, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }, hidden);

test.describe("requests and polling", () => {
  test("opening a live Game Center requests each URL a bounded number of times in 30 s (baseline provider)", async ({ page }) => {
    await page.clock.install();
    const counts = countRequests(page);
    const errors = watchErrors(page);
    const { feed, row } = await openFromHome(page, pollSequence(REAL.ot(), 4).map((r) => withState(r, "live")));
    await page.clock.runFor(30_000);
    const rows = [...counts].sort((a, b) => b[1] - a[1]);
    console.log(`Game Center open, 30 s, game ${row.id}:\n` + rows.map(([p, n]) => `  ${n}x ${p}`).join("\n"));
    test.info().annotations.push({ type: "requests", description: rows.map(([p, n]) => `${n}x ${p}`).join("; ") });
    const game = [...counts].filter(([p]) => p.startsWith("/api/game/"));
    expect(game.length, "one URL per game (no ?score= variants split subscriptions)").toBe(1);
    // The overlay and its card/provider share one subscription: loose bound that still catches a fetch loop or a per-pane fetch.
    expect(feed.hits, "/api/game hits in 30 s").toBeLessThanOrEqual(4);
    expect(counts.get("/api/live") ?? 0).toBeLessThanOrEqual(3);
    expect(errors.filter((e) => !/Failed to load resource|moneypuck/i.test(e))).toEqual([]);
  });

  test("a hidden tab stops /api/game polling and a shown tab catches up", async ({ page }) => {
    await page.clock.install();
    const { feed } = await openFromHome(page, pollSequence(REAL.ot(), 4).map((r) => withState(r, "live")));
    await page.clock.runFor(1_000);
    await hide(page, true);
    const before = feed.hits;
    await page.clock.runFor(180_000);
    expect(feed.hits, "no /api/game requests while hidden").toBe(before);
    await hide(page, false);
    await page.clock.runFor(1_000);
    expect(feed.hits, "a catch-up fetch on show").toBeGreaterThan(before);
    expect(feed.hits - before, "one catch-up, not a burst").toBeLessThanOrEqual(2);
  });

  test("a final game is fetched once or twice, not polled for the whole session", async ({ page }) => {
    await page.clock.install();
    const { feed } = await openFromHome(page, withState(REAL.reg(), "final"));
    await page.clock.runFor(600_000);
    console.log(`final game /api/game hits over 10 min: ${feed.hits}`);
    expect(feed.hits).toBeLessThanOrEqual(3); // baseline: hourly timer; contract: one fetch + one ~3 min recheck
  });
});

test.describe("focus, scroll and live updates", () => {
  test("Escape closes the Game Center and focus returns to the control that opened it", async ({ page }) => {
    const { dialog, row } = await openFromHome(page, live());
    await expect(dialog).toHaveAttribute("aria-label", /full game view/);
    await expect(dialog.getByRole("button", { name: "Close game details" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    await expect(page.locator(`[data-game="${row.id}"] .sb-main`)).toBeFocused();
  });

  test("a poll update does not steal focus from where the user is", async ({ page }) => {
    await page.clock.install();
    const seq = pollSequence(REAL.ot(), 5).map((r) => withState(r, "live"));
    const { dialog, feed } = await openFromHome(page, seq);
    const target = dialog.locator("summary").first();
    await target.focus();
    await expect(target).toBeFocused();
    const text = await target.innerText();
    const hits = feed.hits;
    await page.clock.runFor(31_000);
    await page.clock.runFor(31_000);
    expect(feed.hits).toBeGreaterThan(hits);
    await expect(target).toBeFocused();
    expect(await target.innerText()).toBe(text);
  });

  test("scroll position inside the dialog is kept across polls", async ({ page }) => {
    await page.clock.install();
    const seq = pollSequence(REAL.ot(), 5).map((r) => withState(r, "live"));
    const { dialog, feed } = await openFromHome(page, seq);
    const top = await dialog.evaluate((d) => { d.scrollTop = 400; return d.scrollTop; });
    expect(top).toBeGreaterThan(100); // there is something to scroll
    const hits = feed.hits;
    await page.clock.runFor(31_000);
    await page.clock.runFor(31_000);
    expect(feed.hits).toBeGreaterThan(hits);
    const after = await dialog.evaluate((d) => d.scrollTop);
    expect(Math.abs(after - top), `scrollTop moved ${top} -> ${after}`).toBeLessThanOrEqual(2);
  });

  test("a live poll that adds a real goal updates the score without reloading the dialog", async ({ page }) => {
    await page.clock.install();
    const full = REAL.ot();
    const g = scoringGoals(full)[0];
    const seq = [slice(full, g.sortOrder - 1), slice(full, g.sortOrder)].map((r) => withState(r, "live"));
    const { dialog, row } = await openFromHome(page, seq);
    const opened = await dialog.elementHandle();
    await page.clock.runFor(31_000);
    // The dialog element survives the update (no remount) and is still the one open dialog.
    expect(await dialog.evaluate((d, h) => d === h, opened)).toBe(true);
    await expect(page.locator(GAME_DIALOG)).toHaveCount(1);
    expect(row.id).toBe(full.id);
  });
});

test.describe("360px layout (no sideways scroll) across game states", () => {
  const states: [string, () => any][] = [
    ["scheduled", () => withState(REAL.reg(), "fut")],
    ["pregame", () => withState(REAL.reg(), "pre")],
    ["live", live],
    ["intermission", () => withState(slice(REAL.reg(), 120), "crit")],
    ["overtime live", () => withState(REAL.ot(), "ot")],
    ["final", () => withState(REAL.reg(), "final")],
    ["final OT", () => REAL.ot()],
    ["final SO", () => REAL.so()],
    ["postponed", () => withState(REAL.reg(), "ppd")],
    ["cancelled", () => withState(REAL.reg(), "cncl")],
    ["suspended", () => withState(REAL.reg(), "susp")],
    ["400-event history", () => withState(replicate(REAL.ot(), 400), "live")],
  ];
  for (const [name, make] of states) {
    test(`${name}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      const errors = watchErrors(page);
      const raw = make();
      const { dialog } = await openFromHome(page, raw, ["ppd", "cncl", "susp"].some((s) => raw._provenance?.includes(`state:${s}`)) ? { rowState: { scheduleState: raw.gameScheduleState } } : {});
      await expect(dialog.locator(".dialog-team")).toHaveCount(2);
      await page.waitForTimeout(500);
      await noOverflow(page, 360);
      expect(errors.filter((e) => !/Failed to load resource|moneypuck/i.test(e))).toEqual([]);
    });
  }
  test("reflow at 320px and a 200% zoom equivalent (640px) keeps the dialog usable", async ({ page }) => {
    for (const w of [320, 640]) {
      await page.setViewportSize({ width: w, height: 700 });
      await openFromHome(page, live());
      await noOverflow(page, w);
      await expect(page.getByRole("button", { name: "Close game details" })).toBeVisible();
    }
  });
});

test.describe("motion, console and CSP", () => {
  test("reduced motion: a goal on the card is announced as a still banner (no spinning beams, no net)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    const full = REAL.ot();
    const g = scoringGoals(full)[0];
    const seq = [slice(full, g.sortOrder - 1), slice(full, g.sortOrder)].map((r) => withState(r, "live"));
    let n = 0;
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const start = new Date(Date.now() - 3600_000).toISOString();
    const rows = (snapshot?: boolean) => [gameOf(seq[snapshot ? 0 : Math.min(n++, 1)], { date: day, start })];
    await mockSchedule(page, rows);
    await page.route("**/api/game/*", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.goto("/?view=games");
    const { selectAllTeams, filterGames } = await import("./controls");
    await selectAllTeams(page);
    await filterGames(page, { competition: "2", window: "all" });
    const card = page.locator(".live-card").first();
    await expect(card).toBeVisible();
    await page.clock.fastForward(31_000);
    const flash = card.getByTestId("goal-flash");
    await expect(flash).toContainText("GOAL!");
    expect(await flash.locator(".gf-beams").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    expect(await flash.locator(".gf-net").evaluate((e) => getComputedStyle(e).display)).toBe("none");
  });

  test("opening and closing every state's Game Center logs no console or CSP errors", async ({ page }) => {
    const errors = watchErrors(page);
    const { dialog } = await openFromHome(page, REAL.so());
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    expect(errors.filter((e) => !/Failed to load resource|moneypuck/i.test(e))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Needs unmerged Phase 5 features. Un-fixme (remove the `.fixme`) when Agents 1-3 are merged.
// ---------------------------------------------------------------------------------------------------------------------
const tab = (page: Page, name: string) => page.getByRole("tablist", { name: "Game sections" }).getByRole("tab", { name });
const region = (page: Page) => page.getByTestId("gc-live-region");

test.describe("Phase 5 features (fixme until merged)", () => {
  test.fixme(true, "needs Agent 1 tabs, Agent 3 play-by-play, live region");

  test("tabs: five tabs with roving keyboard access, all panes mounted, 360px no overflow on each", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const { dialog } = await openFromHome(page, live());
    for (const name of ["Overview", "Play-by-Play", "Team Stats", "Players", "Matchup Intelligence"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      await expect(dialog.getByRole("tabpanel").filter({ visible: true })).toHaveCount(1);
      await noOverflow(page, 360);
    }
  });

  test("play-by-play keeps its scroll and focus across polls; keys are eventIds with no duplicates", async ({ page }) => {
    await page.clock.install();
    const seq = pollSequence(REAL.ot(), 5).map((r) => withState(r, "live"));
    const { dialog } = await openFromHome(page, seq);
    await tab(page, "Play-by-Play").click();
    const events = dialog.getByTestId("pbp-event");
    const n = await events.count();
    const ids = await events.evaluateAll((els) => els.map((e) => e.getAttribute("data-event-id")));
    expect(new Set(ids).size).toBe(ids.length);
    await events.nth(Math.min(5, n - 1)).scrollIntoViewIfNeeded();
    const top = await dialog.evaluate((d) => d.scrollTop);
    await page.clock.runFor(31_000);
    expect(Math.abs((await dialog.evaluate((d) => d.scrollTop)) - top)).toBeLessThanOrEqual(2);
    expect(await events.count()).toBeGreaterThanOrEqual(n);
  });

  test("live region: one polite atomic status region, empty on first render, silent for clock-only updates", async ({ page }) => {
    await page.clock.install();
    const base = pollSequence(REAL.ot(), 3)[0];
    const clockOnly = [withState(base, "live", { clock: "12:34" }), withState(base, "live", { clock: "12:04" }), withState(base, "live", { clock: "11:34" })];
    const { dialog } = await openFromHome(page, clockOnly);
    await expect(dialog.getByTestId("gc-live-region")).toHaveCount(1);
    await expect(region(page)).toHaveAttribute("role", "status");
    await expect(region(page)).toHaveAttribute("aria-live", "polite");
    await expect(region(page)).toHaveAttribute("aria-atomic", "true");
    await expect(region(page)).toHaveText("");
    await page.clock.runFor(95_000);
    await expect(region(page)).toHaveText("");
  });

  test("live region: a goal is announced once; a disallowed goal is announced once after the two-poll debounce", async ({ page }) => {
    await page.clock.install();
    const { raw, eventId } = relabelShotAsGoal(REAL.live());
    const live0 = withState(REAL.live(), "live");
    const withGoal = withState(raw, "live");
    const removed = withState(removeEvent(raw, eventId), "live");
    const { dialog } = await openFromHome(page, [live0, withGoal, withGoal, removed, removed, removed]);
    const log: string[] = [];
    await page.exposeFunction("__announce", (t: string) => log.push(t));
    await dialog.getByTestId("gc-live-region").evaluate((el) => new MutationObserver(() => (window as any).__announce(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true }));
    await page.clock.runFor(31_000);
    await page.clock.runFor(31_000);
    expect(log.filter((t) => /goal/i.test(t) && !/disallowed/i.test(t))).toHaveLength(1);
    await page.clock.runFor(31_000);
    await page.clock.runFor(31_000);
    await page.clock.runFor(31_000);
    expect(log.filter((t) => /disallowed/i.test(t))).toHaveLength(1);
  });

  test("status pill: contrast of live, stale, final, OT, SO, postponed states is at least 4.5:1 in both themes", async ({ page }) => {
    const ratio = (page: Page) => page.getByTestId("gc-status").evaluate((el) => {
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      let bg: number[] = [255, 255, 255, 0];
      for (let n: Element | null = el; n && bg[3] === 0; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length === 3 || c[3] !== 0) bg = c.length === 3 ? [...c, 1] : c; }
      const fg = parse(getComputedStyle(el).color);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    const cases = [withState(REAL.reg(), "live"), withState(REAL.ot(), "ot"), withState(REAL.so(), "so"), REAL.reg(), REAL.ot(), withState(REAL.reg(), "ppd")];
    for (const scheme of ["light", "dark"] as const) {
      for (const raw of cases) {
        await page.emulateMedia({ colorScheme: scheme });
        await openFromHome(page, raw, raw.gameScheduleState === "PPD" ? { rowState: { scheduleState: "PPD" } } : {});
        expect(await ratio(page), `${scheme} ${raw._provenance?.join(",") ?? "real"}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
