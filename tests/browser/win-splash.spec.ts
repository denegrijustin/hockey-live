import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";
import { seedPrefs } from "./prefs";

// An Edmonton win puts "Play La Bamba" over the game card for seven seconds, then it fades behind the score and stays there, faded.
const games = [
  mk.final(9901, "CGY", "EDM", { score: [2, 3] }), // an Oilers win
  mk.final(9902, "EDM", "VAN", { score: [1, 4] }), // an Oilers loss
  mk.final(9903, "BOS", "TOR", { score: [2, 3] }), // another team's game
  mk.final(9904, "MIN", "DAL", { score: [3, 1] }), // a Wild win
  mk.final(9905, "STL", "CHI", { score: [1, 4] }), // a Blackhawks win
];

test("an Oilers win shows the artwork for seven seconds, then it sits faded behind the card", async ({ page }) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: "no-preference" }); // the suite runs with motion off; the splash is a motion
  await seedPrefs(page, {});
  await mockApis(page, { games });
  await page.goto("/");
  const win = page.locator('[data-game="9901"] [data-testid=win-splash]');
  await expect(win).toHaveAttribute("data-phase", "splash");
  const top = win.locator(".la-top");
  await expect(top).toHaveCSS("opacity", "1");
  expect(await top.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("oilers-la-bamba");
  const started = Date.now();
  await expect(win).toHaveAttribute("data-phase", "back", { timeout: 12_000 });
  expect(Date.now() - started, "held about seven seconds").toBeGreaterThan(5_500);
  await expect(win.locator(".la-top")).toHaveCSS("opacity", "0", { timeout: 4_000 });
  const back = win.locator(".la-back");
  await expect.poll(async () => Number(await back.evaluate((e) => getComputedStyle(e).opacity)), { timeout: 4_000 }).toBeGreaterThan(0.1);
  expect(Number(await back.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.5);
  // it takes no clicks: the card still opens
  expect(await win.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
  // only the Oilers' win carries it
  await expect(page.locator('[data-game="9902"] [data-testid=win-splash]')).toHaveCount(0);
  await expect(page.locator('[data-game="9903"] [data-testid=win-splash]')).toHaveCount(0);
});

test("with reduced motion there is no splash, only the faded artwork", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedPrefs(page, {});
  await mockApis(page, { games });
  await page.goto("/");
  const win = page.locator('[data-game="9901"] [data-testid=win-splash]');
  await expect(win).toHaveAttribute("data-phase", "back");
  await expect(win.locator(".la-top")).toHaveCSS("opacity", "0");
});

test("each splash team gets its own artwork (Oilers, Wild, Blackhawks)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seedPrefs(page, {});
  await mockApis(page, { games });
  await page.goto("/");
  const wild = page.locator('[data-game="9904"] [data-testid=win-splash]');
  await expect(wild).toHaveAttribute("data-team", "MIN");
  await expect(wild).toHaveAttribute("data-phase", "splash");
  expect(await wild.locator(".la-top").evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("wild-lets-go-crazy");
  const hawks = page.locator('[data-game="9905"] [data-testid=win-splash]');
  await expect(hawks).toHaveAttribute("data-team", "CHI");
  expect(await hawks.locator(".la-top").evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("blackhawks-chelsea-dagger");
  const oil = page.locator('[data-game="9901"] [data-testid=win-splash]');
  expect(await oil.locator(".la-top").evaluate((e) => getComputedStyle(e).backgroundImage)).toContain("oilers-la-bamba");
});
