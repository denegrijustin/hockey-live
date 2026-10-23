import { expect, test } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

// Every other spec runs with reduced motion (see playwright.config.ts); these tests are about the motion itself.
test.use({ reducedMotion: "no-preference" });

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null, end: "" };
const snapshot = {
  season, updatedAt: new Date().toISOString(), source: "fixture",
  games: [
    { ...base, id: 9301, away: "COL", home: "WPG", state: "LIVE", awayScore: 2, homeScore: 2, period: 3, periodType: "REG", clock: "04:10", start: new Date(Date.now() - 3600000).toISOString() },
    { ...base, id: 9302, away: "CHI", home: "EDM", state: "FUT", awayScore: null, homeScore: null, start: new Date(Date.now() + 20 * 60000).toISOString() },
    { ...base, id: 9303, away: "NYR", home: "NJD", state: "FUT", awayScore: null, homeScore: null, start: new Date(Date.now() + 21 * 60000).toISOString() },
    { ...base, id: 9304, away: "MIN", home: "DAL", state: "FUT", awayScore: null, homeScore: null, start: new Date(Date.now() + 22 * 60000).toISOString() },
  ],
};
async function open(page: import("@playwright/test").Page) {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  await expect(page.locator(".wn-tile").first()).toBeVisible();
}

test("motion is on by default: the ring fills in and the late-game glow loops", async ({ page }) => {
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  const glow = await page.locator(".wn-tile.hot").evaluate((e) => getComputedStyle(e, "::after").animationName);
  expect(glow).toBe("late-glow");
  await expect(page.locator(".sr-fill").first()).toBeVisible();
});

test("reduced motion switches every effect off and shows the ring already full", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  expect(await page.locator(".wn-tile.hot").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
  expect(await page.locator(".wn-when i").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  const fill = page.locator(".sr-fill").first();
  expect(await fill.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  // Not mid-fill: the dash offset is already at its final value.
  const circle = 2 * Math.PI * 21;
  const offset = Number(await fill.getAttribute("stroke-dashoffset"));
  expect(offset).toBeLessThan(circle);
});

test("a hidden tab pauses the looping animations", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.locator("html")).toHaveAttribute("data-hidden", "");
  expect(await page.locator(".wn-when i").first().evaluate((e) => getComputedStyle(e).animationPlayState)).toBe("paused");
});

test("cards fade up with a stagger, views slide in, and a press gives feedback", async ({ page }) => {
  await open(page);
  const third = page.locator(".sb-list > li:nth-child(3)").first();
  await expect(third).toBeVisible();
  expect(await third.evaluate((e) => getComputedStyle(e).animationName)).toBe("card-in");
  expect(await third.evaluate((e) => getComputedStyle(e).animationDelay)).toBe("0.06s");
  expect(await page.locator(".view-in").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("view-in");
  const chip = page.locator(".sb-chip").first();
  const box = (await chip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await chip.evaluate((e) => getComputedStyle(e).transform)).not.toBe("none"); // scaled while pressed
  await page.mouse.up();
});

test("the tab underline is one element that slides to the chosen tab", async ({ page, isMobile }) => {
  await open(page);
  if (isMobile) {
    const bar = page.getByRole("navigation", { name: "Dashboard views" });
    await expect(bar).toHaveAttribute("data-slide", "");
    const before = await bar.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--ux"));
    await bar.getByRole("button", { name: "Standings" }).click();
    await expect.poll(() => bar.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--ux"))).not.toBe(before);
    expect(await bar.evaluate((e) => getComputedStyle(e, "::after").transitionProperty)).toBe("transform");
  } else {
    await page.getByRole("button", { name: "NHL+", exact: true }).click();
    const sub = page.getByRole("navigation", { name: "NHL+ views" });
    await expect(sub).toHaveAttribute("data-slide", "");
    const before = await sub.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--ux"));
    await sub.getByRole("button", { name: "Players" }).click();
    await expect.poll(() => sub.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--ux"))).not.toBe(before);
    expect(await sub.evaluate((e) => getComputedStyle(e, "::after").transitionProperty)).toBe("transform");
  }
});

test("a goal flashes the score and pulses the card once", async ({ page }) => {
  await page.clock.install();
  let goals = 0;
  const live = (n: number) => ({ ...snapshot.games[0], awayScore: 2, homeScore: n });
  await page.route("**/api/live", (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), date: day, games: [live(2 + goals)] } }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  const row = page.locator(`.sb-row[data-game="9301"]`);
  await expect(row).toBeVisible();
  await expect(page.locator(".pulse-ring")).toHaveCount(0); // nothing on first sight
  goals = 1;
  await page.clock.fastForward(35_000);
  await expect(row.locator(".sb-score.scored")).toHaveCount(1);
  await expect(row.locator(".pulse-ring")).toHaveCount(1);
  await page.clock.fastForward(2_000);
  await expect(row.locator(".sb-score.scored")).toHaveCount(0); // it plays once and stops
  await expect(row.locator(".pulse-ring")).toHaveCount(0);
});

test("a short buzz when a game starts, and none with motion off", async ({ page }) => {
  await page.addInitScript(() => { (window as any).__buzz = 0; navigator.vibrate = () => { (window as any).__buzz++; return true; }; });
  await page.clock.install();
  let started = false;
  const feed = () => ({ updatedAt: new Date().toISOString(), date: day, games: [started ? { ...snapshot.games[1], state: "LIVE", period: 1, periodType: "REG", clock: "19:50", awayScore: 0, homeScore: 0 } : snapshot.games[1]] });
  await page.route("**/api/live", (route) => route.fulfill({ json: feed() }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  await expect(page.locator(".sb-row").first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__buzz)).toBe(0);
  started = true;
  await page.clock.fastForward(35_000);
  await expect.poll(() => page.evaluate(() => (window as any).__buzz)).toBe(1);
});

test("with motion off there is no buzz and none of the one-shots play", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => { (window as any).__buzz = 0; navigator.vibrate = () => { (window as any).__buzz++; return true; }; });
  await open(page);
  expect(await page.locator(".sb-list > li").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await page.locator(".view-in").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  expect(await page.evaluate(() => (window as any).__buzz)).toBe(0);
});

test("a refresh the viewer asks for ends with an Updated just now toast", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated just now" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 6000 });
});

test("a slow board shows skeleton placeholders, not a Loading line", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.fulfill({ json: snapshot }); });
  await page.route(`**/data/seasons/${season}.json`, async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.fulfill({ json: snapshot }); });
  await page.goto("/");
  await expect(page.locator(".skeleton-card, .skel").first()).toBeVisible();
  await expect(page.getByText(/^Loading the (NHL board|scoreboard)/)).toHaveCount(0);
  await expect(page.locator(".sb-row").first()).toBeVisible({ timeout: 8000 });
});
