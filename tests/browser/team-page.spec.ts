import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import teams from "../../src/data/teams.json" with { type: "json" };
import { count, mk, mockApis, watchErrors, type FxGame } from "./fixtures-games";

// The full team page (?view=teams&team=EDM): every team renders, Back returns to the directory, deep links, a lazy roster, game and player rows.
test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "desktop project only: the page is checked at 360 px inside the tests"); });

const ids = (teams as { id: string; name: string; division: string; conference: string }[]);
let gid = 8000;
/** Every team plays three finals and two upcoming games, so every team has a record, a streak, a next game and results. */
const games: FxGame[] = ids.flatMap((t, i) => {
  const o = ids[(i + 1) % 32].id;
  return [
    mk.final(++gid, o, t.id, { offset: -3, score: [1, 3] }), mk.ot(++gid, t.id, o, { offset: -2, score: [3, 2] }), mk.final(++gid, o, t.id, { offset: -1, score: [4, 2] }),
    mk.upcoming(++gid, t.id, o, { offset: 1 }), mk.upcoming(++gid, o, t.id, { offset: 2 }),
  ];
});
const players = (team: string) => ({
  season: 0, gameType: 2, updatedAt: new Date().toISOString(),
  skaters: [
    { id: 8478402, name: "Connor McDavid", team, number: 97, headshot: "", position: "C", gp: 10, goals: 6, assists: 12, shots: 40, plusMinus: 3, pim: 2, toi: 21.5 },
    { id: 8477934, name: "Leon Draisaitl", team, number: 29, headshot: "", position: "L", gp: 10, goals: 8, assists: 7, shots: 35, plusMinus: 1, pim: 4, toi: 20.2 },
    { id: 8480800, name: "Evan Bouchard", team, number: 2, headshot: "", position: "D", gp: 10, goals: 2, assists: 9, shots: 28, plusMinus: 2, pim: 0, toi: 23.9 },
  ],
  goalies: [{ id: 8479973, name: "Stuart Skinner", team, number: 74, headshot: "", position: "G", gp: 8, goals: 0, assists: 0, shots: 0, plusMinus: 0, pim: 0, toi: 0, savePct: 0.915 }],
});
async function setup(page: Page) {
  const m = await mockApis(page, { games });
  await page.route("**/api/players/**", (r) => { m.log.push({ url: r.request().url(), path: new URL(r.request().url()).pathname, t: Date.now() }); return r.fulfill({ json: players("EDM") }); });
  return m;
}
const main = (page: Page) => page.locator("section.team-page");

test("all 32 team pages render their name, division, conference and sections without console errors", async ({ page }) => {
  test.setTimeout(180_000);
  await setup(page);
  const errors = watchErrors(page);
  for (const t of ids) {
    await page.goto(`/?view=teams&team=${t.id}`);
    await expect(page.getByRole("heading", { level: 1, name: t.name })).toBeVisible();
    await expect(main(page)).toContainText(`${t.division} Division`);
    await expect(main(page)).toContainText(t.conference === "E" ? "Eastern Conference" : "Western Conference");
    await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Performance" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Roster" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Schedule & results" })).toBeVisible();
    await expect(page).toHaveTitle(`${t.name} · Iceboard`);
  }
  expect(errors).toEqual([]);
});

test("Teams to a team page and Back returns to the directory (and Forward returns to the page)", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=teams");
  await page.locator('.tm-card [data-team-open="EDM"]').first().click();
  await expect(page).toHaveURL(/view=teams&team=EDM/);
  await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  await expect(page).not.toHaveURL(/team=/);
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Teams" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
});

