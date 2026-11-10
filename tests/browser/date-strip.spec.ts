import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import { shiftDay } from "../../src/lib/dates.mjs";
import { goTo } from "./nav";

/**
 * The day strip, exercised through the Games view's "One day at a time" mode (the same DateStrip and useSelectedDate Home uses).
 * Fixed clock: Tuesday 2026-11-10, 10:00 Eastern. The schedule has games every day from Nov 1 to Nov 20 except Nov 5, 6 and 12.
 */
const season = manifest.current;
const NOW = new Date("2026-11-10T15:00:00Z");
const TODAY = "2026-11-10";
const EMPTY = ["2026-11-05", "2026-11-06", "2026-11-12"];

function fixture() {
  const games: any[] = [];
  let n = 9000;
  for (let o = -9; o <= 10; o++) {
    const date = shiftDay(TODAY, o);
    if (EMPTY.includes(date)) continue;
    const past = date < TODAY;
    for (const [away, home] of [["EDM", "CGY"], ["CHI", "MIN"]]) {
      games.push({ id: ++n, season, type: 2, date, start: `${shiftDay(date, 1)}T${away === "EDM" ? "00" : "01"}:00:00Z`, state: past ? "FINAL" : "FUT", scheduleState: "OK", venue: "Test Arena", home, away, homeScore: past ? 3 : null, awayScore: past ? 2 : null, end: past ? "REG" : "", broadcasts: [], round: null });
    }
  }
  return { season, updatedAt: NOW.toISOString(), source: "test fixture", games };
}

async function open(page: Page, url: string, now: Date = NOW) {
  const snapshot = fixture();
  await page.clock.install({ time: now });
  await page.route("**/api/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (r) => r.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (r) => r.fulfill({ json: snapshot }));
  await page.route("**/api/game/*", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/{picks,moneypuck,espn,injuries}/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(url);
  await expect(page.getByTestId("date-strip")).toBeVisible({ timeout: 30000 });
}
const strip = (page: Page) => page.getByTestId("date-strip");
const selected = (page: Page) => strip(page).locator('[role=tab][aria-selected="true"]');
/** Turns "One day at a time" on or off: in the desktop panel directly, on a phone in the Filters sheet. */
async function oneDay(page: Page, on: boolean, phone: boolean) {
  if (phone) await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("One day at a time").setChecked(on);
  if (phone) await page.getByRole("button", { name: "Done" }).click();
}
const dateParam = (page: Page) => new URL(page.url()).searchParams.get("date");

test("the strip opens on the day in the address, with Previous, Next, Today and a picker", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-08");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-08");
  await expect(page.getByRole("button", { name: "Previous day" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next day" })).toBeEnabled();
  await expect(page.getByTestId("date-today")).toBeEnabled();
  await expect(page.getByTestId("date-picker")).toHaveAttribute("min", "2026-11-01");
  await expect(page.getByTestId("date-picker")).toHaveAttribute("max", "2026-11-20");
  await expect(page.locator(".game-card")).toHaveCount(2);
  await expect(page.locator(".game-day-heading")).toHaveText("Sunday, Nov 8");
});

test("Previous and Next skip days with no games; Today returns and clears the date from the address", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-11");
  await expect(page.locator(".game-day-heading")).toHaveText("Tomorrow");
  await page.getByRole("button", { name: "Next day" }).click(); // Nov 12 has no games
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-13");
  expect(dateParam(page)).toBe("2026-11-13");
  expect(new URL(page.url()).searchParams.get("view")).toBe("games"); // the view stays
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-11");
  await page.getByTestId("date-today").click();
  await expect(selected(page)).toHaveAttribute("data-day", TODAY);
  expect(dateParam(page)).toBeNull(); // today is the automatic day: no parameter
  await expect(page.getByTestId("date-today")).toBeDisabled();
  await expect(page.locator(".game-day-heading")).toHaveText("Today");
});

test("the buttons disable at the first and last day", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-01");
  await expect(page.getByRole("button", { name: "Previous day" })).toBeDisabled();
  await page.getByTestId("date-picker").fill("2026-11-20");
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous day" })).toBeEnabled();
});

test("the date picker chooses any day in the range, including one without games", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-10");
  await page.getByTestId("date-picker").fill("2026-11-12");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-12");
  expect(dateParam(page)).toBe("2026-11-12");
  await expect(page.locator(".game-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-13");
});

test("a day chip selects its day; the chosen chip is announced and scrolled into view", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-10");
  await strip(page).locator('[role=tab][data-day="2026-11-17"]').click();
  await expect(selected(page)).toHaveAttribute("aria-selected", "true");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-17");
  await expect(strip(page).locator("[aria-live=polite]")).toHaveText("Tuesday, November 17");
  const inView = await selected(page).evaluate((el) => { const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; });
  expect(inView).toBe(true);
});

