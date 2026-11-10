import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };
import real from "../../public/data/seasons/20252026.json" with { type: "json" };
import { derivedGoalPlays, realPenaltyPlays } from "../fixtures/derive-intel.mjs";

// DERIVED fixtures (see tests/fixtures/derive-intel.mjs): the season is the REAL 2025-26 game list cut at 2026-03-22, relabelled to the current
// season id; the final is the real COL 3 at WSH 2 (overtime) game moved to today (later real games kept as unplayed), with the goals of the real SJS-at-STL 3-2 overtime game
// (same score and ending) mapped SJS->COL and STL->WSH. The live game is the real CHI-STL goal order (first four goals) mapped CHI->TOR and
// STL->BOS, with the real recorded penalties mapped CAR->TOR, FLA->BOS. The live situation is a test input (the app never invents one).
const season = manifest.current;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const REAL_ID = 2025021111;
const realFinal = (real.games as any[]).find((g) => g.id === REAL_ID);
const earlier = (real.games as any[]).filter((g) => g.date < realFinal.date && g.state !== "FUT").map((g) => ({ ...g, season }));
// the rest of the real schedule stays as not-yet-played games (the computed clinch needs the games remaining)
const later = (real.games as any[]).filter((g) => (g.date > realFinal.date || (g.date === realFinal.date && g.id !== REAL_ID)) && g.type === 2).map((g) => ({ ...g, season, state: "FUT", homeScore: null, awayScore: null, end: "", date: "2099-01-01", start: "2099-01-01T00:00:00Z" }));
const finalGame = { ...realFinal, season, date: today, start: new Date(Date.now() - 3 * 3600000).toISOString() };
const base = { season, type: 2, date: today, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null };
const live = { ...base, id: 9701, home: "TOR", away: "BOS", state: "LIVE", period: 3, periodType: "REG", clock: "12:00", awayScore: 1, homeScore: 3, start: new Date(Date.now() - 6000000).toISOString(), homeShots: 20, awayShots: 15 };
const map = (t: string | null, m: Record<string, string>) => (t ? m[t] ?? t : t);
const finalPlays = derivedGoalPlays(2026020063).map((p: any) => ({ ...p, team: map(p.team, { SJS: "COL", STL: "WSH" }) }));
const livePlays = [
  ...derivedGoalPlays(2026020050).slice(0, 4).map((p: any) => ({ ...p, team: map(p.team, { CHI: "TOR", STL: "BOS" }) })),
  ...realPenaltyPlays().map((p: any) => ({ ...p, order: p.order + 1000, team: map(p.team, { CAR: "TOR", FLA: "BOS" }) })),
];
const situation = { home: 4, away: 5, homePowerPlay: false, awayPowerPlay: true, seconds: 72 };

async function open(page: Page, id: number) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [...earlier, finalGame, live, ...later] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/league-matchups/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/data/league-matchups/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    const gid = Number(new URL(route.request().url()).pathname.split("/").pop());
    const g = gid === live.id ? live : finalGame;
    const plays = gid === live.id ? livePlays : finalPlays;
    return route.fulfill({ json: { ...g, plays, shots: [], goals: plays.filter((p: any) => p.type === "goal"), stats: [], situation: gid === live.id ? situation : null, updatedAt: new Date().toISOString() } });
  });
  await page.goto("/");
  if (id === live.id) await page.locator(`.sb-row[data-game="${id}"] .sb-main`).click();
  else await page.getByRole("button", { name: /Colorado Avalanche at Washington Capitals.*full game view/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  const tab = dialog.getByRole("tab", { name: "Matchup Intelligence" });
  if (await tab.count()) await tab.click(); // once the Game Center tabs exist the pane lives behind this tab
  return { dialog, pane: dialog.getByTestId("gc-intel") };
}

test("a final shows postgame flow and standings impact from the real pregame table, each with its basis label (derived fixture)", async ({ page }) => {
  const { pane } = await open(page, REAL_ID);
  await expect(pane.locator('[data-group="post"]')).toBeVisible();
  await expect(pane.locator('[data-group="live"], [data-group="pre"]')).toHaveCount(0);
  const clinch = pane.locator('[data-intel-id="clinch-COL"]');
  await expect(clinch).toContainText("Avalanche clinch a playoff spot (computed from points)");
  await expect(clinch.locator(".gc-basis")).toHaveText("Derived");
  await expect(pane.locator('[data-intel-id="game-winner"]')).toContainText("Game-winning goal");
  await expect(pane.locator('[data-intel-id="lead-changes"]')).toContainText("1 lead change, tied 2 times");
  const items = pane.locator("[data-intel-id]");
  const n = await items.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) await expect(items.nth(i).locator(".gc-basis")).toHaveText(/^(Official|Derived|Historical|Projection)$/);
  await expect(pane.getByRole("term").filter({ hasText: "Derived" })).toBeVisible(); // the legend
  await expect(pane.getByRole("button", { name: /Avalanche profile/ }).first()).toBeVisible();
});

test("nothing in the pane repeats an insight, season series, form or odds already shown for the game", async ({ page }) => {
  const { dialog, pane } = await open(page, REAL_ID);
  await expect(pane.locator("[data-intel-id]").first()).toBeVisible();
  const insightIds = await dialog.locator("[data-insight-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-insight-id")));
  const mine = await pane.locator("[data-intel-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-intel-id")));
  for (const id of mine) expect(insightIds).not.toContain(id);
  expect(await pane.innerText()).not.toMatch(/season series|win streak|playoff chance|odds/i);
});

test("a live game shows lead changes, the unanswered run and the current power play as Official (derived fixture, test situation)", async ({ page }) => {
  const { pane } = await open(page, live.id);
  await expect(pane.locator('[data-group="live"]')).toBeVisible();
  const run = pane.locator('[data-intel-id^="run-TOR"]');
  await expect(run).toContainText("Maple Leafs scored 3 unanswered");
  await expect(run.locator(".gc-basis")).toHaveText("Derived");
  const pp = pane.locator('[data-intel-id="pp-now"]');
  await expect(pp).toContainText("Bruins on the power play (5-on-4)");
  await expect(pp.locator(".gc-basis")).toHaveText("Official");
  await expect(pane.locator('[data-intel-id="penalties"]')).toContainText("Bruins 1 (5 min), Maple Leafs 3 (9 min)");
  await expect(pane.locator('[data-intel-id="first-goal"]')).toContainText("Bruins scored first");
});

test("the pane fits 360px without sideways scroll and its links are tap sized", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { dialog, pane } = await open(page, REAL_ID);
  await expect(pane.locator("[data-intel-id]").first()).toBeVisible();
  const over = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="gc-intel"]') as HTMLElement;
    return { pane: p.scrollWidth - p.clientWidth, doc: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(over.pane).toBeLessThanOrEqual(0);
  expect(over.doc).toBeLessThanOrEqual(0);
  const link = pane.locator(".gc-intel-link").first();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  void dialog;
});
