import { test, expect, type Page, type Locator } from "@playwright/test";
import { selectAllTeams, showPeriod } from "./controls";
import { existsSync, readFileSync } from "node:fs";

const dir = "public/data/moneypuck/20262027";
const read = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
const games = read("games.json"), summary = read("summary.json");
// Saved shots are a rolling window that the daily refresh prunes, so the tests keep their own copies of the games they use.
const fixture = (id: string) => JSON.parse(readFileSync(`tests/fixtures/shots/${id}.json`, "utf8"));
const OT = fixture("2026020063"), SO = fixture("2026020068");
const today = new Date().toLocaleDateString("en-CA");
const base = { season: 20262027, type: 2, date: today, scheduleState: "OK", venue: "Test Arena", broadcasts: ["ESPN (US)"], round: null, end: "REG" };
const at = (h: number) => `${today}T${String(h).padStart(2, "0")}:00:00Z`;
const G = {
  future: { ...base, id: 2026020901, start: at(23), state: "FUT", home: "CHI", away: "EDM", homeScore: null, awayScore: null },
  live: { ...base, id: 2026020902, start: at(18), state: "LIVE", home: "MIN", away: "BOS", homeScore: 1, awayScore: 2, period: 2, periodType: "REG", clock: "10:00", intermission: false, homeShots: 14, awayShots: 11 },
  intermission: { ...base, id: 2026020903, start: at(17), state: "LIVE", home: "NJD", away: "NYR", homeScore: 0, awayScore: 0, period: 1, periodType: "REG", clock: "13:00", intermission: true },
  ot: { ...base, id: 2026020063, start: at(5), state: "FINAL", home: "STL", away: "SJS", homeScore: 2, awayScore: 3, end: "OT" },
  so: { ...base, id: 2026020068, start: at(4), state: "FINAL", home: "CBJ", away: "PIT", homeScore: 2, awayScore: 3, end: "SO" },
  noshots: { ...base, id: 2026020001, start: at(3), state: "FINAL", home: "CAR", away: "FLA", homeScore: 0, awayScore: 1, end: "OT" },
  pending: { ...base, id: 2026020999, start: at(2), state: "FINAL", home: "SEA", away: "COL", homeScore: 3, awayScore: 1 },
} as const;
type K = keyof typeof G;
const pen = (period: number, time: string, team: string) => ({ id: period * 100, order: period * 100, period, periodType: "REG", time, type: "penalty", team, player: "Test Player", penalty: "Tripping", duration: 2 });

async function mount(page: Page, keys: K[], opts: { summary?: (j: any) => any; failSummary?: boolean } = {}) {
  const list = keys.map((k) => G[k]);
  // The three games' shots come from the test's own copies; the saved shots on disk are pruned by the daily refresh.
  await page.route(/\/moneypuck\/20262027\/shots\/(\d{10})(\.json)?$/, (r) => {
    const id = /(\d{10})(\.json)?$/.exec(new URL(r.request().url()).pathname)![1];
    return existsSync(`tests/fixtures/shots/${id}.json`) ? r.fulfill({ json: fixture(id) }) : r.fallback();
  });
  await page.route("**/api/season/20262027", (r) => r.fulfill({ json: { season: 20262027, updatedAt: new Date().toISOString(), source: "test", games: list } }));
  await page.route("**/api/live", (r) => r.fulfill({ json: { date: today, updatedAt: new Date().toISOString(), games: list.filter((g) => g.state === "LIVE") } }));
  await page.route("**/api/game/*", (r) => {
    const id = Number(new URL(r.request().url()).pathname.split("/").pop());
    const g = list.find((x) => x.id === id) ?? list[0];
    r.fulfill({ json: { ...g, updatedAt: new Date().toISOString(), shots: [], goals: [], stats: [], plays: id === 2026020063 ? [pen(2, "05:00", "STL"), pen(3, "10:30", "SJS")] : [] } });
  });
  await page.route("**/api/boxscore/2026020063", (r) => {
    const gs = games.games["2026020063"].goalies;
    r.fulfill({ json: { id: 2026020063, players: gs.map((g: any) => ({ id: g.id, name: g.name, team: g.team, position: "G", shotsAgainst: g.SOG })) } });
  });
  if (opts.failSummary) {
    await page.route("**/moneypuck/20262027/summary**", (r) => r.abort());
  } else if (opts.summary) {
    await page.route("**/data/moneypuck/20262027/summary.json", async (r) => { const j = JSON.parse(readFileSync(`${dir}/summary.json`, "utf8")); r.fulfill({ json: opts.summary!(j) }); });
  }
  await page.goto("/?view=games");
  await selectAllTeams(page);
}
/** Picks a situation radio and waits until it is selected: a click that lands while the card is still re-rendering from newly loaded data is lost, so retry it. */
async function pickSituation(flow: Locator, name: string) {
  const radio = flow.getByRole("radio", { name });
  await expect(async () => {
    await radio.click();
    await expect(radio).toBeChecked({ timeout: 1000 });
  }).toPass();
}
const card = (page: Page, k: K) => page.locator(".game-card").filter({ has: page.locator(`.matchup-team img[src="/logos/${G[k].away}.svg"]`) }).filter({ has: page.locator(`.matchup-team img[src="/logos/${G[k].home}.svg"]`) }).first();
async function show(page: Page, k: K): Promise<Locator> {
  const past = G[k].state === "FINAL";
  await showPeriod(page, past ? "past" : "future");
  const c = card(page, k);
  await c.scrollIntoViewIfNeeded();
  await expect(c).toBeVisible();
  return c;
}
const pct1 = (team: string) => { const r = summary.teams[team]["5on5"]; return `${((r.xGF / (r.xGF + r.xGA)) * 100).toFixed(1)}%`; };
const sum = (shots: any[], team: string) => shots.filter((s) => s.team === team).reduce((t, s) => t + s.xg, 0);