test("keyboard: arrows a day, PageUp/PageDown a week, Home/End the ends, t today", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-08");
  await selected(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-09");
  await expect(selected(page)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-08");
  await page.keyboard.press("PageDown");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-15");
  await page.keyboard.press("PageUp");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-08");
  await page.keyboard.press("End");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-20");
  await page.keyboard.press("Home");
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-01");
  await page.keyboard.press("t");
  await expect(selected(page)).toHaveAttribute("data-day", TODAY);
  expect(dateParam(page)).toBeNull();
  // roving tabindex: only the selected chip is a tab stop
  expect(await strip(page).locator('[role=tab][tabindex="0"]').count()).toBe(1);
});

test("an unknown, out-of-range or malformed date in the address is ignored", async ({ page }) => {
  for (const bad of ["2030-01-01", "2026-02-30", "garbage"]) {
    await open(page, `/?view=games&date=${bad}`);
    await expect(selected(page)).toHaveAttribute("data-day", TODAY);
  }
});

test("the date follows Home and Games but is dropped on other views", async ({ page }) => {
  await open(page, "/?view=games&date=2026-11-08");
  await goTo(page, "Standings");
  await expect(page).toHaveURL(/view=standings/);
  expect(dateParam(page)).toBeNull();
  await page.goBack();
  await expect(strip(page)).toBeVisible();
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-08");
});

test("the Games view opens one-day mode from Filters and leaves it with no date in the address", async ({ page, isMobile }) => {
  await open(page, "/?view=games&date=2026-11-08");
  await oneDay(page, false, isMobile);
  await expect(strip(page)).toHaveCount(0);
  expect(dateParam(page)).toBeNull();
  await oneDay(page, true, isMobile);
  await expect(strip(page)).toBeVisible();
  await expect(selected(page)).toHaveAttribute("data-day", TODAY);
});

test("a page left open rolls over at Eastern midnight while no day was picked", async ({ page, isMobile }) => {
  await page.goto("about:blank");
  await page.clock.install({ time: new Date("2026-11-11T04:59:30Z") }); // 23:59:30 on Nov 10 in Eastern time
  const snapshot = fixture();
  await page.route("**/api/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (r) => r.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (r) => r.fulfill({ json: snapshot }));
  await page.goto("/?view=games");
  await oneDay(page, true, isMobile);
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-10");
  await page.clock.runFor(70_000);
  await expect(selected(page)).toHaveAttribute("data-day", "2026-11-11");
  await expect(page.getByTestId("date-today")).toBeDisabled();
});

test("360px: no page overflow, 44px targets, and a fixed strip height", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, "/?view=games&date=2026-11-10");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const h0 = (await strip(page).boundingBox())!.height;
  for (const t of [page.getByRole("button", { name: "Previous day" }), page.getByRole("button", { name: "Next day" }), page.getByTestId("date-today"), page.getByTestId("date-picker"), selected(page)]) {
    const b = (await t.boundingBox())!;
    expect(b.width, "target width").toBeGreaterThanOrEqual(44);
    expect(b.height, "target height").toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Next day" }).click();
  expect((await strip(page).boundingBox())!.height).toBe(h0);
  const rail = await strip(page).getByRole("tablist").evaluate((el) => ({ scrolls: el.scrollWidth > el.clientWidth, fits: el.getBoundingClientRect().right <= innerWidth }));
  expect(rail).toEqual({ scrolls: true, fits: true });
});

test("light and dark both render a readable selected chip", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, "/?view=games&date=2026-11-10");
    const [fg, bg] = await selected(page).evaluate((el) => [getComputedStyle(el.querySelector(".ds-num")!).color, getComputedStyle(el).backgroundColor]);
    expect(fg).not.toBe(bg);
  }
});
