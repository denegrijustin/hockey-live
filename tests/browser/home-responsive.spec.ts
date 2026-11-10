import { expect, test, type Page } from "@playwright/test";
import { longName, mk, mockApis } from "./fixtures-games";

const WIDTHS = [360, 390, 768, 1024, 1440, 1920];
const games = [
  mk.upcoming(9601, longName.away, longName.home),
  mk.live(9602, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] }),
  mk.final(9603, "BOS", "TOR"),
  mk.ot(9604, "NYR", "NJD"),
  mk.upcoming(9605, "SEA", "VAN", { offset: 1 }),
  mk.upcoming(9606, "CHI", "EDM"),
];
const rects = (page: Page, root: string, parts: string[]) => page.evaluate(({ root, parts }) => {
  const out: { row: number; a: string; b: string; area: number }[] = [];
  document.querySelectorAll(root).forEach((row, i) => {
    const boxes = parts.flatMap((sel) => [...row.querySelectorAll(sel)].map((el, k) => ({ key: `${sel}#${k}`, r: el.getBoundingClientRect(), el })));
    const vis = boxes.filter((b) => b.r.width > 0 && b.r.height > 0);
    for (let x = 0; x < vis.length; x++) for (let y = x + 1; y < vis.length; y++) {
      const A = vis[x], B = vis[y];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w > 1 && h > 1) out.push({ row: i, a: A.key, b: B.key, area: Math.round(w * h) });
    }
  });
  return out;
}, { root, parts });

for (const w of WIDTHS) {
  test.describe(`width ${w}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await mockApis(page, { games });
    });

    test("Home: no horizontal page overflow, correct navigation, no overlapping card parts", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".sb-row").first()).toBeVisible();
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      expect(over.sw, "document scrollWidth").toBeLessThanOrEqual(over.cw);
      expect(over.bw, "body scrollWidth").toBeLessThanOrEqual(over.cw);
      // Sidebar from 1100 up, otherwise the bottom tab bar; never both.
      const wide = w >= 1100;
      await expect(page.locator("nav.side-nav")).toHaveCount(wide ? 1 : 0);
      await expect(page.locator("nav.tab-bar")).toHaveCount(wide ? 0 : 1);
      if (!wide) {
        const bar = (await page.locator("nav.tab-bar").boundingBox())!;
        expect(bar.y + bar.height).toBeGreaterThan(900 - 4);
        expect(bar.width).toBeGreaterThanOrEqual(w - 2);
      }
      // Within a card the status line, actions, team blocks and win probability do not overlap each other.
      expect(await rects(page, ".sb-row", [".sb-status", ".sb-actions", ".sb-team", ".sb-prob", ".sb-venue", ".sb-rate"])).toEqual([]);
      // Within a team block the name does not run over the score.
      expect(await rects(page, ".sb-row .sb-team", [".team-logo", ".sb-name", ".sb-score"])).toEqual([]);
      // Nothing inside a card sticks out of its right edge.
      const out = await page.evaluate(() => [...document.querySelectorAll(".sb-row")].flatMap((row) => {
        const R = row.getBoundingClientRect();
        return [...row.querySelectorAll(".sb-status, .sb-name, .sb-score, .sb-prob, .gc-icon")].filter((el) => el.getBoundingClientRect().right > R.right + 1).map((el) => el.className);
      }));
      expect(out).toEqual([]);
    });

    test("Home: the stepper, status chips and completed strip stay inside the viewport", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".sb-days")).toBeVisible();
      const bad = await page.evaluate(() => [...document.querySelectorAll(".sb-day, .sb-step, .sb-chip, .sb-done-chip")].filter((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((el) => el.className));
      expect(bad).toEqual([]);
    });

    test("Games: no horizontal page overflow", async ({ page }) => {
      await page.goto("/?view=games");
      await expect(page.locator(".game-card").first()).toBeVisible();
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(over.sw, "document scrollWidth").toBeLessThanOrEqual(over.cw);
      await expect(page.locator("nav.side-nav")).toHaveCount(w >= 1100 ? 1 : 0);
      await expect(page.locator("nav.tab-bar")).toHaveCount(w >= 1100 ? 0 : 1);
    });
  });
}

test.describe("long team names", () => {
  test("the longest real team names truncate inside the card at 360px instead of overflowing", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockApis(page, { games });
    await page.goto("/");
    const name = page.locator('.sb-row[data-game="9601"] .sb-name').first();
    await expect(name).toBeVisible();
    const box = (await name.boundingBox())!, row = (await page.locator('.sb-row[data-game="9601"]').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 1);
    // Both full names stay readable to assistive tech even if visually cut.
    await expect(page.locator('.sb-row[data-game="9601"] .sb-main')).toHaveAttribute("aria-label", /Columbus Blue Jackets at Vegas Golden Knights/);
  });
});
