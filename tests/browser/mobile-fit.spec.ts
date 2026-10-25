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

  test("NHL+ opens with its header folded into one line, so the content starts high on the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/?view=nhlplus");
    const nav = page.getByRole("navigation", { name: "NHL+ views" });
    await expect(nav).toBeVisible({ timeout: 30000 });
    // One view button and Refresh, not seven tabs on two rows.
    await expect(nav.getByRole("button", { name: "Teams", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Matchups", exact: true })).toBeHidden();
    await page.locator(".np-panel").first().waitFor({ timeout: 30000 });
    const top = await page.locator(".np-panel").first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
    expect(top).toBeLessThan(430);
    // Tapping the current view opens the others, and picking one switches and folds it away again.
    await nav.getByRole("button", { name: "Teams", exact: true }).click();
    await expect(nav.getByRole("button", { name: "Goalies", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Goalies", exact: true }).click();
    await expect(nav.getByRole("button", { name: "Goalies", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(nav.getByRole("button", { name: "Matchups", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Check MoneyPuck for new data" })).toBeVisible();
    // The team picker is not repeated above a view that has its own team controls.
    await expect(page.locator(".phone-controls")).toHaveCount(0);
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

test("Team trends with every team chosen shows three in colour and the rest in grey, with a short legend", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ids = (await (await page.request.get("/data/teams.json")).json()).map((t: { id: string }) => t.id);
  await page.addInitScript((all) => localStorage.setItem("iceboard-teams", JSON.stringify(all)), ids);
  await page.goto("/?view=trends");
  await expect(page.getByTestId("chart-crowd")).toBeVisible({ timeout: 30000 });
  expect(await page.locator(".chart-legend > span").count()).toBeLessThanOrEqual(3);
  const colours = await page.locator(".chart-wrap polyline").evaluateAll((els) => new Set(els.map((e) => e.getAttribute("stroke"))).size);
  expect(colours).toBeLessThanOrEqual(5); // three team colours and the grey
});
