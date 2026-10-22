import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// NHL+ tab. The MoneyPuck API is answered from the saved copy with timestamps set relative to now, so "fresh" and
// "stale" are deterministic whatever the date.
const DIR = resolve("public/data/moneypuck/20262027");
const read = (name: string) => JSON.parse(readFileSync(`${DIR}/${name}.json`, "utf8"));

type Opts = { ageHours?: number; fail?: boolean; edit?: (part: string, json: any) => void; refresh?: string };
async function mock(page: Page, o: Opts = {}) {
  const stamp = new Date(Date.now() - (o.ageHours ?? 2) * 3600000).toISOString();
  await page.route("**/api/moneypuck/**", async (route) => {
    if (o.fail) return route.fulfill({ status: 500, body: "nope" });
    const url = new URL(route.request().url());
    const part = url.pathname.replace(/^.*\/api\/moneypuck\/\d+\//, "");
    if (!existsSync(`${DIR}/${part}.json`)) return route.fulfill({ status: 404, body: "" });
    const json = read(part);
    if (json.sourceUpdated) json.sourceUpdated = { summary: stamp, shots: stamp };
    if (part === "status" && url.searchParams.get("refresh")) json.refresh = o.refresh ?? "unchanged";
    o.edit?.(part, json);
    await route.fulfill({ json, headers: { "x-snapshot-source": "live" } });
  });
  if (o.fail) await page.route("**/data/moneypuck/**", (r) => r.fulfill({ status: 500, body: "nope" }));
}
async function openPlus(page: Page) {
  await page.goto("/?view=games");
  await goTo(page, "NHL+");
  await expect(page.locator(".nhlplus")).toBeVisible();
}
const sub = (page: Page, name: string) => page.getByRole("navigation", { name: "NHL+ views" }).getByRole("button", { name, exact: true });
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const cell = (page: Page, team: string, col: string) => page.locator(`tr[data-team="${team}"] td[data-col="${col}"]`);

test.describe("NHL+ Teams", () => {
  test("opens directly on Teams with data, titles and attribution", async ({ page }, info) => {
    await mock(page);
    await openPlus(page);
    await expect(page.getByRole("heading", { name: "Expected goals created vs. allowed · 5-on-5" })).toBeVisible();
    await expect(page.locator(".np-table tbody tr")).toHaveCount(32);
    await expect(page.getByRole("link", { name: "Data: MoneyPuck.com" }).first()).toHaveAttribute("href", "https://moneypuck.com/");
    await expect(page.locator(".mp-status").first()).toContainText("updated");
    await expect(page.locator(".mp-status").first()).not.toContainText("stale");
    await expect(page.locator(".np-pt")).toHaveCount(32);
    await expect(page.locator(".nhlplus").getByText(/\blive\b/i)).toHaveCount(0);
    await page.screenshot({ path: `/tmp/shots/teams-${info.project.name}.png`, fullPage: true });
    expect(await noHScroll(page)).toBe(true);
  });

  test("situation filter changes values and titles", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    const fiveOnFive = await cell(page, "EDM", "xGF60").textContent();
    await page.getByRole("group", { name: "Situation" }).getByRole("button", { name: "Power play" }).click();
    await expect(page.getByRole("heading", { name: "Expected goals created vs. allowed · Power play" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Team statistics · Power play/ })).toBeVisible();
    const pp = await cell(page, "EDM", "xGF60").textContent();
    expect(pp).not.toBe(fiveOnFive);
    // per-60 uses the situation's own time: EDM PP xGF / PP minutes * 60 from the saved data
    const edm = read("summary").teams.EDM["5on4"];
    expect(pp).toBe(((edm.xGF * 3600) / edm.toi).toFixed(2));
    await page.getByRole("group", { name: "Situation" }).getByRole("button", { name: "Penalty kill" }).click();
    await expect(page.getByRole("heading", { name: /Penalty kill/ }).first()).toBeVisible();
  });

  test("minimum time on ice hides low-sample rows", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    await page.getByRole("group", { name: "Situation" }).getByRole("button", { name: "Power play" }).click();
    await expect(page.locator(".np-table tbody tr")).toHaveCount(32);
    await page.getByLabel("Min. time on ice").selectOption("40");
    const n = await page.locator(".np-table tbody tr").count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(32);
    await expect(page.locator(".np-count")).toContainText(`${n} of 32 teams`);
    await expect(page.locator(".np-pt")).toHaveCount(n);
  });

  test("sorting by a column and aria-sort", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    const th = page.getByRole("columnheader", { name: /^xGA\/60/ });
    await th.locator(".np-sortbtn").click();
    await expect(th).toHaveAttribute("aria-sort", "ascending");
    const vals = await page.locator('.np-table tbody td[data-col="xGA60"]').allTextContents();
    const nums = vals.map(Number);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    await th.locator(".np-sortbtn").click();
    await expect(th).toHaveAttribute("aria-sort", "descending");
  });

  test("highlight is shared across chart, bars and table", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    await page.locator('tr[data-team="EDM"] .np-teambtn').click();
    await expect(page.locator('tr[data-team="EDM"]')).toHaveClass(/highlighted/);
    await expect(page.locator('.np-rank-row[data-team="EDM"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.np-pt[data-point="EDM"]')).toHaveAttribute("data-on", "true");
    await page.getByRole("button", { name: /Clear highlight/ }).click();
    await expect(page.locator('.np-pt[data-point="EDM"]')).toHaveAttribute("data-on", "false");
  });

  test("keyboard focus opens chart tooltips with exact values", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    const plot = page.getByRole("group", { name: /Expected goals created versus allowed/ });
    await plot.focus();
    const tip = page.locator('[data-testid="chart-tooltip"]').first();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("xG for/60");
    const before = await tip.textContent();
    await page.keyboard.press("ArrowRight");
    await expect(tip).not.toHaveText(before!);
    await page.keyboard.press("Enter");
    await expect(page.locator('.np-pt[data-on="true"]')).toHaveCount(1);
    const row = page.locator(".np-rank-row").first();
    await row.focus();
    await expect(page.locator(".np-readout")).toContainText("GP");
  });

  test("a missing value shows an en dash, not zero", async ({ page }) => {
    await mock(page, { edit: (part, json) => { if (part === "summary") { json.teams.EDM["5on5"].GF = null; json.teams.EDM["5on5"].SOGF = null; } } });
    await openPlus(page);
    await expect(cell(page, "EDM", "shPct")).toHaveText("–");
    await expect(cell(page, "EDM", "GF")).toHaveText("–");
    await expect(cell(page, "EDM", "xGF60")).not.toHaveText("–");
  });
});

