import { expect, test } from "@playwright/test";
import { goTo } from "./nav";

// The app follows the system appearance and contrast setting.
const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme} appearance: page, cards and text follow the system setting, with no sideways scroll`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
    await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.goto("/");
    const card = page.locator(".game-card").first();
    await expect(card).toBeVisible();
    const colors = await page.evaluate(() => ({
      page: getComputedStyle(document.documentElement).backgroundColor,
      text: getComputedStyle(document.querySelector(".matchup-team h3")!).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(colors.scheme).toBe(scheme);
    if (scheme === "light") { expect(lum(colors.page)).toBeGreaterThan(0.6); expect(lum(colors.text)).toBeLessThan(0.2); }
    else { expect(lum(colors.page)).toBeLessThan(0.05); expect(lum(colors.text)).toBeGreaterThan(0.5); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    for (const view of ["Team trends", "NHL+", "Standings"]) {
      await goTo(page, view);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), view).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
}

test("increased contrast makes secondary text stronger", async ({ page }) => {
  const readMuted = async (contrast: "no-preference" | "more") => {
    await page.emulateMedia({ colorScheme: "dark", contrast });
    await page.goto("/");
    await expect(page.locator(".game-card").first()).toBeVisible();
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-1").trim());
  };
  const standard = await readMuted("no-preference");
  const more = await readMuted("more");
  expect(more).not.toBe(standard);
  const l = (hex: string) => lum(`${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`);
  expect(l(more)).toBeGreaterThan(l(standard));
});
