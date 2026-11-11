import { gcTab } from "./nav";
import { test, expect } from "@playwright/test";
import { selectAllTeams } from "./controls";
test("rank line, crossover comparison at 320px, team swapping and ESPN link", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/espn/*", (route) =>
    route.fulfill({ json: { date: "x", games: {} } }),
  );
  await page.goto("/?view=games");
  await selectAllTeams(page);
  // The current season may still be preseason (no standings yet, so no ranks).
  await page.getByLabel("Season", { exact: true }).selectOption("20252026");
  const card = page.locator(".game-card").first();
  await expect(card.locator(".team-rank")).toHaveCount(2);
  await expect(card.locator(".team-rank").first()).toContainText("by points %");
  await card.getByRole("button", { name: /Open Game Center for/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  await gcTab(page, "Team Stats");
  const cmp = dialog.locator(".matchup-comparison");
  await expect(cmp.locator(".crossover-row").first()).toBeVisible();
  // One view at a time: offense against defense, and Swap sides is the way to the other direction.
  await expect(cmp.locator(".crossover")).toHaveCount(1);
  const firstView = await cmp.locator(".crossover").getAttribute("aria-label");
  await expect(cmp).toContainText("Rank comparisons, not predictions");
  const before = await cmp.locator(".comparison-title h3").innerText();
  await cmp.getByRole("button", { name: /Swap sides/ }).click();
  await expect(cmp.locator(".comparison-title h3")).not.toHaveText(before);
  await expect(cmp.locator(".crossover")).toHaveCount(1);
  expect(await cmp.locator(".crossover").getAttribute("aria-label")).not.toBe(firstView);
  await expect(cmp.locator(".comparison-title h3")).toContainText(/offense vs\. .* defense/);
  const left = await cmp.locator(".metric-offense").first().boundingBox();
  const right = await cmp.locator(".metric-defense").first().boundingBox();
  expect(left!.x).toBeLessThan(right!.x);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const link = page.locator(".game-card a.network-logo-link").first();
  if (await link.count()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("href", /^https:\/\/www\.espn\.com\/nhl\/(schedule\/_\/date|game\/_\/gameId)\//);
  }
});

for (const width of [320, 390, 1280]) {
  test(`no gauge caption text overlaps in the Game Center at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/espn/*", (route) => route.fulfill({ json: { date: "x", games: {} } }));
    await page.goto("/?view=games");
    await selectAllTeams(page);
    await page.getByLabel("Season", { exact: true }).selectOption("20252026");
    await page.locator(".game-card").first().getByRole("button", { name: /Open Game Center for/ }).click();
    const dialog = page.locator("dialog.game-dialog");
    await gcTab(page, "Team Stats");
    if (width <= 620) await expect(dialog.locator(".crossover-row .gap-bar").first()).toBeVisible(); // phone: the 86px dial is replaced by an inline split bar
    else await expect(dialog.locator(".crossover-row .gauge").first()).toBeVisible();
    await expect(dialog.locator(".crossover-row .gauge")).not.toHaveCount(0);
    await page.addStyleTag({ content: "dialog.game-dialog, dialog.game-dialog * { font-family: 'DejaVu Sans', Verdana, sans-serif !important; }" }); // a wide system font, as on a Mac or Windows machine
    await page.waitForTimeout(300);
    const overlaps = await dialog.locator(".gauge").evaluateAll((figures) => {
      const hits: string[] = [];
      for (const f of figures) {
        const boxes = [...f.querySelectorAll("figcaption b, figcaption i, figcaption .gauge-label")].filter((e) => e.getClientRects().length > 0).map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          if (a.width && b.width && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) hits.push(`${boxes[i].t} | ${boxes[j].t}`);
        }
      }
      return hits;
    });
    expect(overlaps).toEqual([]);
  });
}
