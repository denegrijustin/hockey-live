import { expect, test } from "@playwright/test";
import { SEASON, count, etDay, mk, mockApis, watchErrors } from "./fixtures-games";

const games = [mk.upcoming(9401, "CHI", "EDM"), mk.final(9402, "BOS", "TOR"), mk.upcoming(9403, "NYR", "NJD", { offset: 1 })];

test.describe("home failure modes", () => {
  test("season API 500 falls back to the saved /data snapshot without any banner or error", async ({ page }) => {
    const errors = watchErrors(page);
    const live = [mk.live(9404, "COL", "WPG", { period: 2, clock: "10:00" })];
    const m = await mockApis(page, { games: [...games, ...live], season: "fail", live });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await expect(page.locator(".empty.error")).toHaveCount(0);
    await expect(page.locator(".status-banner")).toHaveCount(0);
    expect(count(m.log, `/api/season/${SEASON}`)).toBeGreaterThan(0);
    expect(count(m.log, `/data/seasons/${SEASON}.json`)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("/api/live 503 shows the saved-data pill and the board still renders from the snapshot", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games, live: 503 });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    const pill = page.locator(".status-banner");
    await expect(pill).toHaveAttribute("role", "status");
    await expect(pill).toContainText("Live scores unavailable. Showing saved data.");
    await expect(pill.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("/api/live recovering clears the pill on Retry", async ({ page }) => {
    test.fail(true, "DEFECT: Retry (App.refresh) only reloads the season snapshot and dispatches iceboard:refresh; useFeed('/api/live') does not listen, so the saved-data pill stays up until the next 30 s poll");
    const m = await mockApis(page, { games, live: 503 });
    await page.goto("/");
    await expect(page.locator(".status-banner")).toBeVisible();
    m.setLive([]);
    await page.locator(".status-banner").getByRole("button", { name: "Retry" }).click();
    await expect(page.locator(".status-banner")).toHaveCount(0, { timeout: 8000 });
  });

  test("malformed JSON from the season API and the saved copy shows the load error, not a crash", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games, season: "malformed" });
    await page.goto("/");
    await expect(page.locator(".empty.error")).toContainText("Unable to load data");
    await expect(page.getByRole("button", { name: /retry/i }).first()).toBeVisible();
    // The shell (navigation) is still there.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    expect(errors.filter((e) => e.startsWith("pageerror"))).toEqual([]);
  });

  test("malformed API JSON alone falls back to the good saved copy", async ({ page }) => {
    await mockApis(page, { games });
    await page.route(`**/api/season/${SEASON}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{oops" }));
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await expect(page.locator(".empty.error")).toHaveCount(0);
  });

  test("every data source failing renders the error state with working navigation and no uncaught error", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games, live: 503, season: "fail" });
    await page.route(`**/data/seasons/${SEASON}.json`, (route) => route.fulfill({ status: 500, body: "nope" }));
    await page.goto("/");
    await expect(page.locator(".empty.error")).toContainText("Unable to load data");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    expect(errors.filter((e) => e.startsWith("pageerror"))).toEqual([]);
  });

  test("a season with no games today renders the empty day, not an error", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games: [mk.final(9405, "BOS", "TOR", { offset: -3 })], live: [] });
    await page.goto("/");
    await expect(page.locator(".sb-row, .sb-done")).not.toHaveCount(0);
    await expect(page.locator(".empty.error")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(etDay(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a snapshot with zero games does not crash", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games: [], live: [] });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    expect(errors.filter((e) => e.startsWith("pageerror"))).toEqual([]);
  });

  test("a live feed row for an id that is not in the snapshot is ignored", async ({ page }) => {
    const errors = watchErrors(page);
    await mockApis(page, { games, live: [mk.live(99999, "COL", "WPG")] });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await expect(page.locator('.sb-row[data-game="99999"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
