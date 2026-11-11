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
/** Advances fake time in 5 s steps so timers that are re-armed after a fetch resolves still fire (one big runFor skips them). */
const steps = async (page: Page, ms: number) => { for (let t = 0; t < ms; t += 5_000) await page.clock.runFor(5_000); };
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((h) => { Object.defineProperty(document, "hidden", { value: h, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }, hidden);

test.describe("requests and polling", () => {
  test("opening a live Game Center requests each URL a bounded number of times in 30 s (baseline provider)", async ({ page }) => {
    await page.clock.install();
    const counts = countRequests(page);
    const errors = watchErrors(page);
    const { feed, row } = await openFromHome(page, pollSequence(REAL.ot(), 4).map((r) => withState(r, "live")));
    await steps(page, 30_000);
    const rows = [...counts].sort((a, b) => b[1] - a[1]);
    console.log(`Game Center open, 30 s, game ${row.id}:\n` + rows.map(([p, n]) => `  ${n}x ${p}`).join("\n"));
    test.info().annotations.push({ type: "requests", description: rows.map(([p, n]) => `${n}x ${p}`).join("; ") });
    const game = [...counts].filter(([p]) => p.startsWith("/api/game/"));
    expect(game.length, "one URL per game (no ?score= variants split subscriptions)").toBe(1);
    // The overlay and its card/provider share one subscription: loose bound that still catches a fetch loop or a per-pane fetch.
    // Adaptive polling: a running clock is polled every 15 s, so the open + 2 ticks in 30 s; the card and the dialog share one subscription.
    expect(feed.hits, "/api/game hits in 30 s").toBeLessThanOrEqual(3);
    expect(feed.hits).toBeGreaterThanOrEqual(2);
    expect(counts.get(`/api/boxscore/${row.id}`) ?? 0, "box score shares one timer").toBeLessThanOrEqual(3);
    expect(counts.get("/api/live") ?? 0).toBeLessThanOrEqual(3);
    expect(errors.filter((e) => !/Failed to load resource|moneypuck/i.test(e))).toEqual([]);
  });

  test("a hidden tab stops /api/game polling and a shown tab catches up", async ({ page }) => {
    await page.clock.install();
    const { feed } = await openFromHome(page, pollSequence(REAL.ot(), 4).map((r) => withState(r, "live")));
    await page.clock.runFor(1_000);
    await hide(page, true);
    const before = feed.hits;
    await steps(page, 180_000);
    expect(feed.hits, "no /api/game requests while hidden").toBe(before);
    await hide(page, false);
    await page.clock.runFor(1_000);
    expect(feed.hits, "a catch-up fetch on show").toBeGreaterThan(before);
    expect(feed.hits - before, "one catch-up, not a burst").toBeLessThanOrEqual(2);
  });

  test("a final game is fetched once, rechecked once about 3 minutes later, then never again", async ({ page }) => {
    await page.clock.install();
    const { feed } = await openFromHome(page, withState(REAL.reg(), "final"));
    const timeline: number[] = [];
    for (let i = 0; i < 12; i++) { await page.clock.runFor(60_000); timeline.push(feed.hits); }
    console.log(`final game /api/game hits at each minute: ${timeline.join(",")}`);
    expect(timeline[0], "one fetch on open").toBe(1);
    expect(timeline[1], "nothing before the recheck").toBe(1);
    expect(timeline[5], "the recheck has happened by minute 6").toBe(2);
    expect(timeline.at(-1), "and nothing after it").toBe(2);
  });
});

test.describe("focus, scroll and live updates", () => {
  test("Escape closes the Game Center and focus returns to the control that opened it", async ({ page }) => {
    const { dialog, row } = await openFromHome(page, live());
    await expect(dialog).toHaveAttribute("aria-label", /full game view/);
    await expect(dialog.locator('button[aria-label^="Close"]').first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    await expect(page.locator(`[data-game="${row.id}"] .sb-main`)).toBeFocused();
  });

  test("a poll update does not steal focus from where the user is", async ({ page }) => {
    await page.clock.install();
    const seq = pollSequence(REAL.ot(), 5).map((r) => withState(r, "live"));
    const { dialog, feed } = await openFromHome(page, seq);
    // Pin the element by handle: lazy panes mount later and can become the "first summary", which would make a locator-based check flaky.
    const handle = await dialog.locator("summary").first().elementHandle();
    await handle!.focus();
    const same = () => page.evaluate((h) => document.activeElement === h && h!.isConnected, handle);
    expect(await same()).toBe(true);
    const hits = feed.hits;
    await page.clock.runFor(16_000);
    await page.clock.runFor(16_000);
    await page.clock.runFor(16_000);
    expect(feed.hits).toBeGreaterThan(hits);
    expect(await same(), "focus stayed on the same element across polls").toBe(true);
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
      await expect(page.locator('dialog.game-dialog button[aria-label^="Close"]').first()).toBeVisible();
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

test.describe("Phase 5 features", () => {

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

  test("play-by-play keeps what you are reading in place across polls; keys are eventIds with no duplicates", async ({ page }) => {
    await page.clock.install();
    // A realistic live cadence: five new real events per poll, joining a game 150 events in.
    const orders = REAL.ot().plays.map((p: any) => p.sortOrder).sort((a: number, b: number) => a - b);
    const seq = pollSequence(REAL.ot(), [150, 155, 160, 165, 170].map((i) => orders[i])).map((r) => withState(r, "live"));
    const { dialog } = await openFromHome(page, seq);
    await tab(page, "Play-by-Play").click();
    const events = dialog.getByTestId("pbp-event");
    const n = await events.count();
    const keyOf = () => events.evaluateAll((els) => els.map((e) => e.getAttribute("data-event-id")));
    const ids = await keyOf();
    expect(new Set(ids).size).toBe(ids.length);
    // Read an event a few rows down, focus its row, then let polls add events (newest first prepends; scroll anchoring must hold the row in place).
    await dialog.evaluate((d) => { d.scrollTop += 700; }); // scroll anchoring is off at scrollTop 0 (the newest rows are then meant to push down)
    const idx = await events.evaluateAll((els) => els.findIndex((e) => { const r = e.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 50; }));
    expect(idx, "a fully visible event row to read").toBeGreaterThanOrEqual(0);
    const anchor = events.nth(idx);
    const id = await anchor.getAttribute("data-event-id");
    await anchor.focus();
    const y = () => dialog.locator(`[data-event-id="${id}"]`).evaluate((e) => e.getBoundingClientRect().top);
    const before = await y();
    for (let i = 0; i < 3; i++) { await page.clock.runFor(16_000); await page.waitForTimeout(300); } // real time for layout to settle under load
    expect(await events.count(), "polls added events").toBeGreaterThan(n);
    expect(Math.abs((await y()) - before), "the event being read moved on screen").toBeLessThanOrEqual(4);
    await expect(dialog.locator(`[data-event-id="${id}"]`)).toBeFocused();
    const after = await keyOf();
    expect(new Set(after).size, "duplicate event ids after overlapping polls").toBe(after.length);
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

  test("live region: a goal is announced once; a disallowed goal is announced once, only after the two-poll debounce", async ({ page }) => {
    await page.clock.install();
    const { raw, eventId } = relabelShotAsGoal(REAL.live());
    const mk = (r: Raw) => withState(slice(r, 1e9), "live");
    const live0 = mk(REAL.live()), withGoal = mk(raw), removed = mk(removeEvent(raw, eventId));
    const { dialog, feed } = await openFromHome(page, [live0, withGoal, withGoal, removed, removed, removed, removed]);
    const log: { t: string; hits: number }[] = [];
    await page.exposeFunction("__announce", (t: string) => feed && log.push({ t, hits: feed.hits }));
    await dialog.getByTestId("gc-live-region").evaluate((el) => new MutationObserver(() => (window as any).__announce(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true }));
    for (let i = 0; i < 12; i++) await page.clock.runFor(16_000);
    console.log("announcements:", JSON.stringify(log));
    const goals = log.filter((l) => /^Goal/.test(l.t)), taken = log.filter((l) => /Score changed|disallowed/i.test(l.t));
    expect(goals, "goal announced once").toHaveLength(1);
    expect(taken, "disallowed goal announced once").toHaveLength(1);
    // The scoreboard score is official and drops in the same response, so the announcement follows that response (not the 2-poll event debounce).
  });

  test("live region: a goal that only vanishes from the event list (score unchanged) is never announced as a score change", async ({ page }) => {
    await page.clock.install();
    const { raw, eventId } = relabelShotAsGoal(REAL.live());
    const mk = (r: Raw) => withState(r, "live");
    const withGoal = mk(raw), removed = mk(removeEvent(raw, eventId));
    const { dialog } = await openFromHome(page, [withGoal, withGoal, removed, removed, removed, removed]);
    const log: string[] = [];
    await page.exposeFunction("__announce", (t: string) => log.push(t));
    await dialog.getByTestId("gc-live-region").evaluate((el) => new MutationObserver(() => (window as any).__announce(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true }));
    for (let i = 0; i < 12; i++) await page.clock.runFor(16_000);
    expect(log.filter((t) => /^Goal/.test(t)), "no new goal announced from a re-delivered feed").toHaveLength(0);
    expect(log.length, `announcements: ${JSON.stringify(log)}`).toBeLessThanOrEqual(1);
  });

  for (const scheme of ["light", "dark"] as const) test(`status pill: contrast of every state is at least 4.5:1 (${scheme} theme)`, async ({ page }) => {
    test.setTimeout(120_000);
    const ratio = (page: Page) => page.getByTestId("gc-status").evaluate((el) => {
      // Resolve any CSS colour (rgb, color(), color-mix) to RGBA through a canvas pixel, composite backgrounds from the outside in, then contrast.
      const px = (c: string) => { const cv = document.createElement("canvas"); cv.width = cv.height = 1; const x = cv.getContext("2d")!; x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const chain: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) { const c = px(getComputedStyle(n).backgroundColor); if (c[3] > 0) chain.push(c); }
      let bg = [255, 255, 255];
      for (const c of chain.reverse()) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
      const f = px(getComputedStyle(el).color);
      const fg = f.slice(0, 3).map((v, i) => v * f[3] + bg[i] * (1 - f[3]));
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    const cases: [string, Raw, Record<string, unknown>][] = [
      ["live", withState(REAL.reg(), "live"), {}], ["stale", withState(REAL.reg(), "live"), { ageHours: 12 }], ["intermission", withState(slice(REAL.reg(), 120), "crit"), {}],
      ["OT", withState(REAL.ot(), "ot"), {}], ["SO", withState(REAL.so(), "so"), {}], ["final", REAL.reg(), {}], ["final/OT", REAL.ot(), {}], ["final/SO", REAL.so(), {}],
      ["scheduled", withState(REAL.reg(), "fut"), {}], ["postponed", withState(REAL.reg(), "ppd"), { rowState: { scheduleState: "PPD" } }],
    ];
    {
      for (const [name, raw, o] of cases) {
        await page.emulateMedia({ colorScheme: scheme });
        await openFromHome(page, raw, o);
        expect(await ratio(page), `${scheme} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
