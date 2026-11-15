import { expect, test, type Page } from "@playwright/test";
import { goTo } from "./nav";

// The Standings "Analytics" tab: a division's table with 5v5 and goaltending numbers, rank-coloured tiles and sortable headers. It runs on the app's bundled season and
// MoneyPuck data, so every expectation is read back from the page, never hard-coded.
async function open(page: Page) {
  await page.goto("/");
  await goTo(page, "Standings");
  await page.getByRole("button", { name: /^Analytics/ }).click();
  await expect(page.getByTestId("division-analytics")).toBeVisible();
  await expect(page.getByTestId("an-table").locator("tbody tr")).toHaveCount(8);
  await expect(page.locator(".an-state")).toHaveCount(0); // the MoneyPuck numbers have arrived
  await expect(page.locator("[data-testid=an-table] .an-tile:not(.none)").first()).toBeVisible();
}
const num = (t: string) => Number(t.replace("−", "-").replace("%", "").replace("+", ""));
/** The text of one metric's tile in every row, in the order the rows are shown. */
const column = (page: Page, metric: string) => page.locator(`[data-testid=an-table] tbody td[data-metric=${metric}] .an-tile b`).allInnerTexts();
const order = (page: Page) => page.locator("[data-testid=an-table] tbody tr").evaluateAll((trs) => trs.map((t) => t.getAttribute("data-team")));
const header = (page: Page, name: RegExp) => page.locator("[data-testid=an-table] thead th").filter({ hasText: name });

test("a division's table: the title, eight teams, every metric tile with its league rank, and the 5v5 rank with an arrow", async ({ page }) => {
  await open(page);
  const an = page.getByTestId("division-analytics");
  await expect(an.locator(".an-title h3")).toHaveText(/DIVISION$/);
  await expect(an.locator(".an-title")).toContainText("STANDINGS & ANALYTICS");
  for (const h of ["TEAM", "PTS", "GOAL DIFF", "5V5 XG", "5V5 GOAL", "GSAX", "SPECIAL", "DIVISION RANK"]) await expect(an.locator("thead")).toContainText(h);
  const first = an.locator("tbody tr").first();
  await expect(first.locator(".an-num")).toHaveText("1"); // standings order to begin with
  await expect(first.locator(".an-tm small")).toContainText(/\d+ GP · [\d.]+ pts%/);
  expect(await first.locator(".an-cell").count()).toBe(5);
  await expect(first.locator(".an-tile small").first()).toHaveText(/^\d+(st|nd|rd|th)$/); // the league rank under the value
  await expect(first.locator(".an-tile").first()).toHaveAttribute("title", /of \d+ in the league/);
  await expect(an.locator(".an-rk").first().locator("b")).toHaveText(/^\d+$/);
  await expect(an.locator(".an-legend")).toContainText("CELL COLOUR = LEAGUE RANK");
  await expect(an.locator(".an-legend")).toContainText("DIVISION RANK ON 5V5 PLAY");
});

test("the arrow is the standings position minus the division rank on 5v5 play, and = when they match", async ({ page }) => {
  await open(page);
  const rows = await page.locator("[data-testid=an-table] tbody tr").evaluateAll((trs) => trs.map((t) => ({
    pos: Number(t.querySelector(".an-num")!.textContent), rank: Number(t.querySelector(".an-rk b")!.textContent), change: t.querySelector(".an-rk")!.getAttribute("data-change"),
    text: (t.querySelector(".an-rk i")?.textContent ?? "").replace(/\s+/g, " ").trim(),
  })));
  for (const r of rows) {
    const d = r.pos - r.rank;
    expect(r.change, `position ${r.pos}, 5v5 rank ${r.rank}`).toBe(d > 0 ? "up" : d < 0 ? "down" : "same");
    if (d !== 0) expect(r.text).toContain(String(Math.abs(d)));
  }
  expect(new Set(rows.map((r) => r.rank)).size, "5v5 ranks are 1-8, each once").toBe(8);
});

test("tiles are coloured by league rank: the best tile is green, the worst red, and the legend runs between them", async ({ page }) => {
  await open(page);
  const tiles = await page.locator("[data-testid=an-table] .an-tile:not(.none)").evaluateAll((els) => els.map((e) => ({ rank: Number((e.querySelector("small")!.textContent ?? "").replace(/\D/g, "")), bg: getComputedStyle(e).backgroundImage, fg: getComputedStyle(e).color })));
  expect(tiles.length).toBeGreaterThan(20);
  const best = tiles.reduce((a, b) => (b.rank < a.rank ? b : a)), worst = tiles.reduce((a, b) => (b.rank > a.rank ? b : a));
  expect(best.bg).not.toBe(worst.bg);
  const rgb = (s: string) => (s.match(/rgb\((\d+), (\d+), (\d+)\)/) ?? []).slice(1, 4).map(Number);
  const [br, bg_, bb] = rgb(best.bg), [wr, wg, wb] = rgb(worst.bg);
  expect(bg_, "the best tile is greener than red").toBeGreaterThan(br);
  expect(wr, "the worst tile is redder than green").toBeGreaterThan(wg);
  expect(best.fg).toBe("rgb(255, 255, 255)"); expect(worst.fg).toBe("rgb(255, 255, 255)");
  void bb; void wb;
});

