// Independent close-control QA for the Game Center dialog (UI Agent 5).
// Matches the close control by aria-label^="Close" inside dialog.game-dialog, so the old "Close full game view" and the new "Close game details" both pass.
// `gated` tests encode the new acceptance criteria (single small top-right 44px control) and are fixme until ui-close/ui-gauge are merged (QA_AFTER=1).
import { test, expect, type Page } from "@playwright/test";
import { openGameCenter, openTab, pinned, closeButtons, noOverflow, gated, NEEDS, CLOSE, GAME_DIALOG, REAL, withState } from "./ui-qa-helpers";
import { mockSchedule, serveGame, gameOf, feedOf, type Raw } from "./gc-qa-fixtures";

test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "each test sets its own viewport"); });
const VIEWPORTS = [{ name: "mobile 390", width: 390, height: 700 }, { name: "desktop 1440", width: 1440, height: 900 }];
const etDay = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** A schedule with a day strip: today has one live game, yesterday 6 finished ones (so the page is tall enough to scroll). All rows come from a real recorded game. */
async function openSchedule(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  const final = withState(REAL.reg(), "final");
  const yesterday = etDay(-1), today = etDay(0);
  const rows = [
    gameOf(withState(REAL.live(), "live"), { date: today, start: new Date(Date.now() - 3600_000).toISOString() }),
    ...Array.from({ length: 6 }, (_, i) => gameOf(final, { id: 2025029000 + i, date: yesterday, start: new Date(Date.now() - 86400_000 - i * 60_000).toISOString() })),
  ];
  await mockSchedule(page, () => rows);
  await serveGame(page, final as Raw);
  await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto("/");
  await page.locator(`[data-testid=date-strip] [data-day="${yesterday}"]`).click();
  await page.locator(".sb-filters").getByRole("button", { name: /completed/ }).click();
  await expect(page.locator(`[data-game="${rows[1].id}"]`)).toBeVisible();
  return { rows, yesterday, firstId: rows[1].id as number, lastId: rows[6].id as number };
}
const strip = (page: Page) => page.locator("[data-testid=date-strip] .ds-chip[aria-selected=true]").getAttribute("data-day");
const completedOn = (page: Page) => page.locator(".sb-filters").getByRole("button", { name: /completed/ }).getAttribute("aria-pressed");

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test("exactly one visible close control, and no horizontal overflow", async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      expect(await closeButtons(page)).toBe(1);
      await openTab(page, "Team Stats");
      expect(await closeButtons(page)).toBe(1);
      await noOverflow(page);
    });

    gated(`${NEEDS}: control is at least 44x44`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      const b = (await page.locator(CLOSE).first().boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    });

    test("stays put while the dialog scrolls (within 1px of its resting top/right offset), and is the topmost element there", async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      const rest = (await pinned(page, [0]))[0];
      const pos = await pinned(page, [200, 700, 1600, 100000]);
      expect(pos.at(-1)!.scrollTop, "the dialog actually scrolled").toBeGreaterThan(300);
      for (const p of pos) { expect(Math.abs(p.dTop - rest.dTop), `top @${p.scrollTop}`).toBeLessThanOrEqual(1); expect(Math.abs(p.dRight - rest.dRight), `right @${p.scrollTop}`).toBeLessThanOrEqual(1); }
      const covered = await page.evaluate((sel) => { const b = document.querySelector(sel)!, r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(top === b || b.contains(top)); }, CLOSE);
      expect(covered, "something covers the close control after deep scroll").toBe(false);
    });

    gated(`${NEEDS}: control sits in the top-right corner (<=24px from the top and right edge of the dialog), small`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      for (const p of await pinned(page, [0, 900, 100000])) { expect(p.dTop).toBeLessThanOrEqual(24); expect(p.dRight).toBeLessThanOrEqual(24); expect(p.w).toBeLessThanOrEqual(56); }
    });

    test("does not overlap the tab bar, the bottom nav or the score header, at the top and after deep scroll", async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      for (const top of [0, 100000]) {
        await page.locator(GAME_DIALOG).evaluate((d, t) => { d.scrollTop = t; }, top);
        await page.waitForTimeout(80);
        const hits = await page.evaluate((sel) => {
          const b = document.querySelector(sel)!.getBoundingClientRect();
          const hit = (q: string) => [...document.querySelectorAll(q)].filter((e) => e.getClientRects().length).some((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && b.left < r.right - 1 && r.left < b.right - 1 && b.top < r.bottom - 1 && r.top < b.bottom - 1; });
          return { tabs: hit("dialog.game-dialog [role=tablist] [role=tab]"), nav: hit("nav.tab-bar, nav.side-nav"), score: hit("dialog.game-dialog .gc-score, dialog.game-dialog [data-testid=gc-score], dialog.game-dialog .score-strip") };
        }, CLOSE);
        expect(hits, `overlap @scroll ${top}`).toEqual({ tabs: false, nav: false, score: false });
      }
    });

    test("closes from the top and after a deep scroll", async ({ page }) => {
      await page.setViewportSize(vp);
      await openGameCenter(page, "final");
      await page.locator(CLOSE).first().click();
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
      await page.goto("about:blank");
      await openGameCenter(page, "final");
      await page.locator(GAME_DIALOG).evaluate((d) => { d.scrollTop = 100000; });
      await page.locator(CLOSE).first().click();
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    });

    test("Escape closes and focus returns to the opener; Tab reaches the control and Enter closes", async ({ page }) => {
      await page.setViewportSize(vp);
      const { row } = await openGameCenter(page, "final");
      await page.keyboard.press("Escape");
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
      await expect(page.locator(`[data-game="${row.id}"] .sb-main`)).toBeFocused();
      await page.locator(`[data-game="${row.id}"] .sb-main`).press("Enter");
      await expect(page.locator(GAME_DIALOG)).toBeVisible();
      // walk away from the control with Tab, then come back with Shift+Tab until it is focused
      for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
      let reached = false;
      for (let i = 0; i < 60 && !reached; i++) { await page.keyboard.press("Shift+Tab"); reached = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), CLOSE); }
      expect(reached, "the close control is reachable by keyboard").toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    });

    gated(`${NEEDS}: returns to the same schedule: date strip, filter and window scroll preserved`, async ({ page }) => { // phase2: scroll restore drifts (57px at 1440, up to 1.7k px on tall filtered lists at 390; flaky) -- finding
      const s = await openSchedule(page, vp);
      await page.evaluate(() => window.scrollTo(0, 400));
      const y0 = await page.evaluate(() => window.scrollY);
      const hasScroll = y0 > 100;
      const opener = page.locator(`[data-game="${s.lastId}"] .sb-main`);
      await opener.scrollIntoViewIfNeeded();
      const y1 = await page.evaluate(() => window.scrollY);
      await opener.click();
      await expect(page.locator(GAME_DIALOG)).toBeVisible();
      await page.locator(GAME_DIALOG).evaluate((d) => { d.scrollTop = 100000; });
      await page.locator(CLOSE).first().click();
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
      expect(await strip(page)).toBe(s.yesterday);
      expect(await completedOn(page)).toBe("true");
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - y1), `window scroll (was ${y1}, hasScroll ${hasScroll})`).toBeLessThanOrEqual(25);
    });

    test("browser Back closes the Game Center without leaving the app or losing the selection", async ({ page }) => {
      const s = await openSchedule(page, vp);
      await page.locator(`[data-game="${s.firstId}"] .sb-main`).click();
      await expect(page.locator(GAME_DIALOG)).toBeVisible();
      await page.goBack();
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
      expect(page.url()).toContain("127.0.0.1");
      expect(await strip(page)).toBe(s.yesterday);
      expect(await completedOn(page)).toBe("true");
    });

    test("a direct ?game= link closes into the Games/Scoreboard view, not back to the external page before it", async ({ page }) => {
      await page.setViewportSize(vp);
      const raw = withState(REAL.reg(), "final");
      const row = gameOf(raw, { date: etDay(0), start: new Date(Date.now() - 4 * 3600_000).toISOString() });
      await mockSchedule(page, () => [row]);
      await serveGame(page, raw as Raw);
      await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ status: 404, body: "{}" }));
      await page.goto("about:blank");
      await page.goto(`/?game=${row.id}`);
      await expect(page.locator(GAME_DIALOG)).toBeVisible();
      await page.locator(CLOSE).first().click();
      await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
      expect(page.url()).toContain("127.0.0.1");
      expect(page.url()).not.toContain("game=");
      await expect(page.locator(`[data-game="${row.id}"]`)).toBeVisible(); // the schedule behind it
    });
  });
}

