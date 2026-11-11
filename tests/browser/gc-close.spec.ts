import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import teams from "../../public/data/teams.json" with { type: "json" };

/**
 * The Game Center's one close control: a 44x44 X pinned top-right while the dialog scrolls, that closes through the shared route
 * (click, Escape, Back, swipe) and returns to where the Game Center was opened from. Deterministic fixture season, no network.
 */
const season = manifest.current;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ids = (teams as { id: string }[]).map((t) => t.id);

function fixture() {
  const games: any[] = [];
  let n = 7000;
  const mk = (offset: number, away: string, home: string) => {
    const past = offset < 0;
    games.push({
      id: ++n, season, type: 2, date: day(offset), start: `${day(offset)}T20:00:00Z`, state: past ? "FINAL" : "FUT", scheduleState: "OK", venue: "Test Arena",
      home, away, homeScore: past ? 2 + (n % 3) : null, awayScore: past ? 1 + (n % 4) : null, end: past ? "REG" : "", broadcasts: [], round: null,
    });
  };
  for (let o = -21; o <= 14; o++) {
    for (let k = 0; k < 8; k++) mk(o, ids[(o + 30 + k * 2) % 32], ids[(o + 30 + k * 2 + 1 + (k % 3)) % 32]);
    mk(o, "EDM", ids[(o + 40) % 32] === "EDM" ? "VAN" : ids[(o + 40) % 32]);
    mk(o, "CHI", "MIN");
  }
  return { season, updatedAt: new Date().toISOString(), source: "test fixture", games };
}

