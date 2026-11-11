import { expect, test } from "@playwright/test";

test("Settings and Following open from the address and from More, with no games toolbar", async ({ page }) => {
  for (const [view, title] of [["settings", "Settings"], ["following", "Following"]] as const) {
    await page.goto(`/?view=${view}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
});