test("a column header sorts by that column, best first; clicking it again reverses; the standings position stays with each team", async ({ page }) => {
  await open(page);
  const standings = await order(page);
  const pos = async () => page.locator("[data-testid=an-table] tbody tr .an-num").allInnerTexts();
  expect(await pos()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  await expect(header(page, /^#/)).toHaveAttribute("aria-sort", "ascending");

  // goal differential: best (highest) first
  await header(page, /GOAL DIFF/).getByRole("button").click();
  await expect(header(page, /GOAL DIFF/)).toHaveAttribute("aria-sort", "descending");
  const gd = (await column(page, "gd")).map(num);
  expect(gd).toEqual([...gd].sort((a, b) => b - a));
  expect(await pos(), "each team keeps its standings position").not.toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  // again: reversed
  await header(page, /GOAL DIFF/).getByRole("button").click();
  await expect(header(page, /GOAL DIFF/)).toHaveAttribute("aria-sort", "ascending");
  const gdUp = (await column(page, "gd")).map(num);
  expect(gdUp).toEqual([...gdUp].sort((a, b) => a - b));

  // 5v5 xG share, then GSAx, then points
  for (const [name, metric] of [[/5V5 XG/, "xg"], [/GSAX/, "gsax"]] as const) {
    await header(page, name).getByRole("button").click();
    const v = (await column(page, metric)).map(num);
    expect(v, `${metric} best first`).toEqual([...v].sort((a, b) => b - a));
  }
  await header(page, /^PTS/).getByRole("button").click();
  const pts = (await page.locator("[data-testid=an-table] tbody td.an-pts strong").allInnerTexts()).map(Number);
  expect(pts).toEqual([...pts].sort((a, b) => b - a));

  // the division rank column: 1 first
  await header(page, /DIVISION RANK/).getByRole("button").click();
  expect(await page.locator("[data-testid=an-table] tbody .an-rk b").allInnerTexts()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);

  // team: alphabetical; # puts the standings back
  await header(page, /^TEAM/).getByRole("button").click();
  const names = await page.locator("[data-testid=an-table] tbody .an-tm b").allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await header(page, /^#/).getByRole("button").click();
  expect(await order(page)).toEqual(standings);
});

test("another division can be chosen, with its own teams and title", async ({ page }) => {
  await open(page);
  const pacific = await order(page);
  await page.getByRole("group", { name: "Division" }).getByRole("button", { name: "Atlantic" }).click();
  await expect(page.locator(".an-title h3")).toHaveText("ATLANTIC DIVISION");
  await expect(page.getByTestId("an-table").locator("tbody tr")).toHaveCount(8);
  expect(await order(page)).not.toEqual(pacific);
  // the tiles' ranks are still against all the teams in the league, so Atlantic teams can hold ranks above 8
  const ranks = (await page.locator("[data-testid=an-table] .an-tile small").allInnerTexts()).map((t) => Number(t.replace(/\D/g, "")));
  expect(Math.max(...ranks)).toBeGreaterThan(8);
});

test("on a phone the page never scrolls sideways: the table scrolls inside its card, keeping the position and the team in view", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone widths");
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `page overflow at ${width}px`).toBeLessThanOrEqual(0);
    const scroller = page.locator(".an-scroll");
    expect(await scroller.evaluate((e) => e.scrollWidth > e.clientWidth), "the table scrolls inside its card").toBe(true);
    const before = await page.locator("tbody tr").first().locator(".an-team").boundingBox();
    await scroller.evaluate((e) => { e.scrollLeft = 300; });
    const after = await page.locator("tbody tr").first().locator(".an-team").boundingBox();
    expect(Math.abs(after!.x - before!.x), "the team column stays put").toBeLessThanOrEqual(1);
    // the title and legend fit the width
    for (const sel of [".an-title", ".an-legend", ".an-divs"]) {
      const b = await page.locator(sel).boundingBox();
      expect(b!.x + b!.width, `${sel} within the screen at ${width}px`).toBeLessThanOrEqual(width + 1);
    }
  }
});

test("without the MoneyPuck numbers the standings columns still show and the page says what is missing", async ({ page }) => {
  await page.route("**/moneypuck/**", (r) => r.abort());
  await page.goto("/");
  await goTo(page, "Standings");
  await page.getByRole("button", { name: /^Analytics/ }).click();
  await expect(page.getByTestId("an-table").locator("tbody tr")).toHaveCount(8);
  await expect(page.locator(".an-state")).toContainText(/MoneyPuck numbers are not available/, { timeout: 15000 });
  await expect(page.locator("[data-testid=an-table] tbody tr").first().locator(".an-pts strong")).toHaveText(/^\d+$/);
  await expect(page.locator("[data-testid=an-table] tbody td[data-metric=gd] .an-tile").first()).not.toHaveClass(/none/); // goal differential comes from the standings
  await expect(page.locator("[data-testid=an-table] tbody td[data-metric=xg] .an-tile.none").first()).toHaveText("—");
});