test.describe("NHL+ data states", () => {
  test("unavailable data shows a compact failure with Retry", async ({ page }) => {
    await mock(page, { fail: true });
    await openPlus(page);
    await expect(page.locator(".mp-status.mp-bad")).toContainText("unavailable");
    await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Data: MoneyPuck.com" }).first()).toBeVisible();
    // other sub-views stay usable
    await sub(page, "Data").click();
    await expect(page.locator(".nhlplus")).toBeVisible();
    await sub(page, "Players").click();
    await expect(page.getByText(/Skater data is not available/)).toBeVisible();
  });

  test("old data is labelled stale, never live", async ({ page }) => {
    await mock(page, { ageHours: 60 });
    await openPlus(page);
    await expect(page.locator(".mp-status").first()).toContainText("stale");
    await expect(page.locator(".mp-status").first()).toContainText("last updated");
    await expect(page.locator(".np-table tbody tr")).toHaveCount(32);
  });

  test("refresh reports its result and disables while running", async ({ page }) => {
    await mock(page, { refresh: "unchanged" });
    await openPlus(page);
    await sub(page, "Data").click();
    const btn = page.getByRole("button", { name: "Check MoneyPuck for new data" });
    await btn.click();
    await expect(page.getByTestId("refresh-status")).toHaveText("No new data from MoneyPuck");
    await expect(btn).toBeEnabled();
  });
});

