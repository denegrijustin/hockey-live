import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
let base = Date.now();
const day = (offset: number) => new Date(base + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const game = (id: number, offset: number, away: string, home: string, state = "FUT", score: [number, number] | [null, null] = [null, null]) => ({
  id, season, type: 2, date: day(offset), start: `${day(offset)}T23:00:00Z`, state, scheduleState: "OK", venue: "Test Arena",
  home, away, homeScore: score[1], awayScore: score[0], end: state === "FINAL" ? "REG" : "", broadcasts: [], round: null,
});

async function open(page: Page, url = "/", extra: any[] = []) {
  const snapshot = {
    season, updatedAt: new Date().toISOString(), source: "test fixture",
    games: [game(9201, 0, "CHI", "EDM"), game(9202, 0, "MIN", "DAL"), game(9203, 0, "BOS", "TOR", "FINAL", [2, 3]), game(9204, 1, "NYR", "NJD"), game(9205, 0, "SEA", "VAN", "FINAL", [1, 4]), { ...game(9206, 0, "COL", "WPG", "LIVE", [2, 2]), period: 3, periodType: "REG", clock: "04:10" }, ...extra],
  };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.goto(url);
}

test.describe("scoreboard home", () => {
  test("opens on the day's games with win probability and none of the schedule controls", async ({ page }) => {
    await open(page);
    await expect(page.locator(".sb-row")).toHaveCount(3);
    await expect(page.locator(".sb-prob")).toHaveCount(3); // the finals have none
    await expect(page.locator(".control-dock")).toHaveCount(0);
    await expect(page.locator(".game-card")).toHaveCount(0);
  });

  test("tapping a game shows a few key stats; Full game center is the second step", async ({ page }) => {
    await open(page);
    const row = page.locator(".sb-row.soon").first();
    await expect(page.getByTestId("key-stats")).toHaveCount(0);
    await row.locator(".sb-main").click();
    const stats = row.getByTestId("key-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("Record");
    await expect(page.locator("dialog.game-dialog")).toHaveCount(0);
    await stats.getByRole("button", { name: "Full game center" }).click();
    await expect(page.locator("dialog.game-dialog, .game-panel").first()).toBeVisible();
  });

  test("days can be stepped, and the old game list is still the Schedule view", async ({ page }) => {
    await open(page);
    const heading = page.locator(".sb-day h1");
    const before = await heading.innerText();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(heading).not.toHaveText(before);
    await expect(page.locator(".sb-row")).toHaveCount(1);
    await open(page, "/?view=games");
    await expect(page.locator(".game-card").first()).toBeVisible();
    await expect(page.locator(".sb-row")).toHaveCount(0);
  });

  test("a page left open rolls over to the new day, and uses the feed-independent Eastern date", async ({ page }) => {
    const start = new Date("2026-10-10T23:59:00-04:00");
    base = start.getTime();
    await page.clock.install({ time: start });
    await open(page);
    const heading = page.locator(".sb-day h1");
    const date = page.locator(".sb-day span");
    await expect(heading).toHaveText("Today");
    await expect(date).toHaveText("Saturday, October 10");
    await page.clock.fastForward(120_000);
    await expect(date).toHaveText("Sunday, October 11"); // midnight Eastern passed
    await expect(heading).toHaveText("Today");
    base = Date.now();
  });
  test("status buttons count the day's games and filter the board; Completed shows them expanded", async ({ page }) => {
    await open(page);
    const bar = page.getByRole("group", { name: "Show games by status" });
    await expect(bar.getByRole("button", { name: /1 in progress/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /2 completed/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /2 upcoming/ })).toBeVisible();
    // Sections, in the order the board reads: the live game is either brewing an upset or in progress, then upcoming. The finals are a compact strip above them.
    const names = await page.locator(".sb-group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.at(-1)).toBe("Upcoming");
    expect(names).not.toContain("Completed");
    expect(["Upset brewing", "In progress"]).toContain(names[0]);
    // One tap on Completed: only the finals, each already expanded.
    await bar.getByRole("button", { name: /2 completed/ }).click();
    await expect(page.locator(".sb-row")).toHaveCount(2);
    await expect(page.getByTestId("key-stats")).toHaveCount(2);
    await expect(bar.getByRole("button", { name: /2 completed/ })).toHaveAttribute("aria-pressed", "true");
    // Tapping it again brings the whole board back.
    await bar.getByRole("button", { name: /2 completed/ }).click();
    await expect(page.locator(".sb-row")).toHaveCount(3);
    await expect(page.getByTestId("key-stats")).toHaveCount(0);
    await bar.getByRole("button", { name: /2 upcoming/ }).click();
    await expect(page.locator(".sb-row.soon")).toHaveCount(2);
    await expect(page.locator(".sb-row.final")).toHaveCount(0);
  });

  test("completed games are a compact strip at the top of the board, one chip each, and a chip opens the game center", async ({ page }) => {
    await open(page);
    const strip = page.getByTestId("sb-done");
    await expect(strip).toBeVisible();
    await expect(strip.locator("button")).toHaveCount(2);
    // Above the live and upcoming sections, and the chips are small (one short row each).
    const [stripBox, firstGroup] = await Promise.all([strip.boundingBox(), page.locator(".sb-group").first().boundingBox()]);
    expect(stripBox!.y).toBeLessThan(firstGroup!.y);
    expect((await strip.locator("button").first().boundingBox())!.height).toBeLessThanOrEqual(72);
    await expect(strip.locator("button").first()).toContainText(/F(\/OT|\/SO)?$/);
    await expect(page.locator(".sb-row.final")).toHaveCount(0); // no full card for them down the page
    await strip.locator("button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the completed strip does not push a 360px phone sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await expect(page.getByTestId("sb-done")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  });

  test("games sit in puck-drop slots, the most watchable first, and each shows its watchability", async ({ page }) => {
    await open(page);
    const slot = page.locator(".sb-group.soon .sb-slot");
    await expect(slot).toHaveCount(1); // both upcoming games drop at the same time
    await expect(slot.locator(".sb-slot-h")).toContainText("–");
    const scores = await slot.locator(".score-ring strong").allInnerTexts();
    expect(scores).toHaveLength(2);
    expect(Number(scores[0])).toBeGreaterThanOrEqual(Number(scores[1]));
  });

  test("the board fits a 360px phone with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    await expect(page.locator(".sb-row").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
    await page.getByRole("button", { name: /completed/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  });

  test("Watch now: the hottest live games first, then the best starting within the hour; close and late glows; a tap opens the Game Center", async ({ page, isMobile }) => {
    const soon = { ...game(9210, 0, "TBL", "FLA"), start: new Date(Date.now() + 25 * 60000).toISOString() };
    const live = (id: number, away: string, home: string, score: [number, number], period: number, clock: string) => ({ ...game(id, 0, away, home, "LIVE", score), period, periodType: "REG", clock, start: new Date(Date.now() - 3600000).toISOString() });
    await open(page, "/", [live(9207, "LAK", "SJS", [1, 0], 2, "10:00"), live(9208, "NSH", "STL", [0, 0], 1, "15:00"), live(9209, "PHI", "PIT", [4, 1], 3, "02:00"), soon]);
    const strip = page.getByTestId("watch-now");
    const tiles = strip.locator(".wn-tile");
    await expect(tiles.first()).toBeVisible();
    // At most 3 on a phone, 5 on desktop (5 live and 1 soon exist here, so the live games fill the strip).
    await expect(tiles).toHaveCount(isMobile ? 3 : 5);
    await expect(tiles.first()).toHaveClass(/live/);
    // The tied 3rd-period game is close and late: it glows and says so.
    const hot = strip.locator(`.wn-tile[data-game="9206"]`);
    await expect(hot).toHaveClass(/hot/);
    await expect(hot).toContainText(/Close/);
    // The blowout is the coolest live game: it is not ahead of the tied one.
    const order = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
    expect(order.indexOf("9206")).toBeLessThan(order.indexOf("9209") === -1 ? 99 : order.indexOf("9209"));
    // A tile shows the score and a win probability.
    await expect(hot).toContainText("2");
    await expect(hot.locator(".wn-foot")).toContainText("%");
    await hot.click();
    await expect(page.locator("dialog.game-dialog, .game-panel").first()).toBeVisible();
  });

  test("the ring shows the watchability score and tapping it says why", async ({ page }) => {
    await open(page);
    const row = page.locator(".sb-row.soon").first();
    const ring = row.locator(".score-ring");
    await expect(ring).toBeVisible();
    expect(Number(await ring.locator("strong").innerText())).toBeGreaterThan(0);
    await ring.getByRole("button", { name: /Show why/ }).click();
    const why = page.getByTestId("score-why");
    await expect(why).toBeVisible();
    await expect(why).toContainText("Stakes");
    await expect(why).toContainText("Competitiveness");
    // The ring and the breakdown always agree (the number can move once last season's data arrives).
    await expect.poll(async () => (await why.locator("h3").innerText()).split(" ")[0]).toBe(await ring.locator("strong").innerText());
    await page.keyboard.press("Escape");
    await expect(why).toHaveCount(0);
  });

  test("a card has the venue, a Game Center button and TV chips; a finished game says what happened", async ({ page }) => {
    await open(page);
    const row = page.locator(".sb-row.soon").first();
    await expect(row.locator(".sb-venue")).toContainText("Test Arena");
    await row.getByRole("button", { name: /Open Game Center/ }).click();
    await expect(page.locator("dialog.game-dialog, .game-panel").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /completed/ }).click();
    const recap = page.getByTestId("recap").first();
    await expect(recap).toContainText("What happened");
    await expect(recap).toContainText(/beat/);
  });

  test("on a desktop the board is a dense table-like list, not a phone feed", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "desktop layout");
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const row = page.locator(".sb-row.soon").first();
    await expect(row).toBeVisible();
    const [r, status, main, ring, gc] = await Promise.all([row.boundingBox(), row.locator(".sb-status").boundingBox(), row.locator(".sb-main").boundingBox(), row.locator(".score-ring").boundingBox(), row.getByRole("button", { name: /Open Game Center/ }).boundingBox()]);
    // One horizontal line of columns: status, teams and probability, ring, actions, left to right.
    expect(status!.x + status!.width).toBeLessThanOrEqual(main!.x + 1);
    expect(main!.x + main!.width).toBeLessThanOrEqual(ring!.x + 1);
    expect(ring!.x + ring!.width).toBeLessThanOrEqual(gc!.x + 1);
    expect(r!.height).toBeLessThan(110);
    // The day switcher and the status filters share one toolbar row.
    const [day, chip] = await Promise.all([page.locator(".sb-days").boundingBox(), page.locator(".sb-chip").first().boundingBox()]);
    expect(Math.abs(day!.y - chip!.y)).toBeLessThan(40);
    // Pointer-sized controls, not 44pt touch targets.
    expect(chip!.height).toBeLessThanOrEqual(36);
  });

  for (const width of [1100, 1280, 1440, 0]) test(`a game on several channels never overlaps the ring, the bar or the Game Center button (${width || "phone"})`, async ({ page, isMobile }) => {
    test.skip(isMobile ? width !== 0 : width === 0, "each width runs on its own project");
    if (width) await page.setViewportSize({ width, height: 900 });
    const many = { ...game(9211, 0, "MTL", "CHI"), broadcasts: ["TSN", "RDS", "TVA Sports", "The Sportsnet", "NHL Network"], start: new Date(Date.now() + 40 * 60000).toISOString() };
    await open(page, "/", [many]);
    const row = page.locator('.sb-row[data-game="9211"]');
    await expect(row).toBeVisible();
    const box = (l: ReturnType<typeof row.locator>) => l.boundingBox();
    const tv = (await box(row.locator(".tv-network")))!, gc = (await box(row.getByRole("button", { name: /Open Game Center/ })))!;
    if (width && width < 1400) expect(tv.y, "on a narrower desktop the channels sit below the Game Center button").toBeGreaterThanOrEqual(gc.y + gc.height - 1);
    else expect(tv.x + tv.width, "TV pill ends before the GC button").toBeLessThanOrEqual(gc.x + 1);
    if (!isMobile) {
      const ring = (await box(row.locator(".score-ring")))!, prob = (await box(row.locator(".sb-prob")))!;
      expect(prob.x + prob.width, "the probability bar ends before the ring").toBeLessThanOrEqual(ring.x + 1);
      expect(ring.x + ring.width, "the ring ends before the GC button").toBeLessThanOrEqual(gc.x + 1);
      if (width >= 1400) expect(ring.x + ring.width, "ring ends before the TV pill").toBeLessThanOrEqual(tv.x + 1);
    }
    // The pill holds all its logos inside its own box.
    const inside = await row.locator(".tv-network").evaluate((e) => [...e.querySelectorAll(".network-logo, .network-more")].every((c) => { const a = c.getBoundingClientRect(), b = e.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; }));
    expect(inside).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
  });

  test("Home leads to the league-wide list of all games, with its filters and search", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /All games, filters/ }).click();
    await expect(page.locator(".game-card").first()).toBeVisible();
    await expect(page.locator(".sb-row")).toHaveCount(0);
  });
});