test("pregame strip: season profile, sample, 5v5 xG share from the data, PP/PK, starter, matchup detail", async ({ page }) => {
  await mount(page, ["future"]);
  const c = await show(page, "future");
  const strip = c.getByTestId("nhlp-strip");
  await expect(strip).toContainText("Season profile");
  await expect(strip).toContainText("2026–27 season");
  await expect(strip.locator("[data-row=xg5]")).toContainText(pct1("EDM"));
  await expect(strip.locator("[data-row=xg5]")).toContainText(pct1("CHI"));
  await expect(strip).toContainText(/\d+ GP/);
  await expect(strip.locator("[data-row=pp]")).toContainText("xG/60");
  await expect(strip.locator("[data-row=pk]")).toContainText("xGA/60");
  await expect(strip.locator("[data-row=gsax]")).toContainText(/Projected|Starter unknown|Not in MoneyPuck/);
  await expect(strip.locator(".nhlp-detail")).not.toBeEmpty();
  await expect(strip.getByRole("link", { name: "Data: MoneyPuck.com" })).toBeVisible();
  await expect(strip).toContainText(/updated/i);
  // GSAx matches goalies.csv-style math (xGA - GA) for the shown starter when one is matched
  const text = await strip.locator("[data-row=gsax]").innerText();
  const m = /([+−])(\d+\.\d)/.exec(text);
  if (m) {
    const vals = summary.goalies.map((g: any) => g.sit.all.xGA - g.sit.all.GA);
    expect(vals.some((v: number) => Math.abs(v - Number(m[2]) * (m[1] === "−" ? -1 : 1)) < 0.06)).toBe(true);
  }
});

test("NHL+ button opens the matchup view, keeps the card compact; the card itself still expands", async ({ page }) => {
  await mount(page, ["future"]);
  const c = await show(page, "future");
  await page.evaluate(() => { (window as any).__nhlp = []; window.addEventListener("iceboard:nhlplus", (e) => (window as any).__nhlp.push((e as CustomEvent).detail)); });
  await c.getByTestId("nhlp-strip").getByRole("button", { name: /NHL\+/ }).click();
  const events = await page.evaluate(() => (window as any).__nhlp);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ view: "matchups", away: "EDM", home: "CHI", gameId: G.future.id });
  await expect(c.locator(".card-expanded")).toHaveCount(0);
});

test("the NHL+ button is not inside the card's expand button", async ({ page }) => {
  await mount(page, ["future"]);
  const c = await show(page, "future");
  expect(await c.evaluate((el) => !!el.querySelector(".game-card-summary .nhlp-btn") || !el.querySelector(".nhlp-strip .nhlp-btn"))).toBe(false);
  await c.locator(".game-card-summary").click();
  await expect(c.locator(".card-expanded")).toBeVisible();
  expect(await c.evaluate((el) => !!el.querySelector(".game-card-summary .nhlp-btn, button .nhlp-btn, .nhlp-btn button"))).toBe(false);
});

