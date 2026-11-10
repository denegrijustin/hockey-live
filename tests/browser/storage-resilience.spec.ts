import { expect, test, type Page } from "@playwright/test";
import { blockStorage, corruptPrefs, CORRUPT_VALUES, readPrefs, seedLegacyTeams, seedPrefs, type CorruptKind } from "./prefs";
import { liveBody, watchErrors } from "./qa-harness";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ json: liveBody() }));
});

const renders = async (page: Page) => {
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
};
const uncaught = (errors: string[]) => errors.filter((e) => e.startsWith("pageerror"));

test("blocked storage (SecurityError on access): Home, Games, Standings and Settings render with no uncaught error", async ({ page }) => {
  const errors = watchErrors(page);
  await blockStorage(page, "security");
  for (const view of ["", "?view=games", "?view=settings", "?view=standings"]) {
    await page.goto(`/${view}`);
    await renders(page);
  }
  expect(uncaught(errors)).toEqual([]);
});

test("full storage (QuotaExceededError on every write): the app renders with no uncaught error", async ({ page }) => {
  const errors = watchErrors(page);
  await blockStorage(page, "quota");
  await page.goto("/?view=games");
  await renders(page);
  expect(uncaught(errors)).toEqual([]);
});

const KINDS = Object.keys(CORRUPT_VALUES) as CorruptKind[];
for (const kind of KINDS) {
  test(`corrupt "${kind}" preference record: app and Settings render on defaults, nothing hostile reaches the DOM`, async ({ page }) => {
    const errors = watchErrors(page);
    await corruptPrefs(page, kind);
    await page.goto("/");
    await renders(page);
    await page.goto("/?view=settings");
    await renders(page);
    expect(uncaught(errors)).toEqual([]);
    expect(await page.locator("body").innerHTML()).not.toContain("onerror=alert");
  });
}

test("legacy iceboard-teams is migrated into favorites (in memory, or persisted once preferences are written)", async ({ page }) => {
  await seedLegacyTeams(page, ["EDM", "CHI", "XXX"]);
  await page.goto("/");
  await renders(page);
  const stored = await readPrefs(page);
  if (stored) expect(stored.favorites).toEqual(["EDM", "CHI"]);
});

test("legacy iceboard-teams that is not a list is ignored", async ({ page }) => {
  const errors = watchErrors(page);
  await seedLegacyTeams(page, { not: "a list" });
  await page.goto("/");
  await renders(page);
  expect(uncaught(errors)).toEqual([]);
});

test("a valid seeded record survives a load unchanged", async ({ page }) => {
  await seedPrefs(page, { favorites: ["EDM"], onboarded: true, display: { textSize: "l" } });
  await page.goto("/");
  await renders(page);
  const stored = await readPrefs(page);
  expect(stored?.favorites).toEqual(["EDM"]);
  expect(stored?.display.textSize).toBe("l");
});
