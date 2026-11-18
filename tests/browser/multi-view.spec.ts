import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";
import { seedPrefs } from "./prefs";

const games = [
  mk.live(9701, "COL", "WPG", { period: 2, clock: "10:00", score: [2, 1] }),
  mk.live(9702, "CHI", "EDM", { period: 3, clock: "05:00", score: [0, 1] }),
  mk.upcoming(9703, "MIN", "DAL", { time: "01:00" }),
];

test("multi-view: two Game Centers side by side, each scrolling on its own", async ({ page }) => {
  test.setTimeout(60_000);
  await seedPrefs(page, {});
  await mockApis(page, { games });
  await page.goto("/");
  await page.locator('.sb-row[data-game="9701"] .gc-icon').click();
  await expect(page.locator("dialog.game-dialog[open]")).toBeVisible();
  await page.getByTestId("gc-multi").click();

  // one game chosen: its pane is there, the other asks for a game
  const mv = page.getByTestId("multi-view");
  await expect(mv).toBeVisible();
  expect(page.url()).toContain("multi=9701");
  await expect(page.locator("dialog.game-dialog[open]")).toHaveCount(0); // the page's own Game Center gave way
  await expect(page.getByTestId("mv-empty")).toBeVisible();
  await page.getByTestId("mv-pick-1").selectOption("9702");
  expect(page.url()).toContain("multi=9701%2C9702");

  const f0 = page.frameLocator('[data-testid=mv-frame-0]'), f1 = page.frameLocator('[data-testid=mv-frame-1]');
  const d0 = f0.locator("dialog.game-dialog[open]"), d1 = f1.locator("dialog.game-dialog[open]");
  await expect(d0).toBeVisible({ timeout: 30_000 });
  await expect(d1).toBeVisible({ timeout: 30_000 });
  await expect(d0.getByTestId("gc-status")).toBeVisible();
  // each pane shows its own game, and can not be closed from inside
  await expect(d0).toContainText("Winnipeg");
  await expect(d1).toContainText("Edmonton");
  await expect(d0.locator(".gc-close")).toBeHidden();
  const [a, b] = [await page.getByTestId("mv-frame-0").boundingBox(), await page.getByTestId("mv-frame-1").boundingBox()];
  expect(a!.width).toBeGreaterThan(200); expect(b!.width).toBeGreaterThan(200);
  expect(a!.height).toBeGreaterThan(150); expect(b!.height).toBeGreaterThan(150);

  // independent scrolling: scroll the first down; the second stays at the top
  await d0.evaluate((el) => { el.scrollTop = 500; });
  await expect.poll(() => d0.evaluate((el) => el.scrollTop), { message: "the first pane scrolled" }).toBeGreaterThan(100);
  expect(await d1.evaluate((el) => el.scrollTop)).toBe(0);
  await d1.evaluate((el) => { el.scrollTop = 300; });
  expect(await d0.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect.poll(() => d1.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  expect(await page.evaluate(() => window.scrollY), "the page behind does not scroll").toBe(0);

  // dropping the second game leaves one pane; Escape closes the multi view
  await page.getByRole("button", { name: "Remove the second game" }).click();
  await expect(page.getByTestId("mv-empty")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mv).toHaveCount(0);
  expect(page.url()).not.toContain("multi=");
});

test("a multi-view link opens straight into two panes, and bad ids are ignored", async ({ page }) => {
  await seedPrefs(page, {});
  await mockApis(page, { games });
  await page.goto("/?multi=9701,9702,../x");
  await expect(page.getByTestId("multi-view")).toBeVisible();
  await expect(page.getByTestId("mv-frame-0")).toBeVisible();
  await expect(page.getByTestId("mv-frame-1")).toBeVisible();
  await page.getByRole("button", { name: "Close multi-view" }).click();
  await expect(page.getByTestId("multi-view")).toHaveCount(0);
});