test("expanded card: aligned comparisons with exact values, definitions, NHL+ button near the top", async ({ page }) => {
  await mount(page, ["future"]);
  const c = await show(page, "future");
  await c.locator(".game-card-summary").click();
  await expect(c.getByTestId("nhlp-strip")).toHaveCount(0);
  const ex = c.getByTestId("nhlp-expanded");
  await expect(ex).toBeVisible();
  for (const h of ["Chance creation", "Defensive suppression", "Special teams", "Goaltending"]) await expect(ex).toContainText(h);
  // The last row (recent trend) comes from a second request that finishes after the season profile, so wait for it.
  await expect.poll(() => ex.locator(".mp-cmp").count()).toBeGreaterThanOrEqual(7);
  await expect(ex).toContainText(/\d+ GP · [\d.]+ min/);
  await expect(ex.getByText("Recent trend")).toBeVisible();
  await expect(ex).toContainText(/derived from shot-level data|Recent games are not available/);
  // NHL+ button precedes "Why it matters" and does not collapse the card
  const before = await c.evaluate((el) => { const b = el.querySelector(".nhlp-expanded .nhlp-btn")!, w = el.querySelector(".why-watch")!; return !!(b.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING); });
  expect(before).toBe(true);
  await ex.locator(".mp-tip").first().hover();
  await expect(ex.getByRole("tooltip")).toBeVisible();
  await page.evaluate(() => { (window as any).__n = 0; window.addEventListener("iceboard:nhlplus", () => (window as any).__n++); });
  await ex.getByRole("button", { name: /NHL\+/ }).click();
  expect(await page.evaluate(() => (window as any).__n)).toBe(1);
});

test("live and intermission cards keep the season profile and say MoneyPuck has nothing live", async ({ page }) => {
  await mount(page, ["live", "intermission"]);
  for (const k of ["live", "intermission"] as K[]) {
    const c = await show(page, k);
    await expect(c.getByTestId("nhlp-strip")).toContainText("Season profile");
    const p = c.getByTestId("nhlp-pending");
    await expect(p).toContainText("no live feed");
    await expect(p).toHaveAttribute("data-mode", k);
    await expect(c.getByTestId("nhlp-game")).toHaveCount(0);
  }
  await expect(card(page, "intermission").getByTestId("intermission")).toBeVisible();
});

test("final game in the download: xG, goals, sparkline, timestamp; Confirmed starters from the box score", async ({ page }) => {
  await mount(page, ["ot"]);
  const c = await show(page, "ot");
  const g = c.getByTestId("nhlp-game");
  await expect(g).toContainText("This game");
  const log = games.games["2026020063"];
  await expect(g.locator("[data-row=xg]")).toContainText(log.teams.SJS.all.xGF.toFixed(2));
  await expect(g.locator("[data-row=xg]")).toContainText(log.teams.STL.all.xGF.toFixed(2));
  await expect(g.locator("[data-row=goals]")).toContainText(String(log.goals.away));
  await expect(g.getByTestId("flow-spark")).toBeVisible();
  await expect(g).toContainText(/Completed game · (saved copy · )?updated/);
  await expect(g.getByRole("link", { name: "Data: MoneyPuck.com" })).toBeVisible();
  await expect(c.getByTestId("nhlp-strip").locator("[data-row=gsax]")).toContainText("Confirmed");
});

