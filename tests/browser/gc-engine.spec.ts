import { expect, test, type Page } from "@playwright/test";
import { mockApis } from "./fixtures-games";
import { GC_ID, GC_NOW, at, step, goal, without, row, installGameFeed, installVisibility, setHidden } from "./gc-fixtures";

// Live-data engine (Phase 5 Agent 2): polling cadence by phase, failures/backoff/recovery, one request stream for many panes,
// hidden-tab pause. Bodies are slices of the REAL recorded game with envelope-only state changes (see gc-fixtures.ts).
// The Game Center header status (`gc-status`) belongs to the layout agent; assertions on it run only when it exists.

// A live game is a row, a finished one a compact card: both carry data-game and an "Open the full game view" button.
const rowEl = (page: Page) => page.locator(`[data-game="${GC_ID}"]`).first();
const openGame = (page: Page) => page.locator(`[data-game="${GC_ID}"]`).first().getByRole("button", { name: /Open the full game view/ }).first().click();
const gcStatus = async (page: Page) => (await page.getByTestId("gc-status").count()) ? page.getByTestId("gc-status") : null;

async function setup(page: Page, kind: Parameters<typeof row>[0] = "live", body = step("live", { cut: at(0.5) })) {
  await page.clock.install({ time: GC_NOW });
  const r = row(kind);
  const api = await mockApis(page, { games: [r], live: [r] });
  const feed = await installGameFeed(page, GC_ID, body);
  return { api, feed, r };
}
/** Run the page clock in 1 s steps so timers that are scheduled by earlier timers fire. */
const run = async (page: Page, ms: number) => { for (let left = ms; left > 0; left -= 1000) await page.clock.runFor(Math.min(1000, left)); };

test("poll sequence scheduled -> live -> intermission -> OT -> final/OT shows the right status at each step", async ({ page }) => {
  const { api, feed } = await setup(page, "scheduled", step("scheduled", { cut: 0 }));
  await page.goto("/");
  await expect(rowEl(page)).toBeVisible();
  const sequence: [Parameters<typeof row>[0], ReturnType<typeof step>, RegExp][] = [
    ["live", step("live", { cut: at(0.4) }), /P2 · 12:31/],
    ["intermission", step("intermission", { cut: at(0.7) }), /Intermission/],
    ["ot", step("ot", { cut: at(1) }), /OT · 03:10/],
    ["final-ot", step("final-ot", { cut: at(1) }), /Final\/OT|F\/OT/],
  ];
  for (const [kind, body, text] of sequence) {
    api.setLive([row(kind)]);
    feed.serve(body);
    await run(page, 31_000);
    await expect(rowEl(page)).toContainText(text);
  }
  expect(feed.urls.every((u) => !u.includes("score="))).toBe(true);
});

test("a live game is fetched on one URL at the live cadence; the card and an open Game Center share the stream", async ({ page }) => {
  const { feed } = await setup(page);
  await page.goto("/");
  await expect(rowEl(page)).toBeVisible();
  await openGame(page);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await run(page, 2000);
  feed.mark();
  await run(page, 30_000);
  // 15-30 s cadence depending on whether an active subscriber is mounted, never one stream per pane (card + recap + gauge + data + analytics)
  expect(feed.since(), "requests in a 30 s window").toBeLessThanOrEqual(2);
  expect(new Set(feed.urls).size, "one URL for the game").toBe(1);
  feed.mark();
  await run(page, 60_000);
  expect(feed.since(), "requests in 60 s").toBeLessThanOrEqual(4);
});

