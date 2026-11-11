import { expect, test, type Page } from "@playwright/test";
import teams from "../../src/data/teams.json" with { type: "json" };
import { mk, mockApis, type FxGame } from "./fixtures-games";
import { seedPrefs } from "./prefs";

// Favorite teams: the star toggle, persistence, the standings marker, onboarding, and the no-favorites league-wide default.
const ids = (teams as { id: string }[]).map((t) => t.id);
let gid = 9000;
const games: FxGame[] = ids.flatMap((t, i) => {
  const o = ids[(i + 1) % 32];
  return [mk.final(++gid, o, t, { offset: -2, score: [1, 3] }), mk.upcoming(++gid, t, o, { offset: 1 })];
});
const prefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("iceboard-prefs-v1") ?? "null"));

test.beforeEach(async ({ page }) => { await mockApis(page, { games }); });

test("star a team on its page: pressed state, persists after a reload, and removing works", async ({ page }) => {
  await seedPrefs(page, {});
  await page.goto("/?view=teams&team=EDM");
  const add = page.getByRole("button", { name: "Add Edmonton Oilers to favorites" });
  await expect(add).toHaveAttribute("aria-pressed", "false");
  const box = await add.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await add.click();
  await expect(page.getByRole("button", { name: "Remove Edmonton Oilers from favorites" })).toHaveAttribute("aria-pressed", "true");
  expect((await prefs(page)).favorites).toEqual(["EDM"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Edmonton Oilers from favorites" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Edmonton Oilers from favorites" }).click();
  await expect(page.getByRole("button", { name: "Add Edmonton Oilers to favorites" })).toBeVisible();
  expect((await prefs(page)).favorites).toEqual([]);
});

test("a favorite is marked in Standings with accessible text, and leads the Teams directory", async ({ page }) => {
  await seedPrefs(page, { favorites: ["FLA"] });
  await page.goto("/?view=standings");
  const row = page.locator('tr[data-team="FLA"]');
  await expect(row).toHaveClass(/highlighted/);
  await expect(row.locator(".fav-mark")).toHaveCount(1);
  await expect(row).toContainText("Favorite");
  await expect(page.locator('tr[data-team="BOS"] .fav-mark')).toHaveCount(0);
  await page.goto("/?view=teams");
  await expect(page.locator('.tm-group[aria-label="My teams"] .tm-card')).toHaveCount(1);
});

test("with no favorites the Games view is the whole league; favorites default the filter and All 32 is one tap", async ({ page }) => {
  await seedPrefs(page, {});
  await page.goto("/?view=games");
  await expect(page.locator("main#main")).toContainText("32 selected teams");
  const p2 = await page.context().newPage();
  await mockApis(p2, { games });
  await p2.addInitScript(() => localStorage.setItem("iceboard-prefs-v1", JSON.stringify({ version: 1, onboarded: true, favorites: ["EDM", "FLA"] })));
  await p2.goto("/?view=games");
  await expect(p2.locator("main#main")).toContainText("2 selected teams");
  const all = p2.getByRole("button", { name: "All 32", exact: true });
  if (await all.isVisible()) await all.click();
  else { await p2.getByRole("button", { name: "Choose teams" }).click(); await p2.locator("dialog.sheet").getByRole("button", { name: "All 32", exact: true }).click(); await p2.locator("dialog.sheet").getByRole("button", { name: "Done" }).click(); }
  await expect(p2.locator("main#main")).toContainText("32 selected teams");
});

test.describe("onboarding", () => {
  test("a first visit sees a small banner that never blocks scores; Skip dismisses it for good", async ({ page }) => {
    await page.goto("/");
    const ob = page.getByTestId("onboarding");
    await expect(ob).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await ob.getByRole("button", { name: "Skip" }).click();
    await expect(ob).toHaveCount(0);
    expect((await prefs(page)).onboarded).toBe(true);
    await page.reload();
    await expect(page.locator("main#main h1").first()).toBeVisible();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
  });

  test("Pick teams opens the grid of 32; selecting all 32 and Done saves them and never reprompts", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("onboarding").getByRole("button", { name: "Pick teams" }).click();
    const sheet = page.locator("dialog.sheet");
    await expect(sheet.locator(".ob-grid button")).toHaveCount(32);
    for (const b of await sheet.locator(".ob-grid button").all()) await b.click();
    await expect(sheet.locator('.ob-grid button[aria-pressed="true"]')).toHaveCount(32);
    await sheet.locator(".ob-actions").getByRole("button", { name: "Done" }).click();
    const p = await prefs(page);
    expect(p.favorites).toHaveLength(32);
    expect(p.onboarded).toBe(true);
    await page.reload();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
  });

  test("the picker stays reachable later from the Teams view", async ({ page }) => {
    await seedPrefs(page, {});
    await page.goto("/?view=teams");
    await page.getByRole("button", { name: "Pick favorites" }).click();
    await expect(page.locator("dialog.sheet")).toBeVisible();
    await page.locator("dialog.sheet .ob-grid button").first().click();
    await page.locator(".ob-actions").getByRole("button", { name: "Done" }).click();
    expect((await prefs(page)).favorites).toHaveLength(1);
  });
});

test("360px: Home banner, Teams stars and Standings do not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of ["/", "/?view=teams", "/?view=standings", "/?view=teams&team=EDM"]) {
    await page.goto(url);
    await page.locator("main#main h1").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