test("chance flow: cumulative sums, OT boundaries and ticks line up, markers reveal details on hover and focus, goals vs penalties", async ({ page }) => {
  await mount(page, ["ot"]);
  const c = await show(page, "ot");
  await c.locator(".game-card-summary").click();
  const flow = c.getByTestId("chance-flow");
  await expect(flow).toBeVisible();
  await expect(flow).toContainText("Chance flow");
  const svg = flow.locator("svg").first();
  expect(Number(await svg.getAttribute("data-end"))).toBe(3900);
  expect(Number(await svg.getAttribute("data-through"))).toBe(3900);
  const lineAway = flow.getByTestId("flow-line-away"), lineHome = flow.getByTestId("flow-line-home");
  expect(Number(await lineAway.getAttribute("data-xg"))).toBeCloseTo(sum(OT.shots, "SJS"), 6);
  expect(Number(await lineHome.getAttribute("data-xg"))).toBeCloseTo(sum(OT.shots, "STL"), 6);
  // geometry: last point of each path sits at the scale position of the total; boundaries and ticks follow the clock
  const geo = await svg.evaluate((el) => {
    const grid = [...el.querySelectorAll(".flow-grid line")].map((l) => Number(l.getAttribute("y1")));
    const x = (sel: string) => [...el.querySelectorAll(sel)].map((l) => ({ t: Number(l.getAttribute("data-t")), x: Number((l.querySelector("line") ?? l).getAttribute("x1")) }));
    const lastY = (id: string) => { const d = el.querySelector(`[data-testid=${id}]`)!.getAttribute("d")!; const m = [...d.matchAll(/V ([\d.]+)/g)]; return Number(m[m.length - 1][1]); };
    const endX = (id: string) => Number(/H ([\d.]+)$/.exec(el.querySelector(`[data-testid=${id}]`)!.getAttribute("d")!)![1]);
    return { y0: grid[0], yTop: grid[grid.length - 1], top: Number(el.getAttribute("data-top")), boundaries: x("[data-testid=flow-boundary]"), ticks: x("[data-testid=flow-tick]"), awayY: lastY("flow-line-away"), homeY: lastY("flow-line-home"), awayEnd: endX("flow-line-away"), periods: [...el.querySelectorAll(".flow-period")].map((t) => t.textContent) };
  });
  const X = (t: number) => 30 + (t / 3900) * (352 - 30);
  expect(geo.boundaries.map((b) => b.t)).toEqual([1200, 2400, 3600]);
  for (const b of geo.boundaries) expect(b.x).toBeCloseTo(X(b.t), 0);
  expect(geo.ticks.map((t) => t.t)).toEqual([0, 600, 1200, 1800, 2400, 3000, 3600]);
  for (const t of geo.ticks) expect(t.x).toBeCloseTo(X(t.t), 0);
  expect(geo.periods).toEqual(["P1", "P2", "P3", "OT"]);
  const Y = (v: number) => geo.y0 - (v / geo.top) * (geo.y0 - geo.yTop);
  expect(geo.awayY).toBeCloseTo(Y(sum(OT.shots, "SJS")), 0);
  expect(geo.homeY).toBeCloseTo(Y(sum(OT.shots, "STL")), 0);
  expect(geo.awayEnd).toBeCloseTo(X(3900), 0);
  // markers: goals match the file, penalties come from the NHL feed and are a separate kind
  await expect(flow.getByTestId("marker-goal")).toHaveCount(OT.shots.filter((s: any) => s.g).length);
  await expect(flow.getByTestId("marker-penalty")).toHaveCount(2);
  await expect(flow.getByTestId("marker-shot")).toHaveCount(OT.shots.filter((s: any) => !s.g).length);
  await flow.getByTestId("marker-goal").first().hover();
  const tip = flow.getByTestId("marker-tip");
  await expect(tip).toContainText(/Goal · /);
  await expect(tip).toContainText(/Expected goal value 0\.\d{3}/);
  await expect(tip).toContainText(/ft from the net/);
  await expect(tip).toContainText("MoneyPuck");
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
  // keyboard: focus a marker, arrow to the next, tooltip follows focus
  await flow.getByTestId("marker-shot").first().focus();
  await expect(tip).toBeVisible();
  const first = await tip.innerText();
  await page.keyboard.press("ArrowRight");
  await expect(tip).toBeVisible();
  expect(await tip.innerText()).not.toBe(first);
    await flow.getByTestId("marker-penalty").first().focus();
  await expect(tip).toContainText("NHL feed");
  await expect(tip).toContainText("Tripping");
  // only one marker is a tab stop
  expect(await flow.locator(".flow-marker[tabindex='0']").count()).toBe(1);
  // the card did not collapse
  await expect(c.locator(".card-expanded")).toBeVisible();
});

test("shootout game: note about excluded attempts on the card, no shootout goals in the goals row", async ({ page }) => {
  await mount(page, ["so"]);
  const c = await show(page, "so");
  await expect(c.getByTestId("so-note")).toContainText("Shootout attempts are not in MoneyPuck");
  await expect(c.getByTestId("nhlp-game").locator("[data-row=goals]")).toContainText("(no shootout)");
  await expect(c.getByTestId("nhlp-game").locator("[data-row=goals] .nhlp-val b").first()).toHaveText("2");
  await c.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await expect(d.getByTestId("so-note")).toBeVisible();
  const svg = d.getByTestId("chance-flow").locator("svg").first();
  expect(Number(await svg.getAttribute("data-end"))).toBe(3900);
});

