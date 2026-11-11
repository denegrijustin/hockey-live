// A bare phone `/?game=ID` direct link must not widen the layout viewport (regression seen at 390: 436px wide, Home date strip rail overflowing).
import { test, expect } from "@playwright/test";
import { REAL, withState, GAME_DIALOG, CLOSE } from "./ui-qa-helpers";
import { mockSchedule, serveGame, gameOf, type Raw } from "./gc-qa-fixtures";

for (const width of [320, 390, 430]) {
  test(`direct ?game= link at ${width}: layout viewport equals device width, before and after closing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const raw = withState(REAL.reg(), "final");
    const row = gameOf(raw, { date: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }), start: new Date(Date.now() - 4 * 3600_000).toISOString() });
    await mockSchedule(page, () => [row]);
    await serveGame(page, raw as Raw);
    await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ status: 404, body: "{}" }));
    await page.goto(`/?game=${row.id}`);
    await expect(page.locator(GAME_DIALOG)).toBeVisible();
    const probe = () => page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > vw + 1 && !e.closest("dialog")).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}:${Math.round(e.getBoundingClientRect().right)}`);
      return { inner: innerWidth, client: vw, scroll: document.documentElement.scrollWidth, wide };
    });
    const a = await probe();
    expect(a.scroll, JSON.stringify(a)).toBeLessThanOrEqual(width);
    await page.locator(CLOSE).first().click();
    await expect(page.locator(GAME_DIALOG)).toHaveCount(0);
    const b = await probe();
    expect(b.scroll, JSON.stringify(b)).toBeLessThanOrEqual(width);
  });
}

// Real phone emulation (isMobile: the layout viewport can grow beyond the device width when something overflows): run with --project=mobile.
test("mobile emulation: bare /?game= link keeps innerWidth at the device width", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "needs isMobile emulation");
  const raw = withState(REAL.reg(), "final");
  const row = gameOf(raw, { date: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }), start: new Date(Date.now() - 4 * 3600_000).toISOString() });
  await mockSchedule(page, () => [row]);
  await serveGame(page, raw as Raw);
  await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(`/?game=${row.id}`);
  await expect(page.locator(GAME_DIALOG)).toBeVisible();
  const m = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth, wide: [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > screen.width + 1 && !e.closest("dialog")).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}:${Math.round(e.getBoundingClientRect().right)}`) }));
  expect(m.inner, JSON.stringify(m)).toBeLessThanOrEqual(390);
  expect(m.scroll, JSON.stringify(m)).toBeLessThanOrEqual(390);
});

test("mobile emulation: bare /?game= link on the bundled season data (full date strip) keeps innerWidth at the device width", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "needs isMobile emulation");
  await page.route("**/api/live", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route("**/api/game/*", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?game=2025020001");
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth, wide: [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > screen.width + 1).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}:${Math.round(e.getBoundingClientRect().right)}`) }));
  expect(m.inner, JSON.stringify(m)).toBeLessThanOrEqual(390);
  expect(m.scroll, JSON.stringify(m)).toBeLessThanOrEqual(390);
});
