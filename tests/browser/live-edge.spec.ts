import { test, expect } from "@playwright/test";
import fixture from "../fixtures/live-game.json" with { type: "json" };
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };
import edgeFixture from "../../public/data/edge/20252026/EDM.json" with { type: "json" };
test("live data updates without collapsing open cards; failure retains last score", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  const game = {
    ...scoreboardFixture.games.find((g) => g.id === fixture.id)!,
    state: "LIVE",
    homeScore: 0,
  };
  await page.route("**/api/live", async (route) => {
    calls++;
    if (calls > 2)
      return route.fulfill({
        status: 503,
        json: { error: "Temporary outage" },
      });
    await route.fulfill({
      json: {
        updatedAt: new Date().toISOString(),
        date: game.date,
        games: [{ ...game, homeScore: calls - 1 }],
      },
    });
  });
  await page.route("**/api/game/*", (route) =>
    route.fulfill({ json: { ...fixture, state: "LIVE", homeScore: Math.min(calls - 1, 1), plays: calls > 1 ? [{id:9001,order:1,period:1,time:"19:00",type:"goal",team:fixture.home,player:"Test Scorer",penalty:null}] : [] } }),
  );
  await page.goto("/");
  await expect(page.locator(".live-strip")).toContainText("FLA");
  await page.locator(".live-strip button").first().click();
  const card = page.locator(".live-card").first();
  await card.scrollIntoViewIfNeeded();
  await card.locator(".game-card-summary").click();
  await expect(card.locator(".shot-chart").first()).toBeVisible();
  await expect(card.getByLabel("Live winner projection")).toBeVisible();
  await expect(card.getByLabel("Projected final score")).toBeVisible();
  await expect(card.locator(".projection .prediction-labels")).toContainText("%");
  await expect(card.locator(".scenario-grid")).toHaveCount(0);
  await expect(card.locator(".hit-chart")).toBeVisible();
  await expect(card.locator(".ice-tilt")).toContainText("Shot-pressure proxy");
  await expect(card.locator('.interactive-pulse').first()).toHaveAttribute('data-metric','hits');
  const shotsGraph=card.locator('[data-metric="shots"]');
  await expect(shotsGraph.locator('.pulse-readout img')).toHaveCount(2);
  const scrubber=card.getByRole('slider',{name:'Shots timeline time'});
  await scrubber.focus(); await scrubber.press('Home');
  await expect(shotsGraph.locator('.pulse-readout')).toContainText('P1 0:00 elapsed');
  await expect(shotsGraph.locator('.pulse-readout strong').first()).toHaveText('0 SOG');
  await scrubber.press('End');
  await expect(shotsGraph.locator('.pulse-readout')).toContainText('P1 20:00 elapsed');
  const bounds=await shotsGraph.locator('.shot-chart').boundingBox();
  await shotsGraph.locator('.shot-chart').hover({position:{x:bounds!.width/2,y:bounds!.height/2}});
  await expect(shotsGraph.locator('.pulse-readout')).toContainText('Selected point');
  const previousEstimate = await card.locator(".projection .prediction-labels").innerText();
  await card.getByRole("button", { name: /Open full game card/ }).click();
  await card.getByText("Why this game matters", { exact: false }).click();
  await expect(card.locator(".card-details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page.clock.fastForward(31000);
  await expect(card.locator(".matchup-team").last().locator("b")).toHaveText(
    "1",
  );
  await expect(card.locator(".card-details").first()).toHaveAttribute(
    "open",
    "",
  );
  await expect(card.locator(".projection .prediction-labels")).not.toHaveText(previousEstimate);
  await expect(card.locator(".prediction-change")).toContainText("pp since previous update");
  await expect(card.locator(".prediction-change")).toContainText("goal (Test Scorer)");
  await card.locator(".hit-chart").scrollIntoViewIfNeeded();
  await page.screenshot({path: `../nhl-pulse-${test.info().project.name}.png`});
  await page.clock.fastForward(31000);
  await expect(page.locator(".live-strip")).toContainText("Update unavailable");
  await expect(card.locator(".matchup-team").last().locator("b")).toHaveText(
    "1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("EDGE comparison shows source season, league benchmarks and shot data", async ({
  page,
}) => {
  await page.route("**/api/edge/**", (route) =>
    route.fulfill({ json: {...edgeFixture,season:20262027,requestedSeason:20262027} }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "NHL EDGE", exact: true }).click();
  const card = page.locator(".edge-grid .edge-card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Top skating speed");
  await expect(card).toContainText("2026–27");
  await expect(card).not.toContainText("Previous-season context");
  await expect(card.locator(".edge-metric")).toHaveCount(4);
  await expect(card.locator(".zone-labels")).toContainText("Offensive");
  await expect(card.locator(".location-row")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("full game overlay shows projection, ice tilt and a per-team player tracker with ice time", async ({
  page,
}, info) => {
  const game = scoreboardFixture.games.find((g) => g.id === fixture.id)!;
  await page.route("**/api/live", (route) =>
    route.fulfill({
      json: { updatedAt: new Date().toISOString(), date: game.date, games: [game] },
    }),
  );
  const plays = fixture.shots.map((s, i) => ({
    id: s.id,
    order: i + 1,
    period: s.period,
    periodType: s.periodType,
    time: s.time,
    team: s.team,
    type: "shot-on-goal",
    player: s.player,
    penalty: null,
    duration: null,
  }));
  await page.route("**/api/game/*", (route) =>
    route.fulfill({ json: { ...fixture, plays } }),
  );
  const boxscore = {
    id: fixture.id,
    state: "LIVE",
    updatedAt: new Date().toISOString(),
    homeShots: fixture.homeShots,
    awayShots: fixture.awayShots,
    players: [
      { id: 1, number: 9, name: "FLA Top Scorer", team: "FLA", position: "C", hits: 2, goals: 2, assists: 1, shots: 4, plusMinus: 2, pim: 0, toi: "18:32", saves: null, shotsAgainst: null, goalsAgainst: null },
      { id: 2, number: 10, name: "FLA Bottom Player", team: "FLA", position: "D", hits: 0, goals: 0, assists: 0, shots: 0, plusMinus: -3, pim: 4, toi: "9:10", saves: null, shotsAgainst: null, goalsAgainst: null },
      { id: 3, number: 1, name: "FLA Goalie", team: "FLA", position: "G", hits: null, goals: null, assists: null, shots: null, plusMinus: null, pim: null, toi: "42:00", saves: 28, shotsAgainst: 30, goalsAgainst: 2 },
      { id: 4, number: 19, name: "CAR Top Scorer", team: "CAR", position: "C", hits: 1, goals: 1, assists: 2, shots: 3, plusMinus: 1, pim: 0, toi: "17:45", saves: null, shotsAgainst: null, goalsAgainst: null },
      { id: 5, number: 20, name: "CAR Bottom Player", team: "CAR", position: "D", hits: 0, goals: 0, assists: 0, shots: 1, plusMinus: -2, pim: 6, toi: "8:02", saves: null, shotsAgainst: null, goalsAgainst: null },
      { id: 6, number: 30, name: "CAR Goalie", team: "CAR", position: "G", hits: null, goals: null, assists: null, shots: null, plusMinus: null, pim: null, toi: "42:00", saves: 24, shotsAgainst: 26, goalsAgainst: 1 },
    ],
  };
  await page.route("**/api/boxscore/**", (route) => route.fulfill({ json: boxscore }));
  await page.goto("/");
  await expect(page.locator(".live-strip")).toContainText("FLA");
  await page.locator(".live-strip button").first().click();
  const card = page.locator(".live-card").first();
  await card.locator(".game-card-summary").click();
  await card.getByRole("button", { name: /Open full game card/ }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await card.getByRole("button", { name: /Full game view/ }).click();
  const dialog = page.locator("dialog.game-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog.getByRole("button", { name: "Close full game view" })).toBeFocused();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(dialog.locator(".dialog-team")).toHaveCount(2);
  await expect(dialog).toContainText("Florida Panthers");
  await expect(dialog).toContainText("Carolina Hurricanes");
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 800 });
    const layout = await dialog.evaluate((element) => {
      const rect = (node: Element) => node.getBoundingClientRect();
      const toolbar = rect(element.querySelector(".dialog-toolbar")!);
      const matchup = rect(element.querySelector(".dialog-matchup")!);
      const teams = [...element.querySelectorAll(".dialog-team")].map((team) => {
        const label = rect(team.querySelector(":scope > div")!);
        const score = rect(team.querySelector(":scope > b, :scope > small")!);
        return { row: rect(team), scoreGap: score.left - label.right };
      });
      return {
        overflow: element.scrollWidth - element.clientWidth,
        toolbarGap: matchup.top - toolbar.bottom,
        rowGap: teams[1].row.top - teams[0].row.bottom,
        scoreGaps: teams.map((team) => team.scoreGap),
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.toolbarGap).toBeGreaterThanOrEqual(8);
    expect(layout.rowGap).toBeGreaterThanOrEqual(8);
    for (const gap of layout.scoreGaps) expect(gap).toBeGreaterThanOrEqual(8);
  }
  // Real-time / projection content, reused from the inline card's GameData.
  await expect(dialog.getByLabel("Live winner projection")).toBeVisible();
  await expect(dialog.locator(".ice-tilt")).toContainText("ICE TILT");
  await expect(dialog.locator(".shot-chart")).toHaveCount(2);
  // Player tracker: ice time and top/bottom-3 broken out per team.
  await expect(dialog).toContainText("PLAYER TRACKER");
  const trackerTeams = dialog.locator(".tracker-team");
  await expect(trackerTeams).toHaveCount(2);
  await expect(trackerTeams.first()).toContainText("Top performers");
  await expect(trackerTeams.first()).toContainText("FLA Top Scorer");
  await expect(trackerTeams.first()).toContainText("18:32");
  await expect(trackerTeams.first()).toContainText("Struggling");
  await expect(trackerTeams.first()).toContainText("FLA Bottom Player");
  await expect(trackerTeams.last()).toContainText("CAR Top Scorer");
  await expect(trackerTeams.last()).toContainText("CAR Bottom Player");
  await expect(dialog).toContainText("FLA Goalie");
  await expect(dialog).toContainText("CAR Goalie");
  await dialog.getByRole("button", { name: "Close full game view" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
test('current EDGE labels a prior-season fallback',async({page})=>{
 await page.route('**/api/edge/**',r=>r.fulfill({json:edgeFixture}));
 await page.goto('/'); await page.getByRole('button',{name:'NHL EDGE',exact:true}).click();
 await expect(page.locator('.edge-grid .edge-card').first()).toContainText('Previous-season totals');
 await expect(page.locator('.edge-grid .edge-card').first().locator('.edge-metric')).toHaveCount(4);
});