test("final without shot detail still shows the game block; final not yet downloaded shows a quiet pending note", async ({ page }) => {
  await mount(page, ["noshots", "pending"]);
  const a = await show(page, "noshots");
  await expect(a.getByTestId("nhlp-game")).toBeVisible();
  await expect(a.getByTestId("flow-spark")).toHaveCount(0);
  const p = await show(page, "pending");
  await expect(p.getByTestId("nhlp-pending")).toHaveText("MoneyPuck game data arrives after the nightly update.");
  await expect(p.getByTestId("nhlp-game")).toHaveCount(0);
  await expect(p.getByTestId("nhlp-strip")).toContainText("Season profile");
  await p.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await expect(d.getByTestId("gc-flow").getByTestId("nhlp-pending")).toBeVisible();
  await expect(d.getByTestId("chance-flow")).toHaveCount(0);
});

test("Game Center: sections, situation comparison, shot map, goalies, lines, NHL+ closes the dialog first", async ({ page }) => {
  await mount(page, ["ot"]);
  const c = await show(page, "ot");
  await page.evaluate(() => { (window as any).__nhlp = []; window.addEventListener("iceboard:nhlplus", (e) => (window as any).__nhlp.push({ detail: (e as CustomEvent).detail, dialogOpen: !!document.querySelector("dialog.game-dialog") })); });
  await c.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await expect(d.getByTestId("gc-profile")).toContainText("Season profile");
  const flow = d.getByTestId("gc-flow");
  await expect(flow.getByTestId("chance-flow")).toBeVisible();
  const log = games.games["2026020063"];
  const sitCmp = flow.getByTestId("situation-compare");
  await expect(sitCmp).toContainText(log.teams.SJS.all.xGF.toFixed(2));
  await pickSituation(flow, "5v5");
  await expect(sitCmp).toContainText(log.teams.SJS["5on5"].xGF.toFixed(2));
  const lineAway = flow.getByTestId("flow-line-away");
  expect(Number(await lineAway.getAttribute("data-xg"))).toBeCloseTo(OT.shots.filter((s: any) => s.team === "SJS" && s.sit === "5on5").reduce((t: number, s: any) => t + s.xg, 0), 6);
  await pickSituation(flow, "PP");
  await expect(sitCmp).toContainText("power play");
  await pickSituation(flow, "All");
  // shot map: goals are the ringed dots
  const dots = flow.getByTestId("map-shot");
  expect(await dots.count()).toBeGreaterThan(20);
  await expect(flow.locator(".map-shot.goal")).toHaveCount(OT.shots.filter((s: any) => s.g && s.x != null && s.x >= 0).length);
  await flow.locator(".map-shot.goal").first().hover();
  await expect(flow.locator(".nhlp-map .nhlp-pop")).toContainText("Expected goal value");
  // the two goalies of this game, with game and season GSAx
  const gl = d.getByTestId("gc-goalies-lines");
  await gl.locator("summary").click();
  await expect(gl.getByTestId("goalie-row")).toHaveCount(log.goalies.length);
  const g0 = log.goalies[0];
  await expect(gl.getByTestId("goalie-row").first()).toContainText(g0.name);
  await expect(gl.getByTestId("goalie-row").first()).toContainText(`${g0.xGA - g0.GA >= 0 ? "+" : "−"}${Math.abs(g0.xGA - g0.GA).toFixed(2)}`);
  await expect(gl.getByTestId("lines-block")).toContainText("Top 5-on-5 lines and pairings");
  // NHL+ from inside the dialog: the dialog is gone before the event fires
  await d.getByTestId("gc-profile").getByRole("button", { name: /NHL\+/ }).click();
  const ev = await page.evaluate(() => (window as any).__nhlp);
  expect(ev).toHaveLength(1);
  expect(ev[0].detail).toMatchObject({ view: "matchups", away: "SJS", home: "STL", gameId: 2026020063 });
  await expect(d).toHaveCount(0);
});

test("Game Center for a live game: season profile plus a labelled NHL feed note, no MoneyPuck chance flow", async ({ page }) => {
  await mount(page, ["live"]);
  const c = await show(page, "live");
  await c.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await d.getByTestId("gc-flow").locator("summary").click();
  await expect(d.getByTestId("live-activity")).toContainText("NHL feed");
  await expect(d.getByTestId("live-activity")).toContainText("BOS 11");
  await expect(d.getByTestId("chance-flow")).toHaveCount(0);
  await expect(d.getByTestId("gc-flow").getByTestId("nhlp-pending")).toContainText("no live feed");
});

