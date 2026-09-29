import { test, expect } from "@playwright/test";
test("default teams, league selection, graphs and season navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await expect(page.locator(".team-summaries h3")).toHaveCount(3);
  await expect(page.locator(".team-summaries")).toContainText("Edmonton");
  await expect(page.locator(".team-summaries")).toContainText("Chicago");
  await expect(page.locator(".team-summaries")).toContainText("Minnesota");
  const card = page.locator(".game-card").first();
  await expect(card.locator(".form-chart")).toContainText("RECENT FORM");
  await expect(card.locator(".scenario-grid")).toHaveCount(0);
  await card.getByText("Why this game matters", { exact: false }).click();
  await expect(card.locator(".detail-body").first()).toContainText(
    "Equal ratings share ranks.",
  );
  await page.getByRole("button", { name: "All 32", exact: true }).click();
  await expect(page.locator(".results-line")).toContainText(
    "32 selected teams",
  );
  await page.getByRole("button", { name: "My three", exact: true }).click();
  await page.getByLabel("Season", { exact: true }).selectOption("20252026");
  await expect(page.locator(".game-card").first()).toContainText("PAST");
  await page.getByRole("button", { name: "Team trends", exact: true }).click();
  await expect(page.locator(".chart-wrap svg")).toBeVisible();
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(32);
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("recent actual game contribution and mobile card layout", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.getByRole("button", { name: /Past games/ }).click();
  await page.getByLabel("Competition").selectOption("1");
  await page.getByLabel("Sort by").selectOption("date");
  const card = page.locator(".game-card").first();
  await card.getByText("Player impact · actual").click();
  await expect(card).toContainText("Actual box-score index");
  await expect(card.locator(".impact-row").first()).toBeVisible();
  if (info.project.name === "mobile") {
    expect(
      await page
        .locator(".game-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(1);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
