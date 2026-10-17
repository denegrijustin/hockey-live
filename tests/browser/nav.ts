import type { Page } from "@playwright/test";

/** Opens a dashboard view by name. On phones the less-used views sit behind the More sheet, so go through it when needed. */
export async function goTo(page: Page, name: string) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.first().isVisible().catch(() => false)) {
    await direct.first().click();
    return;
  }
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name, exact: true }).click();
}