test("stale and unavailable states", async ({ page }) => {
  await mount(page, ["future"], { summary: (j) => ({ ...j, sourceUpdated: { ...j.sourceUpdated, summary: "2026-10-01T10:00:00.000Z" } }) });
  const c = await show(page, "future");
  await expect(c.getByTestId("nhlp-strip")).toContainText(/stale/i);
});
test("unavailable summary shows a retry and keeps the NHL+ button", async ({ page }) => {
  await mount(page, ["future"], { failSummary: true });
  const c = await show(page, "future");
  await expect(c.getByTestId("nhlp-strip")).toContainText("Season profile unavailable");
  await expect(c.getByTestId("nhlp-strip").getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(c.getByTestId("nhlp-strip").getByRole("button", { name: /NHL\+/ })).toBeVisible();
});

test("loads lazily and shares one fetch across cards; no shots for non-final games", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/moneypuck/")) urls.push(new URL(r.url()).pathname); });
  await mount(page, ["future", "live", "intermission", "ot", "so", "noshots", "pending"]);
  await show(page, "future");
  for (const k of ["live", "intermission", "ot", "so", "noshots", "pending"] as K[]) await show(page, k);
  await expect(card(page, "pending").getByTestId("nhlp-pending")).toBeVisible();
  await page.waitForTimeout(300);
  const count = (s: string) => urls.filter((u) => u.endsWith(s)).length;
  expect(count("/summary") + count("/summary.json")).toBeLessThanOrEqual(2); // api probe + saved copy, once
  expect(count("/games") + count("/games.json")).toBeLessThanOrEqual(2);
  expect(urls.filter((u) => /shots\//.test(u)).every((u) => /20260(20063|20068|20001)/.test(u))).toBe(true);
});

test("layout: no horizontal overflow at 320px, cards and Game Center; screenshots", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mount(page, ["future", "live", "ot", "so", "pending"]);
  for (const k of ["future", "ot"] as K[]) await show(page, k);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const c = await show(page, "ot");
  await c.locator(".game-card-summary").click();
  await expect(c.getByTestId("chance-flow")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await c.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await expect(d.getByTestId("shot-map")).toBeVisible();
  expect(await d.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await d.getByTestId("gc-goalies-lines").locator("summary").click();
  await expect(d.getByTestId("lines-block")).toBeVisible();
  const wide = await d.evaluate((n) => [...n.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > n.getBoundingClientRect().right + 1 && !e.closest(".nhlp-table-wrap")).slice(0, 6).map((e) => `${e.tagName}.${(e as HTMLElement).className?.toString?.().slice(0, 40)} ${Math.round(e.getBoundingClientRect().right)}`));
  expect(wide, "elements past the dialog edge").toEqual([]);
  expect(await d.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
});

test("screenshots", async ({ page }, info) => {
  await mount(page, ["future", "live", "intermission", "ot", "so", "noshots", "pending"]);
  const name = info.project.name;
  await show(page, "future");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/cards-shots/${name}-board-upcoming.png`, fullPage: true });
  const f = await show(page, "future");
  await f.locator(".game-card-summary").click();
  await page.waitForTimeout(400);
  await f.screenshot({ path: `/tmp/cards-shots/${name}-future-expanded.png` });
  for (const k of ["so", "noshots", "pending"] as K[]) await show(page, k);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/cards-shots/${name}-board-past.png`, fullPage: true });
  const c = await show(page, "ot");
  await c.locator(".game-card-summary").click();
  await page.waitForTimeout(500);
  await c.screenshot({ path: `/tmp/cards-shots/${name}-ot-expanded.png` });
  await c.locator(".gc-icon").click();
  const d = page.locator("dialog.game-dialog");
  await d.getByTestId("gc-goalies-lines").locator("summary").click();
  await page.waitForTimeout(500);
  for (const id of ["gc-profile", "gc-flow", "gc-goalies-lines"]) {
    await d.getByTestId(id).scrollIntoViewIfNeeded();
    await d.getByTestId(id).screenshot({ path: `/tmp/cards-shots/${name}-gc-${id}.png` });
  }
});
