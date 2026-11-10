import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { normalizeBoxscore } from "../../src/lib/normalize.mjs";
import { mockApis, mk } from "./fixtures-games";

// Mocks are built from tests/fixtures/boxscore-sample.json: the REAL NHL boxscore + right-rail of CAR at VGK (2025030416), run through the real normalizeBoxscore.
const sample = JSON.parse(readFileSync("tests/fixtures/boxscore-sample.json", "utf8"));
const realBox = () => JSON.parse(JSON.stringify(normalizeBoxscore(sample.boxscore, sample.rightRail)));
const bareBox = () => JSON.parse(JSON.stringify(normalizeBoxscore(sample.boxscore)));
const FINAL_ID = 2025030416, LIVE_ID = 2025030417;

async function openStats(page: Page, id: number, tab: "Team Stats" | "Players", box: () => unknown, extra?: (n: number) => void) {
  let n = 0;
  await mockApis(page, { games: [mk.final(FINAL_ID, "CAR", "VGK", { score: [3, 0] }), mk.live(LIVE_ID, "CAR", "VGK")] });
  await page.route(/\/api\/boxscore\/\d+$/, (r) => { n += 1; extra?.(n); return r.fulfill({ json: box() }); });
  await page.route(/\/api\/player\/\d{7}$/, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.route(/\/api\/player\/\d{7}\/log\//, (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto("/");
  await page.locator(`.sb-row[data-game="${id}"] .sb-main`).click();
  const t = page.getByRole("tab", { name: tab });
  if (await t.count()) await t.click(); // once the Game Center tabs are integrated
  return page.getByTestId(tab === "Team Stats" ? "gc-team-stats" : "gc-players");
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test("team stats: comparison table, gauges and period table from the real sample", async ({ page }) => {
  const pane = await openStats(page, FINAL_ID, "Team Stats", realBox);
  const table = pane.getByTestId("gc-team-table");
  await expect(table.locator('tr[data-stat="powerPlay"]')).toContainText("0/3");
  await expect(table.locator('tr[data-stat="pim"]')).toContainText("6");
  await expect(table.locator('tr[data-stat="takeaways"]')).toContainText("10");
  await expect(table.locator('tr[data-stat="giveaways"]')).toContainText("19");
  await expect(table.locator('tr[data-stat="giveaways"]')).toContainText("Official");
  await expect(pane.getByTestId("gc-gauge-faceoffPct").getByRole("img")).toHaveAttribute("aria-label", /Faceoff %: CAR 52\.4%, VGK 47\.6%/);
  await expect(pane.getByTestId("gc-gauge-hits").getByRole("img")).toHaveAttribute("aria-label", /Hits: CAR 32, VGK 39/);
  const per = pane.getByTestId("gc-period-table");
  await expect(per).toContainText("Official");
  await expect(per.locator('tr[data-period="1"]')).toHaveText(/1\s*0\s*0\s*8\s*11/); // away goals, home goals, away shots, home shots
  await expect(per.locator('tr[data-period="total"]')).toHaveText(/Total\s*3\s*0\s*23\s*22/);
});

test("team stats without the NHL team table: derived rows are labelled, missing numbers show a dash", async ({ page }) => {
  const pane = await openStats(page, FINAL_ID, "Team Stats", bareBox);
  const table = pane.getByTestId("gc-team-table");
  await expect(table.locator('tr[data-stat="powerPlay"]')).toContainText("—");
  await expect(table.locator('tr[data-stat="blocks"]')).toContainText("Derived");
  await expect(pane.getByTestId("gc-gauge-sog")).toContainText("Official");
  await expect(pane.getByTestId("gc-gauge-faceoffPct")).toHaveCount(0);
});

test("players: skater and goalie tables, computed points and save %, bench goalie excluded", async ({ page }) => {
  const pane = await openStats(page, FINAL_ID, "Players", realBox);
  const sk = pane.getByTestId("gc-skaters-CAR");
  await expect(sk.locator("tbody tr").first()).toBeVisible();
  expect(await sk.locator("tbody tr").count()).toBeGreaterThanOrEqual(12);
  await expect(sk.locator("thead th")).toHaveText(["Player", "G", "A", "P", "SOG", "Hits", "BLK", "PIM", "+/-", "TOI"]);
  const box = realBox();
  const eichel = box.players.find((p: any) => p.name === "J. Eichel");
  const row = pane.getByTestId("gc-skaters-VGK").locator(`tr[data-player-id="${eichel.id}"]`);
  await expect(row).toContainText("24:07");
  const goalies = pane.getByTestId("gc-goalies-CAR").locator("tbody tr");
  await expect(goalies).toHaveCount(1);
  const g = box.players.find((p: any) => p.team === "CAR" && p.position === "G" && p.toi !== "00:00");
  await expect(goalies.first()).toContainText((g.saves / g.shotsAgainst).toFixed(3).replace(/^0/, ""));
  await expect(pane.getByTestId("gc-goalies-VGK").locator("tbody tr")).toHaveCount(1);
});

test("players: sortable headers set aria-sort and reorder without duplicating rows", async ({ page }) => {
  const pane = await openStats(page, FINAL_ID, "Players", realBox);
  const sk = pane.getByTestId("gc-skaters-CAR");
  const before = await sk.locator("tbody tr").count();
  const head = sk.getByRole("columnheader", { name: "SOG" });
  await expect(head).toHaveAttribute("aria-sort", "none");
  await head.getByRole("button").click();
  await expect(head).toHaveAttribute("aria-sort", "descending");
  const shots = async () => (await sk.locator("tbody tr td:nth-child(5)").allTextContents()).map(Number);
  let s = await shots();
  expect(s).toEqual([...s].sort((a, b) => b - a));
  await head.getByRole("button").click();
  await expect(head).toHaveAttribute("aria-sort", "ascending");
  s = await shots();
  expect(s).toEqual([...s].sort((a, b) => a - b));
  expect(await sk.locator("tbody tr").count()).toBe(before);
  await sk.getByRole("columnheader", { name: "Player" }).getByRole("button").click();
  const names = await sk.locator("tbody tr .gcs-name strong").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("players: notable performances state the real numbers; missing stats show a dash", async ({ page }) => {
  const box = realBox();
  const car = box.players.filter((p: any) => p.team === "CAR" && p.position !== "G");
  const star = car[0], quiet = car[1], goalie = box.players.find((p: any) => p.team === "VGK" && p.position === "G" && p.toi !== "00:00");
  Object.assign(star, { goals: 1, assists: 2, shots: 3 });
  Object.assign(quiet, { goals: 0, assists: 0, shots: null, hits: null, toi: undefined });
  Object.assign(goalie, { saves: 27, shotsAgainst: 28, goalsAgainst: 1 });
  const pane = await openStats(page, FINAL_ID, "Players", () => box);
  const cards = pane.getByTestId("gc-notable-card");
  await expect(cards.filter({ hasText: star.name })).toContainText("3 points: 1G 2A");
  await expect(cards.filter({ hasText: goalie.name })).toContainText("27 saves on 28 shots (.964)");
  const row = pane.getByTestId("gc-skaters-CAR").locator(`tr[data-player-id="${quiet.id}"]`);
  await expect(row.locator("td").nth(4)).toHaveText("—"); // SOG
  await expect(row.locator("td").last()).toHaveText("—"); // TOI
});

test("players: a name opens the player profile", async ({ page }) => {
  const pane = await openStats(page, FINAL_ID, "Players", realBox);
  const name = realBox().players.find((p: any) => p.team === "CAR" && p.position !== "G").name;
  await pane.getByTestId("gc-skaters-CAR").getByRole("button", { name: `View ${name} details` }).click();
  await expect(page.locator("dialog.player-dialog[open]")).toBeVisible();
});

test("360px: both panes fit without sideways scroll and tap targets are 44px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const pane = await openStats(page, FINAL_ID, "Players", realBox);
  await expect(pane.getByTestId("gc-skaters-CAR")).toBeVisible();
  await noOverflow(page);
  const w = await pane.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(w).toBeLessThanOrEqual(0);
  const h = await pane.getByTestId("gc-skaters-CAR").getByRole("columnheader", { name: "SOG" }).getByRole("button").boundingBox();
  expect(h!.height).toBeGreaterThanOrEqual(44);
  await expect(pane.getByTestId("gc-skaters-CAR").locator("tbody tr").first().locator(".sub")).toBeVisible(); // hits/BLK/PIM move under the name
  const teamPane = page.getByTestId("gc-team-stats");
  await expect(teamPane.getByTestId("gc-team-table")).toBeVisible();
  await noOverflow(page);
});

test("live: refresh changes numbers in place without duplicating rows", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  const pane = await openStats(page, LIVE_ID, "Players", () => {
    const b = realBox();
    if (calls >= 2) { const p = b.players.find((x: any) => x.team === "CAR" && x.position !== "G"); p.goals = 4; p.shots = 9; }
    return b;
  }, (n) => { calls = n; });
  const sk = pane.getByTestId("gc-skaters-CAR");
  const rows = await sk.locator("tbody tr").count();
  const card = pane.getByTestId("gc-notable-card");
  const before = await card.count();
  await page.clock.runFor(31_000);
  await expect(pane.getByTestId("gc-notable-card").first()).toContainText(/Hat trick: 4 goals/);
  expect(await sk.locator("tbody tr").count()).toBe(rows);
  expect(await page.locator(`[data-testid="gc-skaters-CAR"] tr[data-player-id]`).count()).toBe(rows);
  expect(before).toBeLessThanOrEqual(2); // live games show at most two cards
  expect(await pane.getByTestId("gc-notable-card").count()).toBeLessThanOrEqual(2);
});

test("box score not published yet: a clear message, no crash", async ({ page }) => {
  await mockApis(page, { games: [mk.final(FINAL_ID, "CAR", "VGK", { score: [3, 0] })] });
  await page.route(/\/api\/boxscore\/\d+$/, (r) => r.fulfill({ status: 404, json: { error: "No box score published yet" } }));
  await page.goto("/");
  await page.locator(`.sb-row[data-game="${FINAL_ID}"] .sb-main`).click();
  const t = page.getByRole("tab", { name: "Players" });
  if (await t.count()) await t.click();
  await expect(page.getByTestId("gc-players")).toContainText("not published yet");
  await expect(page.getByTestId("gc-team-stats")).toContainText("not published yet");
});
