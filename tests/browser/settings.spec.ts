import { expect, test, type Page } from "@playwright/test";
import { mk, mockApis, watchErrors } from "./fixtures-games";

const KEY = "iceboard-prefs-v1";
const games = [mk.upcoming(9601, "CHI", "EDM")];
const open = async (page: Page, q = "?view=settings") => {
  await mockApis(page, { games });
  await page.goto(`/${q}`);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
};
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY);

test.describe("settings", () => {
  test("sections, device-only notice and headings are present", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    for (const name of ["My NHL", "Display", "Notifications", "Application"]) await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    await expect(page.getByText("Saved on this device only")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "blocking storage" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("theme and text size apply immediately and persist across reload", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "Light" }).check();
    await page.getByRole("radio", { name: "Largest" }).check();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveAttribute("data-text", "xl");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("20px");
    expect((await stored(page)).display).toMatchObject({ theme: "light", textSize: "xl" });
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveAttribute("data-text", "xl");
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    // Dark override on a light-scheme device keeps dark surfaces.
    await page.getByRole("radio", { name: "Dark" }).check();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe("rgb(255, 255, 255)");
  });

  test("the time zone choice changes game start times", async ({ page }) => {
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(".sb-row .sb-status").first()).toBeVisible();
    await page.goto("/?view=settings");
    await page.getByLabel("Time zone").selectOption("UTC");
    await page.getByRole("radio", { name: "24-hour" }).check();
    await page.goto("/");
    await expect(page.locator(".sb-row .sb-status").first()).toHaveText(/^\d{2}:\d{2}$/);
  });

  test("favorites, players and games can be removed; picker adds favorites", async ({ page }) => {
    await page.addInitScript(([k]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ version: 1, favorites: ["EDM"], players: [{ id: 8478402, name: "Connor McDavid", team: "EDM", pos: "C" }], games: [{ id: 2025020001, season: 20252026, home: "EDM", away: "CHI", date: "2026-11-10" }] }));
    }, [KEY]);
    await open(page);
    await page.getByRole("button", { name: "Remove Edmonton Oilers from favorites" }).click();
    await expect(page.getByText("No favorite teams yet")).toBeVisible();
    await page.getByRole("button", { name: "Add favorite teams" }).click();
    const dialog = page.getByRole("dialog", { name: "Favorite teams" });
    await dialog.getByRole("checkbox", { name: /Chicago Blackhawks/ }).check();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Remove Chicago Blackhawks from favorites" })).toBeVisible();
    await page.getByRole("button", { name: "Unfollow Connor McDavid" }).click();
    await page.getByRole("button", { name: "Remove saved game CHI at EDM" }).click();
    const p = await stored(page);
    expect(p.favorites).toEqual(["CHI"]);
    expect(p.players).toEqual([]);
    expect(p.games).toEqual([]);
  });

  test("reset needs a confirmation and only clears Iceboard prefs", async ({ page }) => {
    await page.addInitScript(([k]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ version: 1, favorites: ["EDM"], display: { theme: "light" } }));
      localStorage.setItem("other-app-key", "keep");
    }, [KEY]);
    await open(page);
    await page.getByRole("button", { name: "Reset preferences" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset preferences" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await stored(page)).favorites).toEqual(["EDM"]);
    await page.getByRole("button", { name: "Reset preferences" }).click();
    await page.getByRole("dialog", { name: "Reset preferences" }).getByRole("button", { name: /Yes, reset/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(await stored(page)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("other-app-key"))).toBe("keep");
    await expect(page.getByText("No favorite teams yet")).toBeVisible();
  });

  test("blocked storage: page works and shows the notice", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
    });
    const errors = watchErrors(page);
    await open(page);
    await expect(page.getByRole("alert").filter({ hasText: "blocking storage" })).toBeVisible();
    await page.getByRole("radio", { name: "Light" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(errors).toEqual([]);
  });

  test("corrupt stored JSON recovers to defaults", async ({ page }) => {
    await page.addInitScript(([k]) => localStorage.setItem(k, "{not json"), [KEY]);
    const errors = watchErrors(page);
    await open(page);
    await expect(page.getByRole("radio", { name: "System" }).first()).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(errors).toEqual([]);
  });

  test("keyboard: radios are reachable and operable; controls are named", async ({ page }) => {
    await open(page);
    const dark = page.getByRole("radio", { name: "Dark" });
    await page.getByRole("radio", { name: "System" }).first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(dark).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const s of ["mynhl", "display", "notifications", "application"]) await expect(page.getByTestId(`settings-${s}`)).toHaveAttribute("aria-labelledby", /st-/);
  });

  test("reduce motion overrides the device setting", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await page.getByRole("radio", { name: "Reduce" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  });

  test("360px: nothing scrolls sideways, even at the largest text", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ version: 1, favorites: ["EDM", "CHI"], display: { textSize: "xl" } })), [KEY]);
    await open(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
