import { expect, test } from "@playwright/test";
import { IDS, mockPlayers, seedFollowed } from "./fixtures-players";

const watch = (page: import("@playwright/test").Page) => page.getByTestId("pw-card");
const open = async (page: import("@playwright/test").Page, url = "/?view=following") => { await page.goto(url); };

test("follow from a profile, persist on reload, unfollow", async ({ page }) => {
  await mockPlayers(page);
  await open(page, `/?view=following&player=${IDS.skater}`);
  const dlg = page.locator("dialog.player-dialog[open]");
  const btn = dlg.getByRole("button", { name: "Follow Alpha Forward" });
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  const box = await btn.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  await btn.click();
  await expect(dlg.getByRole("button", { name: "Unfollow Alpha Forward" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?view=following");
  await expect(watch(page)).toHaveCount(1);
  await expect(watch(page).first()).toContainText("Alpha Forward");
  await page.getByRole("button", { name: "Unfollow Alpha Forward" }).first().click();
  await expect(page.getByText("No followed players yet.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No followed players yet.")).toBeVisible();
});

test("follow from search results", async ({ page }) => {
  await mockPlayers(page);
  await open(page, "/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("combobox").fill("gus goalie");
  await expect(dialog.getByRole("option").filter({ hasText: "Gus Goalie" })).toBeVisible();
  await dialog.getByRole("button", { name: "Follow Gus Goalie" }).click();
  await expect(dialog.getByRole("button", { name: "Unfollow Gus Goalie" })).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/?view=following");
  await expect(page.getByTestId("pw-goalies")).toContainText("Gus Goalie");
});

test("goalie and skater layouts are separate; stats and missing values", async ({ page }) => {
  await mockPlayers(page);
  await seedFollowed(page, [
    { id: IDS.skater, name: "Alpha Forward", team: "EDM", pos: "C" }, { id: IDS.goalie, name: "Gus Goalie", team: "NSH", pos: "G" }, { id: IDS.sparse, name: "Sparse Stats", team: "NSH", pos: "C" },
  ]);
  await open(page);
  const sk = page.getByTestId("pw-skaters"), gl = page.getByTestId("pw-goalies");
  await expect(sk.getByTestId("pw-card")).toHaveCount(2);
  await expect(gl.getByTestId("pw-card")).toHaveCount(1);
  const a = sk.getByTestId("pw-card").filter({ hasText: "Alpha Forward" });
  for (const k of ["GP", "G", "A", "PTS", "+/−", "Shots", "TOI"]) await expect(a.locator("dt", { hasText: new RegExp(`^${k.replace("+", "\\+")}$`) })).toBeVisible();
  await expect(a).toContainText("19:30");
  await expect(gl).toContainText(".917");
  await expect(gl.locator("dt", { hasText: /^GA$/ })).toBeVisible();
  await expect(gl.locator("dt", { hasText: /^TOI$/ })).toHaveCount(0);
  const sparse = sk.getByTestId("pw-card").filter({ hasText: "Sparse Stats" });
  await expect(sparse.locator("dd", { hasText: "—" })).toHaveCount(5);
  await expect(a.getByTestId("pw-injury")).toHaveText("No injury reported");
});

test("traded player shows the new team and the snapshot is updated; unrostered player says so", async ({ page }) => {
  await mockPlayers(page);
  await seedFollowed(page, [{ id: IDS.traded, name: "Trade Target", team: "TOR", pos: "D" }, { id: IDS.gone, name: "Long Gone", team: "EDM", pos: "C" }]);
  await open(page);
  const t = watch(page).filter({ hasText: "Trade Target" });
  await expect(t.getByTestId("pw-moved")).toHaveText("Team changed: TOR → CGY");
  await expect(t).toContainText("CGY");
  await expect(watch(page).filter({ hasText: "Long Gone" }).getByTestId("pw-noroster")).toHaveText("Not on a current roster");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("iceboard-prefs-v1")!).players.find((p: { id: number }) => p.id === 8470002).team);
  expect(stored).toBe("CGY");
});

test("injury only on an exact match; plays tonight only from the schedule; recent performance loads lazily", async ({ page }) => {
  const counts = await mockPlayers(page, { injuries: [{ id: "1", name: "Alpha Forward", team: "EDM", status: "Day-To-Day", kind: "Upper body" }, { id: "2", name: "Gus Goalie", team: "TOR", status: "Out" }], tonight: ["VAN", "EDM"] });
  await seedFollowed(page, [{ id: IDS.skater, name: "Alpha Forward", team: "EDM", pos: "C" }, { id: IDS.goalie, name: "Gus Goalie", team: "NSH", pos: "G" }]);
  await open(page);
  const a = watch(page).filter({ hasText: "Alpha Forward" }), g = watch(page).filter({ hasText: "Gus Goalie" });
  await expect(a.getByTestId("pw-injury")).toContainText("Day-To-Day · Upper body");
  await expect(a.getByTestId("pw-tonight")).toHaveText("Plays tonight vs VAN");
  await expect(g.getByTestId("pw-injury")).toHaveText("No injury reported");
  await expect(g.getByTestId("pw-tonight")).toHaveCount(0);
  expect(counts.profiles[IDS.goalie] ?? 0).toBe(0);
  await g.getByRole("button", { name: /Recent performance/ }).click();
  await expect(g.getByRole("region", { name: /Recent performance/ })).toContainText("W-L-OTL");
  await expect(g.getByRole("region", { name: /Recent performance/ })).toContainText("5-3-1");
  await expect(g.getByRole("list", { name: "Last 5 games played" }).getByRole("listitem")).toHaveCount(5);
  expect(counts.profiles[IDS.goalie]).toBe(1);
  expect(counts.profiles[IDS.skater] ?? 0).toBe(0);
  for (const [team, n] of Object.entries(counts.players)) expect(n, team).toBe(1);
});

test("no horizontal overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockPlayers(page);
  await seedFollowed(page, [{ id: IDS.skater, name: "Alpha Forward", team: "EDM", pos: "C" }, { id: IDS.goalie, name: "Gus Goalie", team: "NSH", pos: "G" }]);
  await open(page);
  await expect(watch(page)).toHaveCount(2);
  await watch(page).first().getByRole("button", { name: /Recent performance/ }).click();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
