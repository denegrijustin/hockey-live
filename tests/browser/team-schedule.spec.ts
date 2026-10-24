import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import { goTo } from "./nav";

const season = manifest.current;
const etDay = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const opps = ["BOS", "MTL", "OTT", "FLA", "TBL", "DET", "BUF", "NYR", "PHI", "PIT"];
let id = 9500;
// TOR's season in the fixture: 30 games already played (every other day, up to yesterday) and 52 still to come (every other day from tomorrow).
const games = [
  ...Array.from({ length: 30 }, (_, i) => {
    const o = -(2 * (30 - i) - 1), home = i % 2 === 0, w = i % 3 !== 0;
    return { id: ++id, season, type: 2, date: etDay(o), start: `${etDay(o)}T23:00:00Z`, state: "FINAL", scheduleState: "OK", venue: "Test Arena", home: home ? "TOR" : opps[i % 10], away: home ? opps[i % 10] : "TOR", homeScore: home === w ? 3 : 1, awayScore: home === w ? 1 : 3, end: i % 7 === 0 ? "OT" : "REG", broadcasts: [], round: null };
  }),
  ...Array.from({ length: 52 }, (_, i) => {
    const o = 1 + 2 * i, home = i % 2 === 0;
    return { id: ++id, season, type: 2, date: etDay(o), start: `${etDay(o)}T23:00:00Z`, state: "FUT", scheduleState: "OK", venue: "Test Arena", home: home ? "TOR" : opps[(i + 3) % 10], away: home ? opps[(i + 3) % 10] : "TOR", homeScore: null, awayScore: null, end: "", broadcasts: [], round: null };
  }),
];

async function open(page: Page) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  await goTo(page, "Schedule");
  await page.getByLabel("Team", { exact: true }).selectOption("TOR");
  await expect(page.getByRole("heading", { name: "Toronto Maple Leafs", level: 1 })).toBeVisible();
}
const monthName = (offset = 0) => { const d = new Date(`${etDay(0).slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); };

test("the header counts the games completed and the games upcoming, with the record", async ({ page }) => {
  await open(page);
  const rec = page.getByTestId("ts-record");
  await expect(rec).toContainText("30 completed");
  await expect(rec).toContainText("52 upcoming");
  await expect(rec).toContainText(/\d+–\d+–\d+ · \d+ pts/);
});

test("the list opens centred on the game closest to play, with the season above and below it", async ({ page }) => {
  await open(page);
  const next = page.locator("[data-next]");
  await expect(next).toBeVisible();
  await expect(next).toContainText("Next game");
  await expect(next).toHaveAttribute("data-status", "upcoming");
  const [box, vh] = [(await next.boundingBox())!, page.viewportSize()!.height];
  expect(Math.abs(box.y + box.height / 2 - vh / 2), "the next game sits in the middle of the screen").toBeLessThan(vh * 0.3);
  // The game before it is already played and sits above; the one after is upcoming and sits below.
  const before = page.locator("[data-next]").locator("xpath=preceding-sibling::li[1]");
  await expect(before).toHaveAttribute("data-status", "final");
  const after = page.locator("[data-next]").locator("xpath=following-sibling::li[1]");
  await expect(after).toHaveAttribute("data-status", "upcoming");
  // Scroll up for what has been played, down for what is still to come.
  await page.mouse.wheel(0, -900);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(await page.evaluate(() => scrollY) + 1);
  expect(await page.locator('[data-status="final"]').count()).toBe(30);
  expect(await page.locator('[data-status="upcoming"]').count()).toBe(52);
});

test("the completed and upcoming chips narrow the list; completed games show their result", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /completed/ }).click();
  await expect(page.locator(".ts-list > li")).toHaveCount(30);
  await expect(page.locator(".ts-list .ts-badge").first()).toHaveText(/^(W|L|OTL)$/);
  await page.getByRole("button", { name: /upcoming/ }).click();
  await expect(page.locator(".ts-list > li")).toHaveCount(52);
  await page.getByRole("button", { name: /season/ }).click();
  await expect(page.locator(".ts-list > li")).toHaveCount(82);
  await expect(page.locator("[data-next]")).toBeVisible();
});

test("the calendar opens on the current month, shows each game on its day, and moves month to month", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByTestId("ts-month")).toHaveText(monthName(0));
  await expect(page.locator(".ts-day.today")).toHaveCount(1);
  await expect(page.locator(`.ts-day[data-date="${etDay(1)}"] .ts-gchip`).or(page.locator(`.ts-day[data-date="${etDay(-1)}"] .ts-gchip`)).first()).toBeVisible();
  // Played games carry their result; upcoming ones their time.
  const played = page.locator(`.ts-day[data-date="${etDay(-1)}"] .ts-gchip`);
  if (await played.count()) await expect(played.first()).toContainText(/[WL]|OTL/);
  // Each game names its opponent next to the logo, so nobody has to know every logo.
  await expect(page.locator(".ts-gchip .ts-abbr").first()).toHaveText(/^[A-Z]{3}$/);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByTestId("ts-month")).toHaveText(monthName(1));
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByTestId("ts-month")).toHaveText(monthName(-1));
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByTestId("ts-month")).toHaveText(monthName(0));
  // A game on the calendar opens its Game Center.
  await page.locator(".ts-gchip").first().click();
  await expect(page.locator("dialog.game-dialog, .game-panel").first()).toBeVisible();
});

test("another team shows its own schedule", async ({ page }) => {
  await open(page);
  await page.getByLabel("Team", { exact: true }).selectOption("BOS");
  await expect(page.getByRole("heading", { name: "Boston Bruins", level: 1 })).toBeVisible();
  await expect(page.getByTestId("ts-record")).toContainText("completed");
});

test("both views fit a 360px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByTestId("ts-calendar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});
