import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import raw from "../fixtures/raw-live-game.json" with { type: "json" };
import { normalizeGameFeed } from "../../src/lib/game-data.mjs";

/**
 * Play-by-play pane, driven by the REAL recorded NHL feed (tests/fixtures/raw-live-game.json) through normalizeGameFeed.
 * DERIVED fixture (labelled): the recording has no goals and only period 1, so inside this builder ONLY we (a) relabel three real
 * shot-on-goal plays as goals with real roster players as scorer/assists and running score after, and (b) move the later plays
 * into periods 2 and 3. Nothing here ships in the app. When Agent 2's tests/browser/gc-fixtures.ts lands, prefer it.
 */
const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function derivedRaw() {
  const j: any = JSON.parse(JSON.stringify(raw));
  const home = j.homeTeam.id, away = j.awayTeam.id;
  const byTeam = (t: number) => j.rosterSpots.filter((r: any) => r.teamId === t && r.positionCode !== "G");
  let h = 0, a = 0, k = 0;
  const shots = j.plays.filter((p: any) => p.typeDescKey === "shot-on-goal");
  for (const i of [0, 3, 6]) {
    const p = shots[i], d = p.details, mates = byTeam(d.eventOwnerTeamId).filter((r: any) => r.playerId !== d.shootingPlayerId);
    p.typeDescKey = "goal";
    d.scoringPlayerId = d.shootingPlayerId;
    d.assist1PlayerId = mates[k % mates.length].playerId;
    if (i !== 3) d.assist2PlayerId = mates[(k + 1) % mates.length].playerId; // goal 2 has one assist
    k += 2;
    if (d.eventOwnerTeamId === home) h++; else a++;
    d.homeScore = h; d.awayScore = a;
  }
  const n = j.plays.length;
  j.plays.forEach((p: any, i: number) => { if (i > n * 0.66) p.periodDescriptor.number = 3; else if (i > n * 0.33) p.periodDescriptor.number = 2; });
  return j;
}
const feedFor = (state: string) => {
  const f: any = normalizeGameFeed(derivedRaw());
  return { ...f, state, end: state === "FINAL" ? "REG" : undefined };
};
const live = feedFor("LIVE");
const base = { season, type: 2, date: day, scheduleState: "OK", broadcasts: [], round: null, venue: "Test Arena" };
const row = (id: number, state: string) => ({ ...base, id, home: live.home, away: live.away, state, period: 3, periodType: "REG", clock: "10:00", end: state === "FINAL" ? "REG" : undefined, awayScore: live.plays.filter((p: any) => p.type === "goal" && p.team === live.away).length, homeScore: live.plays.filter((p: any) => p.type === "goal" && p.team === live.home).length, start: new Date(Date.now() - 6000000).toISOString(), homeShots: 12, awayShots: 9 });
const LIVE_ID = 9601, FINAL_ID = 9602;

type Opts = { plays?: any[]; counter?: { n: number } };
async function setup(page: Page, o: Opts = {}) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [row(LIVE_ID, "LIVE"), row(FINAL_ID, "FINAL")] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/player/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    if (o.counter) o.counter.n++;
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const f = id === LIVE_ID ? live : feedFor("FINAL");
    const plays = o.plays ?? f.plays;
    return route.fulfill({ json: { ...f, id, plays, shots: plays.filter((p: any) => p.type === "shot-on-goal" || p.type === "goal"), goals: plays.filter((p: any) => p.type === "goal") } });
  });
}
async function openPbp(page: Page, id: number, query = "") {
  await page.goto(`/${query}`);
  if (id === FINAL_ID) await page.getByRole("button", { name: /completed/ }).click();
  await page.locator(`.sb-row[data-game="${id}"] .sb-main`).click();
  await page.getByRole("tab", { name: "Play-by-Play" }).click(); // the overlay is lazy: wait for the tab rather than probing for it
  const pbp = page.getByTestId("pbp");
  await expect(pbp).toBeVisible();
  await expect(page.getByTestId("pbp-event").first()).toBeVisible();
  return pbp;
}
const ids = (page: Page) => page.getByTestId("pbp-event").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-event-id"))));
const GOALS = live.plays.filter((p: any) => p.type === "goal");

test("derived fixture really has goals with assists and score after", () => {
  expect(GOALS).toHaveLength(3);
  expect(GOALS.every((g: any) => g.score && g.assists.length >= 1)).toBe(true);
});

test("renders every real event once; chronological for a final, newest first while live", async ({ page }) => {
  await setup(page);
  await openPbp(page, FINAL_ID);
  const fin = await ids(page);
  expect(fin).toHaveLength(live.plays.length);
  expect(new Set(fin).size).toBe(fin.length);
  expect(fin).toEqual(live.plays.map((p: any) => p.id)); // chronological by `order`
  await page.getByTestId("pbp-order").click();
  expect(await ids(page)).toEqual([...fin].reverse());
  await page.reload();
  await openPbp(page, LIVE_ID);
  expect(await ids(page)).toEqual([...fin].reverse()); // live default: newest first
  await expect(page.getByTestId("pbp-order")).toHaveAttribute("aria-pressed", "true");
});

