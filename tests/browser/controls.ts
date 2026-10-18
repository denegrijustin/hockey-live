import type { Page } from "@playwright/test";

/**
 * Team and game-list controls differ by screen: phones have a Teams button and a Filters button that open sheets;
 * desktop has team pills and an inline filter panel. These helpers let a test say what it wants either way.
 */
export const isPhone = (page: Page) => page.locator(".phone-controls").isVisible().catch(() => false);
const done = (page: Page) => page.locator("dialog.sheet").getByRole("button", { name: "Done" }).click();

/** Opens the team chooser (the Teams sheet on phones, the dropdown on desktop). */
export async function openTeams(page: Page) {
  if (await isPhone(page)) await page.getByRole("button", { name: "Choose teams" }).click();
  else await page.getByText("Choose teams", { exact: false }).click();
}
export async function closeTeams(page: Page) {
  if (await isPhone(page)) await done(page);
  else await page.getByText("Choose teams", { exact: false }).click();
}
/** The number shown next to the team chooser. */
export async function teamCount(page: Page) {
  return (await isPhone(page)) ? page.locator(".phone-controls .pc-button b").first() : page.locator(".team-menu summary span");
}

async function pickTeams(page: Page, name: "All 32" | "My three") {
  if (await isPhone(page)) {
    await openTeams(page);
    await page.locator("dialog.sheet").getByRole("button", { name, exact: true }).click();
    await closeTeams(page);
  } else {
    await page.getByRole("button", { name, exact: true }).click();
  }
}
export const selectAllTeams = (page: Page) => pickTeams(page, "All 32");
export const selectMyThree = (page: Page) => pickTeams(page, "My three");

/** Opens the game filters (a sheet on phones; the inline panel is already open on desktop, and folds on narrower windows). */
export async function openFilters(page: Page) {
  if (await isPhone(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    return;
  }
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}
export async function closeFilters(page: Page) {
  if (await isPhone(page)) await done(page);
}

export interface FilterChoice {
  period?: "past" | "future";
  competition?: string;
  window?: string;
  sort?: string;
}
/** Sets any of Status, Competition, Window and Sort by, then closes the sheet if there is one. */
export async function filterGames(page: Page, choice: FilterChoice) {
  await openFilters(page);
  if (choice.period) await page.getByRole("button", { name: choice.period === "past" ? /^Past games/ : /^Upcoming/ }).click();
  if (choice.competition) await page.getByLabel("Competition").selectOption(choice.competition);
  if (choice.window) await page.getByLabel("Window").selectOption(choice.window);
  if (choice.sort) await page.getByLabel("Sort by").selectOption(choice.sort);
  await closeFilters(page);
}
/** Reads a filter's current value (Window, Sort by, Competition). */
export async function filterValue(page: Page, label: string) {
  await openFilters(page);
  const value = await page.getByLabel(label).inputValue();
  await closeFilters(page);
  return value;
}
export const showPeriod = (page: Page, period: "past" | "future") => filterGames(page, { period });

/** One tap on a featured team's pill (desktop), or the same shortcut at the top of the Teams sheet (phones). */
export async function pickOnlyTeam(page: Page, id: string) {
  if (await isPhone(page)) await openTeams(page);
  await page.getByRole("button", { name: id, exact: true }).click(); // applying a pick closes the sheet
}