test("failures keep the page, back off with jitter and recover; stale shows only when a status element exists", async ({ page }) => {
  const { feed } = await setup(page);
  await page.goto("/");
  await openGame(page);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await run(page, 2000);
  expect(feed.hits()).toBeGreaterThanOrEqual(1);
  feed.fail(503);
  feed.mark();
  await run(page, 120_000);
  const failed = feed.since();
  // backoff 5, 10, 20, 40, 60 s (jittered 0.5-1.0x) after the first scheduled poll: far fewer than a request every 15 s
  expect(failed, "requests in 2 minutes of failure").toBeLessThanOrEqual(9);
  expect(failed).toBeGreaterThanOrEqual(3);
  await expect(page.locator("dialog.game-dialog")).toBeVisible(); // the last data stays
  const status = await gcStatus(page);
  if (status) await expect(status).toHaveAttribute("data-state", /stale/);
  feed.fail(false);
  feed.mark();
  await run(page, 70_000);
  expect(feed.since(), "recovers: requests resume").toBeGreaterThanOrEqual(1);
  if (status) await expect(status).not.toHaveAttribute("data-state", /stale/);
});

test("final game: one fetch and one recheck about 3 minutes later, then silence", async ({ page }) => {
  const { feed } = await setup(page, "final-ot", step("final-ot"));
  await page.goto("/");
  await openGame(page);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await run(page, 5000);
  const first = feed.hits();
  expect(first).toBeGreaterThanOrEqual(1);
  await run(page, 10 * 60_000);
  const total = feed.hits();
  expect(total - first, "one recheck, nothing more").toBeLessThanOrEqual(2);
  await run(page, 10 * 60_000);
  expect(feed.hits()).toBe(total);
});

test("a disallowed goal disappears from the feed: the page does not break and polling continues", async ({ page }) => {
  const withGoal = goal(at(0.5), { id: 9001, team: "home", scores: { home: 1, away: 0 } });
  const { feed } = await setup(page, "live", step("live", { base: withGoal, score: { home: 1, away: 0 } }));
  await page.goto("/");
  await openGame(page);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await run(page, 20_000);
  feed.serve(step("live", { base: without(withGoal, 9001), score: { home: 0, away: 0 } }));
  await run(page, 80_000);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  expect(feed.hits()).toBeGreaterThanOrEqual(4);
});

test("hidden tab: no game requests while hidden, a single catch-up on show", async ({ page }) => {
  await installVisibility(page);
  const { feed } = await setup(page);
  await page.goto("/");
  await openGame(page);
  await expect(page.locator("dialog.game-dialog")).toBeVisible();
  await run(page, 3000);
  expect(feed.hits()).toBeGreaterThanOrEqual(1);
  await setHidden(page, true);
  await run(page, 1000);
  feed.mark();
  await run(page, 5 * 60_000);
  expect(feed.since(), "requests while hidden").toBe(0);
  await setHidden(page, false);
  await run(page, 2000);
  await expect.poll(() => feed.since(), { message: "one catch-up on show", timeout: 5000 }).toBe(1);
});

test("two tabs of one browser watching the same game make one request stream", async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  const feeds = [];
  for (const p of [a, b]) {
    const { feed } = await setup(p);
    feeds.push(feed);
    await p.goto("/");
    await openGame(p);
    await expect(p.locator("dialog.game-dialog")).toBeVisible();
  }
  // Both clocks advance together in small steps with real time for the BroadcastChannel in between.
  const tick = async (n: number) => { for (let i = 0; i < n; i++) { await Promise.all([a.clock.runFor(1000), b.clock.runFor(1000)]); await a.waitForTimeout(10); } };
  await tick(8); // the election settles (a tab that has not heard its peer yet may fetch once)
  feeds.forEach((f) => f.mark());
  const t0 = await a.evaluate(() => Date.now());
  await tick(95);
  const elapsed = ((await a.evaluate(() => Date.now())) - t0) / 1000; // the page clock also runs in real time, so fake seconds elapsed > 95: measure them
  const [x, y] = [feeds[0].since(), feeds[1].since()];
  // One stream: the follower makes no request and the leader polls at the 15 s live cadence (not twice that, which two independent pollers would give).
  expect(Math.min(x, y), `the follower makes no requests (${x} + ${y})`).toBe(0);
  const expected = elapsed / 15;
  expect(x + y, `${x + y} requests in ${elapsed.toFixed(0)} s`).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
  expect(x + y, `${x + y} requests in ${elapsed.toFixed(0)} s`).toBeLessThanOrEqual(Math.ceil(expected) + 1);
});