test("filters by type and team", async ({ page }) => {
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  await pbp.getByTestId("pbp-filter-goals").click();
  await expect(pbp.getByTestId("pbp-filter-goals")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pbp-event")).toHaveCount(3);
  const g1 = page.locator(`#ev-${GOALS[0].id}`);
  await expect(g1).toContainText("Goal 1");
  await expect(g1).toContainText("Assists");
  await expect(g1.locator(".pbp-score")).toContainText(`${live.away} `);
  await expect(g1.locator(".pbp-derived")).toHaveCount(0); // score after is the feed's own in the fixture
  await pbp.getByTestId("pbp-filter-hits").click();
  const n = await page.getByTestId("pbp-event").count();
  expect(n).toBeGreaterThan(3);
  await pbp.getByTestId("pbp-filter-all").click();
  await expect(page.getByTestId("pbp-event")).toHaveCount(live.plays.length);
  await pbp.getByTestId(`pbp-filter-team-${live.away}`).click();
  const sides = await page.getByTestId("pbp-event").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-side")))]);
  expect(sides).toEqual(["away"]);
  await pbp.getByTestId("pbp-filter-team-neutral").click();
  const neutral = await page.getByTestId("pbp-event").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-side")))]);
  expect(neutral).toEqual(["neutral"]);
  await pbp.getByTestId("pbp-filter-team-all").click();
  await pbp.getByTestId("pbp-filter-penalties").click();
  await expect(page.locator(".pbp-event[data-type=penalty] .pbp-badge").first()).toContainText(/min/);
});

test("jump to next goal scrolls to and highlights goals in order, wrapping", async ({ page }) => {
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  const next = pbp.getByTestId("pbp-next-goal");
  for (const g of [GOALS[0], GOALS[1], GOALS[2], GOALS[0]]) {
    await next.click();
    const el = page.locator(`#ev-${g.id}`);
    await expect(el).toHaveAttribute("data-focus", "true");
    await expect(el).toBeInViewport();
  }
  await pbp.getByTestId("pbp-goal-list").getByRole("button").nth(2).click();
  await expect(page.locator(`#ev-${GOALS[2].id}`)).toHaveAttribute("data-focus", "true");
});

test("period navigation jumps to a period section", async ({ page }) => {
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  await expect(pbp.locator("h3.pbp-period-h")).toHaveText([/1st period/, /2nd period/, /3rd period/]);
  await pbp.getByTestId("pbp-period-P3").click();
  await expect(pbp.locator("h3.pbp-period-h", { hasText: "3rd period" })).toBeInViewport();
});

test("a player name opens that player's profile", async ({ page }) => {
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  const scorer = page.locator(`#ev-${GOALS[0].id} .pbp-player`).first();
  await scorer.scrollIntoViewIfNeeded();
  await scorer.click();
  await expect(page).toHaveURL(new RegExp(`player=${GOALS[0].pid}`));
  await expect(pbp).toBeAttached();
});

test("an identical second poll adds no duplicate rows", async ({ page }) => {
  const counter = { n: 0 };
  await page.clock.install();
  await setup(page, { counter });
  await openPbp(page, LIVE_ID);
  const before = await ids(page);
  const first = counter.n;
  await page.clock.fastForward(125_000);
  await expect.poll(() => counter.n).toBeGreaterThan(first);
  const after = await ids(page);
  expect(after).toEqual(before);
  expect(new Set(after).size).toBe(after.length);
});

test("?event= highlights and scrolls to that event, even behind a filter", async ({ page }) => {
  await setup(page);
  const id = GOALS[1].id;
  const pbp = await openPbp(page, FINAL_ID);
  await pbp.getByTestId("pbp-filter-hits").click(); // hides goals
  await expect(page.locator(`#ev-${id}`)).toHaveCount(0);
  // The app may rewrite the address on load, so set the parameter the way a deep link / Back would: history + popstate.
  await page.evaluate((e) => { history.pushState({}, "", `${location.pathname}${location.search}${location.search ? "&" : "?"}event=${e}`); window.dispatchEvent(new PopStateEvent("popstate")); }, id);
  await expect(page.locator(`#ev-${id}`)).toHaveAttribute("data-focus", "true");
  await expect(page.locator(`#ev-${id}`)).toBeInViewport();
});

test("a goal flagged disallowed shows the badge; no flag, no badge", async ({ page }) => {
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  await expect(pbp.getByText("Disallowed")).toHaveCount(0); // optional store fields absent: nothing invented
});

test("360px: no sideways overflow; keyboard toggles chips", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page);
  const pbp = await openPbp(page, FINAL_ID);
  const over = await page.evaluate(() => {
    const d = document.querySelector("dialog.game-dialog") as HTMLElement, p = document.querySelector("[data-testid=pbp]") as HTMLElement;
    return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, dlg: d.scrollWidth - d.clientWidth, pbp: p.scrollWidth - p.clientWidth };
  });
  expect(over.doc).toBeLessThanOrEqual(0);
  expect(over.dlg).toBeLessThanOrEqual(0);
  expect(over.pbp).toBeLessThanOrEqual(0);
  const chip = pbp.getByTestId("pbp-filter-hits");
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  const small = await pbp.locator(".pbp-chip").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43).length);
  expect(small).toBe(0);
});

test("400 events stay light: content-visibility on rows, every row present", async ({ page }) => {
  const long: any[] = [];
  for (let r = 0; r < 4; r++) live.plays.forEach((p: any) => long.push({ ...p, id: p.id + r * 100000, order: p.order + r * 10000 }));
  await setup(page, { plays: long.slice(0, 400) });
  const t0 = Date.now();
  await openPbp(page, FINAL_ID);
  await expect(page.getByTestId("pbp-event")).toHaveCount(Math.min(400, long.length));
  const cv = await page.getByTestId("pbp-event").nth(5).evaluate((e) => getComputedStyle(e).contentVisibility);
  expect(cv).toBe("auto");
  expect(Date.now() - t0).toBeLessThan(15000);
});
