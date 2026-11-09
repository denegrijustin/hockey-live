import type { Page } from "@playwright/test";

/** Opens a dashboard view by name. A visible primary button (tab bar or desktop sidebar) is clicked directly; otherwise the view lives in the More sheet, where each item's name is "<Label> <hint>", so it is matched by its label. */
export async function goTo(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  const direct = nav.getByRole("button", { name, exact: true });
  if (await direct.first().isVisible().catch(() => false)) {
    await direct.first().click();
    return;
  }
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog", { name: "More" }).locator("button.menu-item").filter({ has: page.locator("b", { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).click();
}

/** Opens the league-wide list of all games (with its filters and search). */
export async function goToAllGames(page: Page) {
  await goTo(page, "Games");
}