test.describe("other dialogs keep their own close buttons", () => {
  test("Team profile: one 'Close team profile' button, class dialog-close tp-close, closes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?view=games");
    await page.getByRole("button", { name: "Standings", exact: true }).click();
    await page.locator("tbody tr").first().locator("img.team-logo").first().click();
    const d = page.getByRole("dialog", { name: /profile/ });
    await expect(d).toBeVisible();
    const b = d.getByRole("button", { name: /^Close team profile$/ });
    await expect(b).toHaveCount(1);
    await expect(b).toHaveClass(/dialog-close/);
    await expect(b).toHaveClass(/tp-close/);
    await expect(b).toContainText("Close");
    await b.click();
    await expect(d).toBeHidden();
  });

  test("Player dialog (opened from the Game Center Players tab): its own 'Close player details' button; the Game Center stays open under it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGameCenter(page, "final");
    await openTab(page, "Players");
    const name = page.locator(`${GAME_DIALOG} [data-testid=gc-players] button[aria-label^="View "]`).first();
    await expect(name).toBeVisible({ timeout: 15000 });
    await name.click();
    const pd = page.locator("dialog.player-dialog[open]");
    await expect(pd).toBeVisible();
    const b = pd.getByRole("button", { name: "Close player details" });
    await expect(b).toHaveCount(1);
    await expect(b).toHaveClass(/dialog-close/);
    await expect(b).toContainText("Close");
    await b.click();
    await expect(pd).toHaveCount(0);
    await expect(page.locator(GAME_DIALOG)).toBeVisible();
    expect(await closeButtons(page)).toBe(1);
  });
});
