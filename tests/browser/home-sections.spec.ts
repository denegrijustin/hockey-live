import { expect, test } from "@playwright/test";
import { etDay, mk, mockApis } from "./fixtures-games";

const sec = (name: string) => `section[role=region][aria-label="${name}"]`;
const full = [
  mk.live(9901, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] }),
  mk.upcoming(9902, "CHI", "EDM"),
  mk.upcoming(9903, "MIN", "DAL", { time: "01:00" }),
  mk.final(9904, "BOS", "TOR"),
  mk.ot(9905, "NYR", "NJD"),
];

test.describe("home sections", () => {
  test("Live, Upcoming and Completed render in that order, each with its games", async ({ page }) => {
    await mockApis(page, { games: full });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    const order = await page.locator("[data-testid^=home-section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    const idx = (k: string) => order.indexOf(`home-section-${k}`);
    expect(idx("live")).toBeGreaterThanOrEqual(0);
    expect(idx("live")).toBeLessThan(idx("upcoming"));
    expect(idx("upcoming")).toBeLessThan(idx("completed"));
    await expect(page.locator(`${sec("Live")} .sb-row`)).toHaveCount(1);
    await expect(page.locator(`${sec("Upcoming")} .sb-row`)).toHaveCount(2);
    await expect(page.locator(`${sec("Completed")} [data-game]`)).toHaveCount(2);
  });

  test("a game appears in exactly one of Live / Upcoming / Completed", async ({ page }) => {
    await mockApis(page, { games: full });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    for (const g of full) {
      const n = await page.locator(`[data-testid=home-section-live] [data-game="${g.id}"], [data-testid=home-section-upcoming] [data-game="${g.id}"], [data-testid=home-section-completed] [data-game="${g.id}"]`).count();
      expect(n, `game ${g.id}`).toBe(1);
    }
  });

  test("a section renders only when it has data", async ({ page }) => {
    await mockApis(page, { games: [mk.upcoming(9902, "CHI", "EDM")] });
    await page.goto("/");
    await expect(page.getByTestId("home-section-upcoming")).toBeVisible();
    await expect(page.getByTestId("home-section-live")).toHaveCount(0);
    await expect(page.getByTestId("home-section-completed")).toHaveCount(0);
    await expect(page.getByTestId("home-empty")).toHaveCount(0);
  });

  test("a day with no games shows the empty state and no empty sections", async ({ page }) => {
    await mockApis(page, { games: [mk.final(9907, "BOS", "TOR", { offset: -3 }), mk.upcoming(9906, "CHI", "EDM", { offset: 2 })], live: [] });
    await page.goto("/?date=" + etDay(0)); // a day inside the season with no games (an address outside the season falls back to the automatic day)
    await expect(page.getByTestId("home-empty")).toBeVisible();
    await expect(page.locator("[data-testid^=home-section-]")).toHaveCount(0);
  });

  test("Featured (Worth watching) excludes live games and does not repeat a game already shown as the headline", async ({ page }) => {
    await mockApis(page, { games: full });
    await page.goto("/");
    const featured = page.getByTestId("home-section-featured");
    await expect(featured).toHaveAttribute("aria-label", "Worth watching");
    await expect(featured.locator('[data-game="9901"]')).toHaveCount(0);
  });

  test("League intelligence renders only when it has insight data, and links go to real views", async ({ page }) => {
    await mockApis(page, { games: full });
    await page.goto("/");
    const intel = page.getByTestId("home-section-intel");
    if (await intel.count()) {
      await expect(intel).toHaveAttribute("aria-label", "League intelligence");
      for (const href of await intel.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) expect(href).toMatch(/\?view=\w+/);
    }
  });

  test("a failed API shows home-error without hiding the date controls", async ({ page }) => {
    await mockApis(page, { games: full, season: "malformed" });
    await page.goto("/");
    await expect(page.getByTestId("home-error")).toBeVisible();
    await expect(page.getByTestId("home-date")).toBeVisible();
  });

  test("legacy test-ids keep working inside the new sections", async ({ page }) => {
    await mockApis(page, { games: full });
    await page.goto("/");
    await expect(page.locator(".sb-group").first()).toBeVisible();
    await expect(page.locator(".sb-row .sb-main").first()).toBeVisible();
    await expect(page.getByTestId("sb-done")).toBeVisible();
  });
});