test.describe("NHL+ Matchups", () => {
  test("deep link fills the teams and switches the view", async ({ page }) => {
    await mock(page);
    await openPlus(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("iceboard:nhlplus", { detail: { view: "matchups", away: "EDM", home: "CHI", gameId: 1, nonce: 4242 } })));
    await expect(sub(page, "Matchups")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Team 1")).toHaveValue("EDM");
    await expect(page.getByLabel("Team 2")).toHaveValue("CHI");
    await expect(page.getByRole("heading", { name: "Chances created vs. allowed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Goaltending · all situations/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Recent games · last 5/ })).toBeVisible();
    await expect(page.getByText(/shot-level expected goals/)).toBeVisible();
    await expect(page.locator(".nhlplus").getByText(/win probab/i)).toHaveCount(0);
    // the pair survives switching views
    await sub(page, "Goalies").click();
    await sub(page, "Matchups").click();
    await expect(page.getByLabel("Team 1")).toHaveValue("EDM");
    await page.getByRole("button", { name: "Swap teams" }).click();
    await expect(page.getByLabel("Team 1")).toHaveValue("CHI");
  });

  test("goalie panel states starters and works without a starter", async ({ page }) => {
    await mock(page);
    await page.route("**/api/league-matchups/**", (r) => r.fulfill({ status: 500, body: "" }));
    await page.route("**/data/league-matchups/**", (r) => r.fulfill({ status: 500, body: "" }));
    await openPlus(page);
    await sub(page, "Matchups").click();
    await expect(page.getByText("Starter unknown").first()).toBeVisible();
  });
});

test.describe("NHL+ Goalies, Players, Trends, Data", () => {
  test("goalie table separates totals from rates and sorts", async ({ page }, info) => {
    await mock(page);
    await openPlus(page);
    await sub(page, "Goalies").click();
    const groups = page.locator("th.np-group");
    await expect(groups.nth(0)).toHaveText("Totals");
    await expect(groups.nth(1)).toHaveText("Rates");
    for (const name of ["GP", "TOI (min)", "Shots faced", "xGA", "GA", "GSAx"]) await expect(page.getByRole("columnheader", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) }).first()).toBeVisible();
    for (const name of ["GSAx/60", "SV%", "xSV%", "Shots faced/60"]) await expect(page.getByRole("columnheader", { name: new RegExp(`^${name.replace("/", "\\/")}`) })).toBeVisible();
    // totals columns come before rates columns
    const order = await page.locator(".np-table thead tr:nth-child(2) th").allTextContents();
    expect(order.findIndex((t) => t.startsWith("GSAx"))).toBeLessThan(order.findIndex((t) => t.startsWith("GSAx/60")));
    const rows = await page.locator(".np-table tbody tr").count();
    expect(rows).toBeGreaterThan(20);
    await page.getByLabel("Min. minutes").selectOption("100");
    expect(await page.locator(".np-table tbody tr").count()).toBeLessThan(rows);
    const th = page.getByRole("columnheader", { name: /^GSAx\/60/ });
    await th.locator(".np-sortbtn").click();
    await expect(th).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByRole("heading", { name: /Goalie comparison/ })).toBeVisible();
    await expect(page.locator(".mp-cmp").first()).toBeVisible();
    await page.screenshot({ path: `/tmp/shots/goalies-${info.project.name}.png`, fullPage: true });
    expect(await noHScroll(page)).toBe(true);
  });

  test("players: filters, groups and lines", async ({ page }, info) => {
    await mock(page);
    await openPlus(page);
    await sub(page, "Players").click();
    await expect(page.locator("th.np-group").nth(0)).toContainText("Individual");
    await expect(page.locator("th.np-group").nth(1)).toContainText("On-ice");
    const all = await page.locator(".np-count").textContent();
    await page.getByLabel("Position").selectOption("D");
    await expect(page.locator(".np-table tbody tr").first().locator("td").first()).toHaveText("D");
    await page.getByLabel("Team", { exact: true }).selectOption("EDM");
    const n = await page.locator(".np-table tbody tr").count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(8);
    expect(await page.locator(".np-count").textContent()).not.toBe(all);
    await page.getByRole("button", { name: "Lines & pairings" }).click();
    await expect(page.getByRole("heading", { name: "Forward lines · 5-on-5" })).toBeVisible();
    await expect(page.locator(".np-table tbody tr").first().locator(".np-player-sm")).toHaveCount(3);
    await page.getByRole("button", { name: "Defense pairings" }).click();
    await expect(page.locator(".np-table tbody tr").first().locator(".np-player-sm")).toHaveCount(2);
    await page.screenshot({ path: `/tmp/shots/players-${info.project.name}.png`, fullPage: true });
    expect(await noHScroll(page)).toBe(true);
  });

  test("trends: game charts, keyboard tooltip, goalies apart from defense", async ({ page }, info) => {
    // The saved data now holds several daily snapshots; this test is about the first day, when there is exactly one.
    await mock(page, { edit: (part, json) => { if (part === "status") json.historyDates = ["2026-10-13"]; } });
    await openPlus(page);
    await sub(page, "Trends").click();
    await expect(page.getByRole("heading", { name: /Goals scored vs\. expected goals/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Goaltending, apart from team defense/ })).toBeVisible();
    await page.getByLabel("Team", { exact: true }).selectOption("EDM");
    await expect(page.locator(".np-callouts li").first()).toContainText(/goals? (above|below) xG|equal xG/);
    const chart = page.getByRole("group", { name: /goals scored versus expected goals by game/ });
    await chart.focus();
    await expect(page.locator('[data-testid="chart-tooltip"]').first()).toContainText("Expected goals for");
    await expect(page.getByText("Daily snapshots started 2026-10-13")).toBeVisible();
    await page.screenshot({ path: `/tmp/shots/trends-${info.project.name}.png`, fullPage: true });
    expect(await noHScroll(page)).toBe(true);
  });

  test("data: search, sort, expand a row, definitions and links", async ({ page }, info) => {
    await mock(page);
    await openPlus(page);
    await sub(page, "Data").click();
    await expect(page.getByRole("link", { name: "MoneyPuck data page" })).toHaveAttribute("href", "https://moneypuck.com/data.htm");
    await page.getByLabel("Search the table").fill("edmonton");
    await expect(page.locator(".np-table tbody tr[data-row]")).toHaveCount(1);
    await page.getByRole("button", { name: /Show all situations for Edmonton/ }).click();
    await expect(page.getByRole("table", { name: /All situations for Edmonton/ })).toContainText("Power play");
    await page.locator(".np-defs summary").click();
    await expect(page.locator(".np-defs-table")).toContainText("xGoalsFor");
    await expect(page.locator(".np-defs-table .np-derived").first()).toBeVisible();
    await page.getByRole("group", { name: "Source table" }).getByRole("button", { name: "Goalies" }).click();
    await page.getByLabel("Search the table").fill("");
    expect(await page.locator(".np-table tbody tr[data-row]").count()).toBeGreaterThan(20);
    await page.screenshot({ path: `/tmp/shots/data-${info.project.name}.png`, fullPage: true });
    expect(await noHScroll(page)).toBe(true);
  });
});

test("320px: no horizontal page scroll in any NHL+ view", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mock(page);
  await openPlus(page);
  for (const name of ["Teams", "Matchups", "Goalies", "Players", "Trends", "Data"]) {
    await sub(page, name).click();
    await page.waitForTimeout(400);
    expect(await noHScroll(page), name).toBe(true);
  }
  await sub(page, "Teams").click();
  await page.screenshot({ path: "/tmp/shots/teams-320.png", fullPage: true });
});
