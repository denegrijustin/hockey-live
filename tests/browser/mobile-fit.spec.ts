import { expect, test } from "@playwright/test";

const views = ["scoreboard", "games", "yesterday", "teamschedule", "injuries", "picks", "standings", "trends", "players", "nhlplus", "edge", "odds", "map"];

/** Anything that scrolls sideways by itself: an element that is wider than its box and lets you scroll to the rest. */
const sidewaysScrollers = () => [...document.querySelectorAll("*")].filter((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== "none").map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(" ")[0]}`);

test.describe("a phone never scrolls sideways", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const view of views) {
    test(`${view}: nothing scrolls left or right`, async ({ page }) => {
      await page.goto(`/?view=${view}`);
      await page.waitForTimeout(1800);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
      expect(await page.evaluate(sidewaysScrollers)).toEqual([]);
    });
  }

  test("standings: one record column, abbreviations, the entry-line gap under the team, in every grouping", async ({ page }) => {
    await page.goto("/?view=standings");
    await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
    const heads = await page.locator("thead th:visible").allInnerTexts();
    const names = heads.map((h) => h.trim().toUpperCase());
    expect(names).toEqual(expect.arrayContaining(["RANK", "TEAM", "GP", "W–L–OT", "PTS", "PTS %", "GD"]));
    expect(names).not.toContain("DIVISION");
    expect(await page.locator("tbody tr:first-child .st-abbr").first().isVisible()).toBe(true);
    await expect(page.locator("tbody tr:first-child .st-sub").first()).toContainText("line");
    for (const group of ["conference", "division"]) {
      await page.getByLabel("Group standings").selectOption(group);
      expect(await page.evaluate(sidewaysScrollers)).toEqual([]);
    }
    await page.getByLabel("Standings view").selectOption("projected");
    expect(await page.evaluate(sidewaysScrollers)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  });

  test("a wide stat table becomes cards with labelled numbers and a Sort by menu", async ({ page }) => {
    await page.goto("/?view=nhlplus");
    const row = page.locator(".np-table tbody tr").first();
    await row.waitFor({ timeout: 30000 });
    await expect(row.locator("td[data-label]").first()).toBeVisible();
    expect(await row.locator("td[data-label]").count()).toBeGreaterThan(5);
    const sort = page.getByLabel("Sort by").first();
    await expect(sort).toBeVisible();
    const before = await page.locator(".np-table tbody tr").first().innerText();
    const options = await sort.locator("option").allInnerTexts();
    await sort.selectOption({ index: Math.min(3, options.length - 1) });
    await expect.poll(() => page.locator(".np-table tbody tr").first().innerText()).not.toBe(before);
  });
});

test("the desktop tables keep their ordinary table layout", async ({ page }, info) => {
  test.skip(!!info.project.use.isMobile, "desktop only");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=standings");
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
  const heads = await page.locator("thead th:visible").allInnerTexts();
  expect(heads.map((h) => h.trim().toUpperCase())).toEqual(expect.arrayContaining(["DIVISION", "W", "L", "OT", "LAST 5", "ENTRY-LINE GAP"]));
  await expect(page.locator(".stk-sort")).toBeHidden();
});
