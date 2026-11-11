import { expect, test } from "@playwright/test";
import { mk, mockApis } from "./fixtures-games";
import { seedPrefs } from "./prefs";

const games = [
  mk.live(9801, "COL", "WPG", { period: 3, clock: "04:10", score: [2, 2] }),
  mk.live(9802, "CHI", "EDM", { period: 2, clock: "10:00", score: [1, 0] }),
  mk.upcoming(9803, "MIN", "DAL", { time: "01:00" }),
  mk.upcoming(9804, "SEA", "VAN", { time: "02:00" }),
  mk.upcoming(9805, "NYR", "NJD", { time: "00:30" }),
  mk.final(9806, "BOS", "TOR"),
  mk.final(9807, "FLA", "TBL"),
];
const sec = (id: string) => `[data-testid=home-section-${id}]`;
const one = async (page: any, id: number) => expect(page.locator(`.scoreboard [data-game="${id}"]`)).toHaveCount(1);

test.describe("home personal", () => {
  test("no favorites: Home is the league board with no personal sections", async ({ page }) => {
    await seedPrefs(page, {});
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    for (const id of ["myteams", "myplayers", "pulse"]) await expect(page.locator(sec(id))).toHaveCount(0);
    await expect(page.locator(`${sec("live")} .sb-row`)).toHaveCount(2);
    await expect(page.locator(".sb-density")).toHaveCount(0);
  });

  test("a favorite team's live game appears once, in My teams, and counts are recomputed", async ({ page }) => {
    await seedPrefs(page, { favorites: ["EDM"] });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(sec("myteams"))).toBeVisible();
    await one(page, 9802);
    await expect(page.locator(`${sec("myteams")} [data-game="9802"]`)).toHaveCount(1);
    await expect(page.locator(`${sec("live")} [data-game="9802"]`)).toHaveCount(0);
    await expect(page.locator(`${sec("live")} .sb-row`)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /1 in progress/ })).toBeVisible();
    await expect(page.locator(sec("myteams"))).toContainText("EDM");
    await expect(page.locator(`${sec("featured")} [data-game="9802"]`)).toHaveCount(0);
  });

  test("a team without a game that day says when it plays next, or that it has no game", async ({ page }) => {
    await seedPrefs(page, { favorites: ["EDM", "LAK"] });
    await mockApis(page, { games: [...games, mk.upcoming(9810, "LAK", "SJS", { offset: 3 })] });
    await page.goto("/");
    await expect(page.locator(`${sec("myteams")} li[data-team=LAK]`)).toContainText(/Next: at Sharks/);
  });

  test("section toggles remove My teams (and its dedupe) and Worth watching", async ({ page }) => {
    await seedPrefs(page, { favorites: ["EDM"], display: { sections: { myTeams: false, worth: false, pulse: false } } });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(".sb-row").first()).toBeVisible();
    await expect(page.locator(sec("myteams"))).toHaveCount(0);
    await expect(page.locator(sec("featured"))).toHaveCount(0);
    await expect(page.locator(sec("pulse"))).toHaveCount(0);
    await expect(page.locator(`${sec("live")} [data-game="9802"]`)).toHaveCount(1);
  });

  test("followed players show with one line each; none means no section", async ({ page }) => {
    await seedPrefs(page, { players: [{ id: 8478402, name: "Connor McDavid", team: "EDM", pos: "C", number: 97 }] });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(sec("myplayers"))).toContainText("Connor McDavid");
    await expect(page.locator(sec("myplayers"))).toContainText("CHI at EDM");
    await expect(page.locator(sec("myteams"))).toHaveCount(0);
  });

  test("league-first order puts Live and Upcoming before My teams", async ({ page }) => {
    await seedPrefs(page, { favorites: ["EDM"], display: { homeOrder: "league" } });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(sec("myteams"))).toBeVisible();
    const order = await page.locator("[data-testid^=home-section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order.indexOf("home-section-live")).toBeLessThan(order.indexOf("home-section-myteams"));
    expect(order.indexOf("home-section-upcoming")).toBeLessThan(order.indexOf("home-section-myteams"));
  });

  test("favorites-first order puts My teams on top", async ({ page }) => {
    await seedPrefs(page, { favorites: ["EDM"] });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(sec("myteams"))).toBeVisible();
    const order = await page.locator("[data-testid^=home-section-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order[0]).toBe("home-section-myteams");
  });

  test("the density button toggles compact cards and saves the choice", async ({ page }) => {
    await seedPrefs(page, { favorites: ["MIN"] });
    await mockApis(page, { games });
    await page.goto("/");
    await expect(page.locator(`${sec("upcoming")} .sb-venue`).first()).toBeVisible();
    await page.getByRole("button", { name: "Compact game cards" }).click();
    await expect(page.locator(`${sec("upcoming")} .sb-venue`)).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("iceboard-prefs-v1")!).display.density);
    expect(saved).toBe("compact");
  });

  test("no horizontal overflow at 360px with everything on, and the added height stays within about a screen", async ({ page }) => {
    const base = await (async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockApis(page, { games });
      await page.goto("/");
      await expect(page.locator(".sb-row").first()).toBeVisible();
      return page.evaluate(() => document.documentElement.scrollHeight);
    })();
    const p2 = await page.context().newPage();
    await seedPrefs(p2, { favorites: ["EDM", "MIN", "BOS", "SEA"], players: [{ id: 8478402, name: "Connor McDavid", team: "EDM", pos: "C", number: 97 }] });
    await mockApis(p2, { games });
    await p2.setViewportSize({ width: 390, height: 844 });
    await p2.goto("/");
    await expect(p2.locator(sec("myteams"))).toBeVisible();
    await expect(p2.locator(`${sec("myteams")} .mt-card`)).toHaveCount(3);
    await expect(p2.getByRole("button", { name: /See all 4 teams/ })).toBeVisible();
    const withFav = await p2.evaluate(() => document.documentElement.scrollHeight);
    expect(withFav - base, "added height on 390x844").toBeLessThanOrEqual(844 + 150);
    await p2.setViewportSize({ width: 360, height: 800 });
    const o = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(o.sw).toBeLessThanOrEqual(o.cw);
    await p2.getByRole("button", { name: /See all 4 teams/ }).click();
    await expect(p2.locator(`${sec("myteams")} .mt-card`)).toHaveCount(4);
    const o2 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(o2.sw).toBeLessThanOrEqual(o2.cw);
  });

  test("a My teams game card shows each team's name beside its logo, not pushed to the far edge", async ({ page }) => {
    await seedPrefs(page, { favorites: ["ANA"] });
    await mockApis(page, { games: [mk.upcoming(9820, "NSH", "ANA", { time: "01:00" })] });
    await page.goto("/");
    const card = page.locator(`${sec("myteams")} li[data-team=ANA] .gcv-compact`);
    await expect(card).toBeVisible();
    await expect(card.locator(".gcv-full").first()).toBeVisible();
    const logo = await card.locator(".sb-team").first().locator(".team-logo").boundingBox();
    const name = await card.locator(".sb-team").first().locator(".sb-name").boundingBox();
    expect(name!.x - (logo!.x + logo!.width)).toBeLessThan(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});
