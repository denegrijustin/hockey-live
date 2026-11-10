import { test, expect, type Page } from "@playwright/test";

const open = async (page: Page) => {
  await page.goto("/?view=standings");
  await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
};
const rows = (page: Page) => page.locator("tr[data-team]");
const group = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });

test.describe("desktop switcher", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("each view renders its row counts", async ({ page }) => {
    await open(page);
    await expect(rows(page)).toHaveCount(32);
    await group(page, "Eastern").click();
    await expect(rows(page)).toHaveCount(16);
    await expect(page.getByRole("heading", { name: "Eastern Conference" })).toBeVisible();
    await group(page, "Western").click();
    await expect(rows(page)).toHaveCount(16);
    await group(page, "Divisions").click();
    await expect(page.locator("table.standings-table")).toHaveCount(4);
    await expect(page.locator("table.standings-table tbody tr")).toHaveCount(32);
    await group(page, "Wild Card").click();
    await expect(page.locator("table.st-wc")).toHaveCount(2);
    await expect(rows(page)).toHaveCount(32);
    await expect(page.locator(".st-cut")).toHaveCount(2);
    await expect(page.getByText("Outside the picture").first()).toBeVisible();
    for (const t of await page.locator("table.st-wc").all()) {
      await expect(t.locator(".st-block-div tr[data-team]")).toHaveCount(6);
      await expect(t.locator(".st-block-wc tr[data-team]")).toHaveCount(2);
      await expect(t.locator(".st-block-out tr[data-team]")).toHaveCount(8);
    }
  });

  test("P%, DIFF and order follow the points, and the badge names the mode", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("mode-badge")).toHaveText("Current: from completed games");
    const heads = (await page.locator("thead").first().locator("th").allInnerTexts()).map((h) => h.trim());
    const col = (n: string) => heads.indexOf(n);
    const data = await rows(page).evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "")));
    let last = Infinity;
    for (const d of data) {
      const gp = Number(d[col("GP")]), pts = Number(d[col("PTS")]), p = d[col("P%")];
      if (gp > 0) {
        expect(p).toBe(((pts / (2 * gp)) * 100).toFixed(1) + "%");
        expect(Number(p.replace("%", ""))).toBeLessThanOrEqual(last + 0.05);
        last = Number(p.replace("%", ""));
      } else expect(p).toBe("—");
      expect(d[col("DIFF")]).toMatch(/^[+−-]?\d+$/);
      expect(d[col("L10")].length).toBeGreaterThan(0);
      expect(d[col("STRK")]).toMatch(/^(—|(W|L|OT)\d+)$/);
    }
    await page.getByRole("radio", { name: "Projected" }).click();
    await expect(page.getByTestId("mode-badge")).toHaveText("Projected: pace estimate, not odds");
    await expect(page.getByRole("columnheader", { name: "Projected PTS" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Playoff odds" }).first()).toBeVisible();
    await group(page, "Wild Card").click();
    await expect(page.getByTestId("mode-badge")).toContainText("Projected");
    await expect(page.getByRole("heading", { name: /projected picture/ })).toHaveCount(2);
  });

  test("the switcher works from the keyboard and stays in step with the select", async ({ page }) => {
    await open(page);
    await group(page, "League").focus();
    await page.keyboard.press("ArrowRight");
    await expect(group(page, "Eastern")).toBeChecked();
    await expect(group(page, "Eastern")).toBeFocused();
    await expect(rows(page)).toHaveCount(16);
    await page.keyboard.press("ArrowLeft");
    await expect(group(page, "League")).toBeChecked();
    await page.getByLabel("Group standings").selectOption("wildcard");
    await expect(group(page, "Wild Card")).toBeChecked();
  });

  test("a team opens its profile and the Resumés tab still works", async ({ page }) => {
    await open(page);
    await rows(page).first().locator("[data-team-link]").click();
    await expect(page.locator("dialog.team-dialog[open]")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Resumés/ }).click();
    await expect(page.locator(".rs-row")).toHaveCount(32);
    await page.getByRole("button", { name: "Standings table" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(32);
  });
});

for (const width of [360, 390]) {
  test.describe(`phone ${width}`, () => {
    test.use({ viewport: { width, height: 800 } });
    test("compact table keeps STRK, shows the group select, never scrolls sideways", async ({ page }) => {
      await open(page);
      const heads = (await page.locator("thead th:visible").allInnerTexts()).map((h) => h.trim().toUpperCase());
      expect(heads).toEqual(expect.arrayContaining(["RANK", "TEAM", "GP", "W–L–OTL", "PTS", "P%", "DIFF", "STRK"]));
      expect(heads).not.toContain("LAST 5");
      await expect(page.locator("tr[data-team] .st-strk").first()).toBeVisible();
      // Nothing is clipped by the panel: every visible header sits fully inside the viewport.
      const right = await page.locator("thead th:visible").evaluateAll((ths) => Math.max(...ths.map((t) => t.getBoundingClientRect().right)));
      expect(right).toBeLessThanOrEqual(width);
      for (const g of ["conference", "division", "wildcard"]) {
        await page.getByLabel("Group standings").selectOption(g);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        const edge = await page.locator("thead th:visible").evaluateAll((ths) => Math.max(...ths.map((t) => t.getBoundingClientRect().right)));
        expect(edge, g).toBeLessThanOrEqual(width);
      }
      await page.getByLabel("Standings view").selectOption("projected");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await expect(page.locator(".st-cut").first()).toBeVisible();
    });
  });
}
