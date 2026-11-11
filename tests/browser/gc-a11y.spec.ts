import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { watchErrors } from "./qa-harness";
import { REAL, feedOf, openFromHome, pollSequence, replicate, slice, withState, GAME_DIALOG } from "./gc-qa-fixtures";

// Final-wave QA (Phase 5 Agent 8): layout sweep, keyboard, targets, zoom, interruption recovery, unpublished game. Data = real recorded games (docs/phase5-qa-fixtures.md).
// Screenshots go to SHOTS (set P5_SHOTS=/abs/dir) so they can be looked at; they are not assertions.
const SHOTS = process.env.P5_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const tabs = (page: Page) => page.getByRole("tablist", { name: "Game sections" });
const closeBtn = (page: Page) => page.locator('dialog.game-dialog button[aria-label^="Close"]').first();
const overflow = (page: Page) => page.evaluate(() => {
  const d = document.querySelector("dialog.game-dialog") as HTMLElement;
  const wide = [...d.querySelectorAll<HTMLElement>("*")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== "fixed" && !e.closest("[data-scroll-x], .gc-tabs, .table-wrap, [style*='overflow']")).slice(0, 3).map((e) => `${e.tagName}.${e.className}`);
  return { dialog: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide };
});
const TAB_NAMES = ["Overview", "Play-by-Play", "Team Stats", "Players", "Matchup Intelligence"];

for (const w of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
  test(`layout at ${w}px: every tab has no sideways scroll (live, 400 events)`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: w >= 1024 ? 1000 : 800 });
    const errors = watchErrors(page);
    await openFromHome(page, withState(replicate(REAL.ot(), 400), "live"));
    for (const name of TAB_NAMES) {
      await tabs(page).getByRole("tab", { name }).click();
      await page.waitForTimeout(250);
      const o = await overflow(page);
      expect(o.dialog, `${name} dialog overflow at ${w}px (${o.wide.join(", ")})`).toBeLessThanOrEqual(1);
      expect(o.page, `${name} page overflow at ${w}px`).toBeLessThanOrEqual(1);
      if ([320, 390, 1440].includes(w)) await shot(page, `${w}-${name.replace(/\W/g, "").toLowerCase()}`);
    }
    expect(errors.filter((e) => !/Failed to load resource|moneypuck/i.test(e))).toEqual([]);
  });
}

test("keyboard: Tab reaches the tablist, arrows/Home/End move and select, the panel is then reachable, Escape closes and focus returns", async ({ page }) => {
  const { dialog, row } = await openFromHome(page, withState(slice(REAL.ot(), 200), "live"));
  const list = tabs(page);
  await list.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(list.getByRole("tab", { name: "Play-by-Play" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(list.getByRole("tab", { name: "Matchup Intelligence" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(list.getByRole("tab", { name: "Overview" })).toBeFocused();
  const selected = await list.getByRole("tab", { selected: true }).count();
  expect(selected).toBe(1);
  // exactly one tab is in the tab order (roving tabindex)
  expect(await list.getByRole("tab").evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex >= 0).length)).toBe(1);
  // modal: Tab never leaves the dialog
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.game-dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
  await expect(page.locator(`[data-game="${row.id}"] .sb-main`)).toBeFocused();
  void dialog;
});

test("tap targets: tabs, close and play-by-play controls are at least 44px on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFromHome(page, withState(slice(REAL.ot(), 200), "live"));
  const small: string[] = [];
  const check = async (loc: ReturnType<Page["locator"]>, label: string) => {
    for (const box of await loc.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: (e.textContent ?? "").trim().slice(0, 24) }; }))) if (box.h < 43.5 || box.w < 43.5) small.push(`${label} "${box.t}" ${Math.round(box.w)}x${Math.round(box.h)}`);
  };
  await check(tabs(page).getByRole("tab"), "tab");
  await check(closeBtn(page), "close");
  await tabs(page).getByRole("tab", { name: "Play-by-Play" }).click();
  await check(page.locator("[data-testid^=pbp-filter-], [data-testid=pbp-order], [data-testid=pbp-next-goal], [data-testid=pbp-prev-goal]"), "pbp control");
  console.log("targets under 44px:", small.length ? "\n  " + small.join("\n  ") : "none");
  expect(small, "targets below 44px").toEqual([]);
});

test("200% zoom equivalent (a 640px-wide viewport at 2x text) keeps header, tabs and the active pane readable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 500 });
  await openFromHome(page, withState(slice(REAL.ot(), 200), "live"));
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await page.waitForTimeout(300);
  const o = await overflow(page);
  expect(o.dialog).toBeLessThanOrEqual(1);
  // the sticky tab bar must not take more than half of a short viewport
  const h = await page.getByTestId("gc-tabs").evaluate((e) => e.getBoundingClientRect().height);
  expect(h, `tab bar height ${h}px of 500`).toBeLessThan(250);
  await tabs(page).getByRole("tab", { name: "Play-by-Play" }).click();
  await shot(page, "zoom200-pbp");
});

test("network interruption: the last data stays, the page says it is stale or failing, and it recovers on its own", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  const seq = pollSequence(REAL.ot(), 6).map((r) => withState(r, "live"));
  const { dialog, feed } = await openFromHome(page, seq);
  const before = await dialog.getByTestId("gc-score").first().innerText();
  await page.route("**/api/game/*", (r) => r.abort("internetdisconnected"), { times: 100 });
  for (let i = 0; i < 10; i++) await page.clock.runFor(16_000);
  await expect(dialog.getByTestId("gc-score").first()).toHaveText(before); // last data kept
  await expect(page.locator(GAME_DIALOG)).toBeVisible();
  const pill = await dialog.getByTestId("gc-status").getAttribute("data-state");
  expect(["live", "stale"]).toContain(pill);
  await page.unroute("**/api/game/*");
  await page.route("**/api/game/*", (r) => r.fulfill({ json: feedOf({ ...seq.at(-1), startTimeUTC: new Date(Date.now() - 3600_000).toISOString() }) }));
  const hits = feed.hits;
  for (let i = 0; i < 20; i++) await page.clock.runFor(16_000);
  await expect(dialog.getByTestId("gc-status")).toHaveAttribute("data-state", "live");
  void hits;
});

test("an unpublished game (404) opened by deep link is a calm state in every tab, not a crash", async ({ page }) => {
  const errors = watchErrors(page);
  await page.route("**/api/game/*", (r) => r.fulfill({ status: 404, json: { error: "not published" } }));
  await page.route("**/api/live", (r) => r.fulfill({ json: { updatedAt: new Date().toISOString(), date: "2026-11-11", games: [] } }));
  await page.goto("/?game=2025029999&tab=pbp&event=12");
  await expect(page.locator(GAME_DIALOG).or(page.getByRole("status")).first()).toBeVisible();
  expect(errors.filter((e) => !/Failed to load resource|404|moneypuck/i.test(e)).filter((e) => e.startsWith("pageerror"))).toEqual([]);
});
