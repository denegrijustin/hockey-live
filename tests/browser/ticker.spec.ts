import { expect, test, type Page } from "@playwright/test";

const DAY = "2026-10-10";
// The clock is pinned so "today" is a day with games whatever day the suite runs.
async function open(page: Page, live: unknown = null) {
  await page.clock.setFixedTime(new Date(`${DAY}T12:00:00-05:00`));
  if (live) await page.route("**/api/live", (route) => route.fulfill({ json: live }));
  else await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  await expect(page.locator(".ticker-item").first()).toBeAttached();
}
const real = (page: Page) => page.locator(".ticker-track > li:not(.ticker-dup) .ticker-item");

test("the strip sits at the very top, says TODAY, and lists every game on the day", async ({ page, request }) => {
  await open(page);
  const ticker = page.getByRole("region", { name: "Today's games" });
  await expect(ticker.locator(".ticker-title")).toHaveText("TODAY");
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  await page.mouse.wheel(0, 2500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  expect(await ticker.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
  // One entry per game scheduled that day, each with a start time.
  const season = await (await request.get("/data/seasons/20262027.json")).json();
  const expected = season.games.filter((g: { date: string }) => g.date === DAY).length;
  expect(expected).toBeGreaterThan(0);
  await expect(real(page)).toHaveCount(expected);
  for (const label of await real(page).evaluateAll((els) => els.map((e) => e.querySelector(".ticker-final")?.textContent ?? ""))) expect(label).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/);
});

test("live games lead with the score and period, finished ones show FINAL, the rest keep their start time", async ({ page, request }) => {
  const season = await (await request.get("/data/seasons/20262027.json")).json();
  const day = season.games.filter((g: { date: string }) => g.date === DAY);
  const [a, b, c] = day;
  const live = {
    updatedAt: `${DAY}T17:00:00Z`,
    date: DAY,
    games: [
      { ...a, state: "LIVE", period: 2, periodType: "REG", clock: "12:31", intermission: false, awayScore: 1, homeScore: 2 },
      { ...b, state: "FINAL", end: "OT", awayScore: 3, homeScore: 4 },
    ],
  };
  await open(page, live);
  const items = real(page);
  await expect(items.first()).toContainText("LIVE P2 12:31"); // live first
  await expect(items.first()).toContainText("1");
  await expect(items.first()).toContainText("2");
  await expect(items.last()).toContainText("FINAL / OT"); // finals last
  await expect(items.last()).toHaveAttribute("aria-label", /3.* 4, final \/ ot\. Open the Game Center\.$/);
  expect(c).toBeTruthy();
  await expect(items).toHaveCount(day.length);
});

test("it scrolls, stops under the pointer or on request, and each game says where it leads", async ({ page }) => {
  await open(page);
  const ticker = page.getByRole("region", { name: "Today's games" });
  const track = ticker.locator(".ticker-track");
  const state = () => track.evaluate((e) => getComputedStyle(e).animationPlayState);
  await page.mouse.move(0, 400); // off the strip: a pointer resting over it would hold it still
  expect(await state()).toBe("running");
  await ticker.hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(0, 400);
  expect(await state()).toBe("running");
  await ticker.getByRole("button", { name: "Pause" }).click();
  await page.mouse.move(0, 400);
  expect(await state()).toBe("paused");
  await expect(ticker.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "true");
  const labels = await real(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l).toMatch(/ at .*, .*\. Open the Game Center\.$/);
  expect(await ticker.locator(".ticker-dup").count()).toBe(labels.length);
});

test("clicking a game opens its Game Center", async ({ page }) => {
  await open(page);
  const ticker = page.getByRole("region", { name: "Today's games" });
  const first = real(page).first();
  const label = (await first.getAttribute("aria-label")) ?? "";
  await ticker.hover(); // the strip holds still under the pointer, so the click lands
  await first.click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  const [away] = label.split(" at ");
  await expect(dialog).toContainText(away.trim());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("with reduced motion the strip doesn't scroll by itself", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const ticker = page.getByRole("region", { name: "Today's games" });
  expect(await ticker.locator(".ticker-track").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(ticker.locator(".ticker-dup").first()).toBeHidden();
  await expect(ticker.getByRole("button", { name: "Pause" })).toBeHidden();
});
