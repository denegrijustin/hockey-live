import { expect, test } from "@playwright/test";
import { seedPrefs } from "./prefs";

const prefsOf = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem("iceboard-prefs-v1") || "{}"));
const chip = (page: any) => page.getByTestId("my-team-chip");
const choose = async (page: any, name: string) => {
  await chip(page).click();
  const sheet = page.getByRole("dialog", { name: "My team" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name, exact: true }).click();
  await expect(sheet).toBeHidden();
};

test("My team: the header offers it, one tap chooses it, it follows the team and can be changed or cleared", async ({ page }) => {
  await seedPrefs(page, { onboarded: true });
  await page.goto("/");
  await expect(chip(page)).toHaveAttribute("aria-label", "Choose your team");
  await choose(page, "Edmonton Oilers");
  await expect(chip(page)).toHaveAttribute("aria-label", /My team: Edmonton Oilers/);
  let p = await prefsOf(page);
  expect(p.myTeam).toBe("EDM"); expect(p.favorites[0]).toBe("EDM");
  await choose(page, "Toronto Maple Leafs");
  p = await prefsOf(page);
  expect(p.myTeam).toBe("TOR"); expect(p.favorites.slice(0, 2)).toEqual(["TOR", "EDM"]);
  await chip(page).click();
  await page.getByRole("dialog", { name: "My team" }).getByRole("button", { name: "No team" }).click();
  expect((await prefsOf(page)).myTeam).toBe("");
  await expect(chip(page)).toHaveAttribute("aria-label", "Choose your team");
});

test("My team is reachable from Settings and survives a reload", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["EDM"], myTeam: "EDM" });
  await page.goto("/?view=settings");
  await expect(page.getByTestId("settings-my-team")).toContainText("Edmonton Oilers");
  await page.getByRole("button", { name: "Change my team" }).click();
  await page.getByRole("dialog", { name: "My team" }).getByRole("button", { name: "Boston Bruins", exact: true }).click();
  await expect(page.getByTestId("settings-my-team")).toContainText("Boston Bruins");
  await page.reload();
  await expect(page.getByTestId("settings-my-team")).toContainText("Boston Bruins");
});

test("with My team set, the schedule opens on it", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["TOR", "EDM"], myTeam: "EDM" });
  await page.goto("/?view=teamschedule");
  await expect(page.getByRole("combobox", { name: "Team" })).toHaveValue("EDM");
});

test("with My team set, standings open on its conference with its row marked and in view", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["EDM"], myTeam: "EDM" });
  await page.goto("/?view=standings");
  const row = page.locator('.standings-table tr[data-team="EDM"]');
  await expect(row).toHaveClass(/mine/, { timeout: 30000 });
  await expect(row).toBeInViewport();
  await expect(page.locator('.standings-table tr[data-team="TOR"]')).toHaveCount(0); // the Eastern teams are not in the Western view
});

test("with My team set, playoff odds open on its conference with its row expanded", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["TOR"], myTeam: "TOR" });
  await page.goto("/?view=odds");
  const row = page.locator('.po-row[data-team="TOR"]');
  await expect(row).toBeVisible({ timeout: 30000 });
  await expect(row.locator(".po-btn")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("po-grid-W")).toHaveCount(0);
});

test("with My team set, Home lists it first among the My teams cards", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["TOR", "EDM", "BOS"], myTeam: "BOS" });
  await page.goto("/");
  const first = page.locator("[data-testid=home-section-myteams] li.mt-card").first();
  await expect(first).toHaveAttribute("data-team", "BOS", { timeout: 30000 });
});

test("with no My team the app stays league-wide: standings show every team", async ({ page }) => {
  await seedPrefs(page, { onboarded: true });
  await page.goto("/?view=standings");
  await expect(page.locator(".standings-table tr[data-team]").first()).toBeVisible({ timeout: 30000 });
  expect(await page.locator(".standings-table tr[data-team]").count()).toBeGreaterThanOrEqual(30);
});

for (const width of [360, 1280]) {
  test(`the My team control fits the header at ${width}px with a 44px target and no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await seedPrefs(page, { onboarded: true, favorites: ["EDM"], myTeam: "EDM" });
    await page.goto("/");
    const box = await chip(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("Team logos: retro by default, Current switches every logo to the current mark, and it sticks after a reload", async ({ page }) => {
  await seedPrefs(page, { onboarded: true, favorites: ["EDM"], myTeam: "EDM" });
  await page.goto("/?view=settings");
  const group = page.getByRole("group", { name: "Team logos" }).or(page.getByRole("radiogroup", { name: "Team logos" }));
  await expect(group).toBeVisible();
  const srcs = () => page.locator("img.team-logo").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src")));
  expect((await srcs()).some((s) => s?.includes("/logos/retro/"))).toBe(true);
  await group.getByRole("button", { name: "Current" }).or(group.getByRole("radio", { name: "Current" })).click();
  await expect.poll(async () => (await srcs()).some((s) => s?.includes("/logos/retro/"))).toBe(false);
  const now = await srcs();
  expect(now.length).toBeGreaterThan(0);
  expect(now.every((s) => s === null || /^\/logos\/[A-Z]{2,3}\.svg$/.test(s))).toBe(true);
  expect((await prefsOf(page)).display.logos).toBe("current");
  await page.goto("/?view=teams");
  await expect(page.locator("img.team-logo").first()).toBeVisible({ timeout: 30000 });
  expect((await srcs()).some((s) => s?.includes("/logos/retro/"))).toBe(false);
  await page.goto("/?view=settings");
  await group.getByRole("button", { name: "Retro" }).or(group.getByRole("radio", { name: "Retro" })).click();
  await expect.poll(async () => (await srcs()).some((s) => s?.includes("/logos/retro/"))).toBe(true);
});
