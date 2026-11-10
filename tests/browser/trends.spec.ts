import { expect, test, type Page } from "@playwright/test";
import { mk, mockApis, watchErrors } from "./fixtures-games";

// TOR (all home): W W L L. ANA: L W W OTL W. One meeting (ANA won at TOR); a postponed rematch is ignored. Every game is a past final; the ANA at TOR game today is the one that opens.
const past = [
  mk.final(9701, "BOS", "TOR", { offset: -9, score: [1, 3] }),
  mk.final(9702, "MTL", "TOR", { offset: -8, score: [2, 4] }),
  mk.final(9703, "ANA", "TOR", { offset: -7, score: [2, 1] }),
  mk.final(9704, "OTT", "TOR", { offset: -6, score: [3, 2] }),
  mk.final(9705, "ANA", "SEA", { offset: -9, score: [1, 2] }),
  mk.final(9706, "ANA", "LAK", { offset: -8, score: [3, 1] }),
  mk.ot(9707, "VAN", "ANA", { offset: -6, score: [3, 2] }),
  mk.final(9708, "ANA", "CGY", { offset: -5, score: [4, 1] }),
  mk.postponed(9709, "TOR", "ANA", { offset: -4 }),
];
const today = mk.upcoming(9710, "ANA", "TOR", { offset: 0, time: "23:30" });

async function open(page: Page) {
  await mockApis(page, { games: [...past, today], live: [] });
  for (const p of ["**/api/league-matchups/**", "**/data/league-matchups/**"]) await page.route(p, (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.goto("/");
  await page.locator(`.sb-row[data-game="${today.id}"] .sb-main`).click();
  const dialog = page.locator("dialog.game-dialog");
  await dialog.locator("summary", { hasText: "Form and matchup lens" }).click();
  return dialog;
}

test("the matchup lens states each fact with its numbers and sample, nothing predictive", async ({ page }) => {
  const errors = watchErrors(page);
  const dialog = await open(page);
  const lens = dialog.locator(".tr-lens");
  await expect(lens).toBeVisible();
  await expect(lens.locator('[data-lens="form"]')).toContainText(/Ducks are 3-1-1 over their last 5 games; Maple Leafs are 2-2-0 over their last 4/);
  await expect(lens.locator('[data-lens="goal-diff"]')).toContainText("Goal difference per game");
  await expect(lens.locator('[data-lens="home-away"]')).toContainText("Maple Leafs are 2-2-0 at home; Ducks are 3-1-0 on the road");
  await expect(lens.locator('[data-lens="series"]')).toContainText("Ducks lead the season series 1-0");
  await expect(lens.locator('[data-lens="series"] small')).toHaveText("1 meeting");
  await expect(lens.locator('[data-lens^="st-"]')).toHaveCount(0); // no special-teams data was served, so none is invented
  await expect(lens).toContainText("not a prediction");
  expect(errors).toEqual([]);
});

test("the lens fits without sideways scroll at 360px and desktop width", async ({ page }) => {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const dialog = await open(page);
    await expect(dialog.locator(".tr-lens li").first()).toBeVisible();
    const over = await page.evaluate(() => {
      const d = document.querySelector("dialog.game-dialog") as HTMLElement;
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, dialog: d.scrollWidth - d.clientWidth };
    });
    expect(over.page).toBeLessThanOrEqual(0);
    expect(over.dialog).toBeLessThanOrEqual(0);
    await page.goto("about:blank");
  }
});

test("works in the light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const dialog = await open(page);
  const li = dialog.locator(".tr-lens li").first();
  await expect(li).toBeVisible();
  const [bg, fg] = await li.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
  expect(bg).not.toBe(fg);
});