async function open(page: Page, url: string) {
  const snapshot = fixture();
  await page.route("**/api/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (r) => r.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (r) => r.fulfill({ json: snapshot }));
  for (const p of ["**/api/game/*", "**/api/picks/**", "**/api/moneypuck/**", "**/data/moneypuck/**/shots/**", "**/api/espn/*", "**/api/injuries/**"]) await page.route(p, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(url);
  await page.locator("main#main h1").first().waitFor({ timeout: 30000 });
}

const dialog = (page: Page) => page.locator("dialog.game-dialog");
const closeBtn = (page: Page) => dialog(page).locator('button[aria-label="Close game details"]');
async function openFirstCard(page: Page) {
  const card = page.locator(".game-card").first();
  await card.waitFor();
  await card.getByRole("button", { name: /Open Game Center/ }).click();
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(400); // the sheet slide finishes
}
const boxOf = async (page: Page, selector: string) => ((await dialog(page).locator(selector).count()) ? dialog(page).locator(selector).first().boundingBox() : null);
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("Game Center close button", () => {
  test("exactly one close control, labelled, 44x44, with the dialog's own label kept", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await open(page, "/?view=games");
    await openFirstCard(page);
    await expect(dialog(page).locator('button[aria-label^="Close"]')).toHaveCount(1);
    await expect(dialog(page)).toHaveAttribute("aria-label", /full game view$/);
    await expect(dialog(page).locator(".dialog-close")).toHaveCount(0);
    const box = (await closeBtn(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(closeBtn(page).locator("svg")).toBeVisible();
    expect(await closeBtn(page).textContent()).toBe("");
    expect(errors).toEqual([]);
  });

  for (const [w, h] of [[390, 844], [360, 740], [1440, 1000]] as const) {
    test(`stays pinned top-right while the dialog scrolls and never covers the score, status or tabs at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, "/?view=games");
      await openFirstCard(page);
      const vp = page.viewportSize()!;
      const at = async () => (await closeBtn(page).boundingBox())!;
      const top = await at();
      for (const y of [0, 600, 2000]) {
        await dialog(page).evaluate((el, v) => { el.scrollTop = v; }, y);
        await page.waitForTimeout(60);
        const b = await at();
        expect(Math.abs(b.y - top.y), `scrollTop ${y}`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.x - top.x), `scrollTop ${y}`).toBeLessThanOrEqual(1);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
        expect(vp.width - (b.x + b.width), "right inset").toBeLessThan(Math.max(80, (vp.width - 1240) / 2 + 40));
        expect(b.y, "near the top").toBeLessThan(40);
        // The sticky tab bar never sits under it.
        const tabs = await boxOf(page, ".gc-tabs");
        if (tabs && tabs.y < 120 && tabs.y + tabs.height > 0) expect(overlaps(b, tabs), `tabs at scrollTop ${y}`).toBe(false);
        const tab = await boxOf(page, '.gc-tabs [role="tab"]');
        if (tab) expect(overlaps(b, tab), "first tab").toBe(false);
      }
      await dialog(page).evaluate((el) => { el.scrollTop = 0; });
      await page.waitForTimeout(60);
      const b = await at();
      for (const sel of ['[data-testid="gc-status"]', ".dialog-matchup", ".gc-header .dialog-team", '[data-testid="gc-clock"]']) {
        const other = await boxOf(page, sel);
        if (other) expect(overlaps(b, other), sel).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("Escape closes it and focus returns to the opener", async ({ page }) => {
    await open(page, "/?view=games");
    const opener = page.locator(".game-card").first().getByRole("button", { name: /Open Game Center/ });
    await opener.waitFor();
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(closeBtn(page)).toBeFocused();
    const length = await page.evaluate(() => history.length);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(new URL(page.url()).searchParams.has("game")).toBe(false);
    // One close = one Back: the history grew by the open and is not longer after closing.
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(length);
  });

  test("Enter and Space on the button close it", async ({ page }) => {
    await open(page, "/?view=games");
    for (const key of ["Enter", "Space"]) {
      await openFirstCard(page);
      await closeBtn(page).focus();
      await page.keyboard.press(key);
      await expect(dialog(page)).toHaveCount(0);
    }
  });

  test("click returns to Games with the same date, filter and scroll position", async ({ page }) => {
    const date = day(-2);
    await open(page, `/?view=games&date=${date}`);
    const phone = (page.viewportSize()?.width ?? 0) < 721;
    const box = page.locator(phone ? 'input[aria-label="Find a matchup"]' : 'input[type="search"][placeholder^="Team or opponent"]');
    if (!phone && !(await box.isVisible())) await page.getByRole("button", { name: /^Filters/ }).click();
    await box.fill("Edmonton");
    await page.locator(".game-card").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => Math.round(window.scrollY));
    const search = new URL(page.url()).search;
    await openFirstCard(page);
    expect(new URL(page.url()).searchParams.get("date")).toBe(date);
    await dialog(page).evaluate((el) => { el.scrollTop = 900; });
    await closeBtn(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(new URL(page.url()).search).toBe(search);
    await expect(box).toHaveValue("Edmonton");
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(before - 25);
    expect(Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - before)).toBeLessThan(25);
    // Reopening starts at the top of the dialog.
    await openFirstCard(page);
    expect(await dialog(page).evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("Back closes it without growing the history", async ({ page }) => {
    await open(page, "/?view=games");
    const before = await page.evaluate(() => history.length);
    await openFirstCard(page);
    expect(new URL(page.url()).searchParams.has("game")).toBe(true);
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("game")).toBe(false);
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);
    await openFirstCard(page);
    await closeBtn(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);
  });

  test("a direct ?game= link closes to the Games view and never leaves the app", async ({ page }) => {
    await open(page, "/");
    const id = fixture().games.find((g) => g.date === day(-1))!.id;
    await page.goto(`/?game=${id}`);
    await expect(dialog(page)).toBeVisible({ timeout: 30000 });
    const length = await page.evaluate(() => history.length);
    // Keyboard, not a pointer click: the Home screen behind a bare ?game= link has a date strip that is a few px wider than a phone.
    await closeBtn(page).focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).search).toBe("?view=games");
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(page.locator("main#main h1").first()).toBeVisible();
  });

  test("a double close (Escape then click) closes once", async ({ page }) => {
    await open(page, "/?view=games");
    await openFirstCard(page);
    const length = await page.evaluate(() => history.length);
    await dialog(page).evaluate((el) => { el.dispatchEvent(new Event("cancel", { cancelable: true })); el.dispatchEvent(new Event("close")); });
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).searchParams.get("view")).toBe("games");
  });

  test("the icon has enough contrast in the light theme and in dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, "/?view=games");
      await openFirstCard(page);
      const ratio = await page.evaluate(() => {
        const btn = document.querySelector<HTMLElement>("dialog.game-dialog .gc-close")!;
        const dlg = document.querySelector<HTMLElement>("dialog.game-dialog")!;
        const c = document.createElement("canvas"); c.width = c.height = 1;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        const px = (...layers: string[]) => { g.clearRect(0, 0, 1, 1); for (const l of layers) { g.fillStyle = l; g.fillRect(0, 0, 1, 1); } const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
        const lum = ([r, gg, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
        const bg = px(getComputedStyle(dlg).backgroundColor, getComputedStyle(btn).backgroundColor);
        const fg = px(getComputedStyle(btn).color);
        const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
      expect(ratio, `${scheme} contrast`).toBeGreaterThanOrEqual(3);
      await closeBtn(page).click();
    }
  });

  test("keyboard focus shows a visible ring", async ({ page }) => {
    await open(page, "/?view=games");
    await openFirstCard(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await closeBtn(page).focus();
    await page.keyboard.press("Shift+Tab"); // leaves and returns through the focus trap
    await page.keyboard.press("Tab");
    await closeBtn(page).focus({ preventScroll: true });
    const style = await closeBtn(page).evaluate((el) => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) }; });
    // :focus-visible matches for the keyboard-driven focus above.
    expect(await closeBtn(page).evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(style.style).toBe("solid");
    expect(style.width).toBeGreaterThanOrEqual(2);
    expect(style.offset).toBeGreaterThanOrEqual(2);
  });
});