test("a deep link survives a refresh, and an unknown team id opens the directory", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=teams&team=TOR");
  await expect(page.getByRole("heading", { level: 1, name: "Toronto Maple Leafs" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Toronto Maple Leafs" })).toBeVisible();
  await expect(page).toHaveURL(/team=TOR/);
  await page.goto("/?view=teams&team=ZZZ");
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  await expect(page).not.toHaveURL(/team=/);
  await page.goto("/?view=standings&team=TOR");
  await expect(page).not.toHaveURL(/team=/);
});

test("the quick-peek dialog keeps its content and opens the full page", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=standings");
  await page.locator("tbody tr").first().locator("button.team-link").click();
  const d = page.locator("dialog.team-dialog");
  await expect(d).toBeVisible();
  await expect(d.locator(".tp-ranks span")).toHaveCount(3);
  await expect(d.getByText("Points %")).toBeVisible();
  await d.getByRole("button", { name: "Open full team page" }).click();
  await expect(d).toBeHidden();
  await expect(page).toHaveURL(/view=teams&team=[A-Z]{3}/);
  await expect(main(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=standings/);
});

test("the roster is requested once, only when its section opens; a player row asks for that player's profile", async ({ page }) => {
  const m = await setup(page);
  await page.goto("/?view=teams&team=EDM");
  await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  expect(count(m.log, /\/api\/players\//)).toBe(0);
  const roster = page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Roster" }) });
  await roster.locator("summary").click();
  await expect(roster.getByRole("table", { name: "Forwards" })).toBeVisible();
  await expect(roster.getByRole("table", { name: "Defense" })).toBeVisible();
  await expect(roster.getByRole("table", { name: "Goalies" })).toBeVisible();
  await roster.locator("summary").click();
  await roster.locator("summary").click();
  await expect(roster.getByRole("table", { name: "Forwards" })).toBeVisible();
  expect(count(m.log, /\/api\/players\//)).toBe(1);
  // Forwards are ordered by time on ice.
  await expect(roster.locator("table").first().locator("tbody tr").first()).toContainText("Connor McDavid");
  const provider = /<dialog/.test(readFileSync("src/components/player/PlayerContext.tsx", "utf8"));
  if (provider) {
    await roster.getByRole("button", { name: "View Connor McDavid details" }).click();
    await expect(page.locator("dialog.player-dialog[open]")).toContainText("Connor McDavid");
  } else {
    await expect(roster.getByRole("button", { name: "View Connor McDavid details" })).toBeVisible(); // the profile provider is Agent 2's; the row is wired to usePlayerProfile()
  }
});

test("schedule rows and the next game ask to open that game (iceboard:open-game)", async ({ page }) => {
  await setup(page);
  await page.goto("/?view=teams&team=EDM");
  await page.evaluate(() => { (window as any).__opened = []; window.addEventListener("iceboard:open-game", (e) => (window as any).__opened.push((e as CustomEvent).detail.id)); });
  await page.locator(".tpg-next .tpg-game").click();
  const sched = page.locator("details.tpg-details", { has: page.getByRole("heading", { name: "Schedule & results" }) });
  await sched.locator("summary").click();
  await expect(sched.getByRole("heading", { name: "Recent results" })).toBeVisible();
  await sched.locator(".tpg-games button").last().click();
  const opened = await page.evaluate(() => (window as any).__opened as number[]);
  expect(opened).toHaveLength(2);
  expect(opened.every((id) => Number.isInteger(id) && id > 8000)).toBe(true);
  await sched.getByRole("button", { name: "Open the full schedule" }).click();
  await expect(page).toHaveURL(/view=teamschedule/);
});

test("360 px: no horizontal overflow with every section open; targets are at least 44 px", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?view=teams&team=EDM");
  await expect(page.getByRole("heading", { level: 1, name: "Edmonton Oilers" })).toBeVisible();
  for (const s of await page.locator("details.tpg-details:visible > summary").all()) await s.click();
  await expect(page.getByRole("table", { name: "Forwards" })).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("section.team-page button, section.team-page summary, section.team-page nav button")].map((b) => ({ n: (b.textContent ?? "").trim().slice(0, 30), h: b.getBoundingClientRect().height })).filter((x) => x.h > 0 && x.h < 43.5));
  expect(small).toEqual([]);
});

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme} theme: readable surfaces and no console errors`, async ({ page }) => {
    await setup(page);
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?view=teams&team=EDM");
    await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
    const lum = await page.evaluate(() => {
      const c = getComputedStyle(document.querySelector(".tpg-card")!).backgroundColor.match(/\d+/g)!.map(Number);
      return (c[0] + c[1] + c[2]) / 3;
    });
    if (scheme === "dark") expect(lum).toBeLessThan(90); else expect(lum).toBeGreaterThan(160);
    expect(errors).toEqual([]);
  });
}
