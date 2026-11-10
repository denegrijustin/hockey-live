import { expect, test } from "@playwright/test";
import { SEASON, mk, mockApis, type FxGame } from "./fixtures-games";

// Written against docs/phase2-contracts.md (matchupInsights + InsightLine on GameCardView). fixme until Agents 2 and 4 are integrated.
const WAIT = "needs Phase 2 matchupInsights (Agent 4) rendered by GameCardView/InsightLine (Agent 2)";
const insight = '[data-testid="insight-line"], .insight-line';

/** A season of past finals so teams have 12+ games played (insights need a sample), then today's game CHI at EDM. */
function history(n: number, type = 2): FxGame[] {
  const out: FxGame[] = [];
  for (let i = 0; i < n; i++) {
    out.push(mk.final(9000 + i * 2, "CHI", "BOS", { offset: -(n - i) - 1, score: [i % 3 === 0 ? 1 : 4, 2], type }));
    out.push(mk.final(9001 + i * 2, "EDM", "TOR", { offset: -(n - i) - 1, score: [i % 3 === 0 ? 1 : 5, 2], type }));
  }
  return out;
}

test.describe("home insights", () => {
  test("a card shows a reason line only when it is substantiated (gp >= 10)", async ({ page }) => {
    test.fixme(true, WAIT);
    await mockApis(page, { games: [...history(14), mk.upcoming(9990, "CHI", "EDM")] });
    await page.goto("/");
    const card = page.locator('.sb-row[data-game="9990"]');
    await expect(card).toBeVisible();
    // At most one reason line on the card headline; it names a concrete number.
    expect(await card.locator(insight).count()).toBeLessThanOrEqual(1);
    if (await card.locator(insight).count()) await expect(card.locator(insight)).toHaveText(/\d/);
  });

  test("no reason line for a team with fewer than 10 games played", async ({ page }) => {
    test.fixme(true, WAIT);
    await mockApis(page, { games: [...history(4), mk.upcoming(9990, "CHI", "EDM")] });
    await page.goto("/");
    await expect(page.locator('.sb-row[data-game="9990"]')).toBeVisible();
    await expect(page.locator('.sb-row[data-game="9990"]').locator(insight)).toHaveCount(0);
  });

  test("no reason line in preseason, even with many games", async ({ page }) => {
    test.fixme(true, WAIT);
    await mockApis(page, { games: [...history(14, 1), { ...mk.upcoming(9990, "CHI", "EDM"), type: 1 }] });
    await page.goto("/");
    await expect(page.locator('.sb-row[data-game="9990"]')).toBeVisible();
    await expect(page.locator('.sb-row[data-game="9990"]').locator(insight)).toHaveCount(0);
  });

  test("insight links point at a real view or open the Game Center", async ({ page }) => {
    test.fixme(true, WAIT);
    await mockApis(page, { games: [...history(14), mk.upcoming(9990, "CHI", "EDM")] });
    await page.goto("/");
    const links = page.locator(`.sb-row[data-game="9990"] ${insight} a[href]`);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) expect(href).toMatch(new RegExp(`\\?view=\\w+|#`));
    expect(SEASON).toBeTruthy();
  });

  test("only the first insight is on the card; the rest live in the why popover or Game Center", async ({ page }) => {
    test.fixme(true, WAIT);
    await mockApis(page, { games: [...history(14), mk.upcoming(9990, "CHI", "EDM")] });
    await page.goto("/");
    await expect(page.locator('.sb-row[data-game="9990"]').locator(insight)).toHaveCount(1);
  });
});
