import { expect, test } from "@playwright/test";

const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: /profile/ });

test("a team logo in the standings opens that team's profile, and Close puts it away", async ({ page }) => {
  await page.goto("/?view=games");
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  const row = page.locator("tbody tr").first();
  const name = ((await row.locator(".st-full").first().textContent()) ?? "").trim();
  await row.locator("img.team-logo").first().click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole("heading", { name })).toBeVisible();
  await expect(d.getByText("Recent results")).toBeVisible();
  await expect(d.getByText("Injuries")).toBeVisible();
  await expect(d.locator(".tp-ranks span")).toHaveCount(3);
  await d.getByRole("button", { name: /Close team profile/ }).click();
  await expect(d).toBeHidden();
});

test("a team name opens its profile too: standings table, resumés and playoff odds", async ({ page }) => {
  await page.goto("/?view=games");
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  const tableName = page.locator("tbody tr").first().locator("button.team-link");
  const full = ((await tableName.locator(".st-full").textContent()) ?? "").trim();
  await tableName.click();
  await expect(dialog(page).getByRole("heading", { name: full })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await page.getByRole("button", { name: /Resumés/ }).click();
  await page.getByTestId("resumes").locator(".rs-row button.team-link").nth(2).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Standings table" }).click();
});

test("a tap on a game card's team name still expands the card, and the profile is one tap away in the Game Center", async ({ page }) => {
  await page.goto("/");
  const name = page.locator(".sb-row .sb-name").first();
  await name.waitFor({ timeout: 30000 });
  await name.click();
  await expect(page.locator(".sb-row.open")).toHaveCount(1);
  await expect(dialog(page)).toBeHidden();
});

test("a logo inside a team control still does its own job and does not open a profile", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?view=games");
  const pill = page.locator(".quick-teams .team-pill").first();
  await pill.waitFor({ timeout: 30000 });
  await pill.locator("img.team-logo").click(); // the pill picks the team; it is not a link
  await expect(dialog(page)).toBeHidden();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
});
