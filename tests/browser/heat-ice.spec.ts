import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null, home: "TOR", away: "BOS" };
let n = 0;
const shot = (team: string, x: number, y: number, period: number, time: string, type = "shot-on-goal") => ({ id: ++n, type, team, x, y, period, periodType: "REG", time, player: "Skater" });
// BOS pressed through the second period; TOR has taken over in the third.
const plays = [
  ...Array.from({ length: 7 }, (_, i) => shot("BOS", -75 + i, i - 3, 2, `${10 + i}:00`)),
  ...Array.from({ length: 2 }, (_, i) => shot("TOR", 70, i, 2, `${12 + i}:00`)),
  ...Array.from({ length: 7 }, (_, i) => shot("TOR", 78 + (i % 3), i - 3, 3, `0${1 + i}:00`)),
  shot("BOS", -72, 0, 3, "05:00"),
];
const live = { ...base, id: 9401, state: "LIVE", period: 3, periodType: "REG", clock: "10:00", awayScore: 1, homeScore: 1, start: new Date(Date.now() - 6000000).toISOString(), homeShots: 9, awayShots: 8 };
const final = { ...base, id: 9402, away: "MIN", home: "DAL", state: "FINAL", end: "REG", awayScore: 1, homeScore: 3, start: new Date(Date.now() - 12000000).toISOString(), homeShots: 30, awayShots: 22 };
const finalPlays = [...Array.from({ length: 8 }, (_, i) => ({ ...shot("DAL", 72 + i, i - 4, 1 + (i % 3), `${3 + i}:00`) })), ...Array.from({ length: 3 }, (_, i) => shot("MIN", -70, i, 2, `${4 + i}:00`))];

async function open(page: Page) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [live, final] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/game/*", (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const feed = id === live.id ? { ...live, plays, shots: plays, goals: [] } : { ...final, plays: finalPlays.map((p) => ({ ...p, id: p.id + 1000 })), shots: [], goals: [] };
    return route.fulfill({ json: feed });
  });
  await page.goto("/");
}

test("a live card shows the heat map, which way the ice is tilting and who is gaining", async ({ page }) => {
  await open(page);
  const row = page.locator(`.sb-row[data-game="${live.id}"]`);
  const heat = row.getByTestId("heat-ice");
  await expect(heat).toBeVisible();
  await expect(heat.locator(".mini-heading")).toContainText("Where it is hot now");
  // Heat sits at both nets: BOS (away) at the left, TOR (home) at the right.
  const sides = await heat.locator(".heat-cells rect").evaluateAll((els) => els.map((e) => Number(e.getAttribute("x")) + 2.5));
  expect(sides.some((x) => x < 0) && sides.some((x) => x > 0)).toBe(true);
  // TOR took over in the third: it tilts the ice and is gaining on the ten minutes before.
  await expect(heat.getByTestId("ice-tilt-reading")).toContainText(/Maple Leafs.*tilting the ice/);
  await expect(heat.getByTestId("ice-gaining")).toContainText("gaining");
  await expect(heat.locator(".tilt-chevrons path")).toHaveCount(3);
  await expect(heat.locator(".heat-zones")).toContainText("the slot");
});

test("a finished game shows the whole-game heat map and who controlled the ice", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /completed/ }).click();
  const heat = page.locator(`.sb-row[data-game="${final.id}"]`).getByTestId("heat-ice");
  await expect(heat).toBeVisible();
  await expect(heat.locator(".mini-heading")).toContainText("Whole game");
  await expect(heat.getByTestId("ice-tilt-reading")).toContainText(/Stars.*controlled the ice/);
  await expect(heat.getByTestId("ice-gaining")).toHaveCount(0);
});

test("the heat map fits a 360px phone and stays still (nothing animates)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await open(page);
  await expect(page.getByTestId("heat-ice").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  expect(await page.locator(".heat-ice *").evaluateAll((els) => els.every((e) => getComputedStyle(e).animationName === "none"))).toBe(true);
});
