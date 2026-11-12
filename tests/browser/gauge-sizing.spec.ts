import { expect, test, type Page } from "@playwright/test";
import manifest from "../../public/data/manifest.json" with { type: "json" };

const season = manifest.current;
const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const base = { season, type: 2, date: day, scheduleState: "OK", venue: "Test Arena", broadcasts: [], round: null };
let n = 0;
const play = (type: string, team: string, x: number, y: number, period: number, time: string, player = "Skater") => ({ id: ++n, order: n, type, team, x, y, period, periodType: "REG", time, player });
const live = { ...base, id: 9501, home: "TOR", away: "BOS", state: "LIVE", period: 3, periodType: "REG", clock: "10:00", awayScore: 1, homeScore: 1, start: new Date(Date.now() - 6000000).toISOString(), homeShots: 12, awayShots: 9 };
const final = { ...base, id: 9502, home: "DAL", away: "MIN", state: "FINAL", end: "REG", awayScore: 1, homeScore: 3, start: new Date(Date.now() - 12000000).toISOString(), homeShots: 30, awayShots: 22 };
const slot = (team: string, i: number, period: number, time: string, type = "shot-on-goal", player = "Skater") => play(type, team, team === "TOR" || team === "DAL" ? 80 - (i % 4) : -78 + (i % 4), (i % 5) - 2, period, time, player);
const feedPlays = (home: string, away: string) => [
  ...Array.from({ length: 6 }, (_, i) => slot(home, i, 1 + (i % 3), `${2 + i}:00`)),
  ...Array.from({ length: 4 }, (_, i) => slot(away, i, 1 + (i % 3), `${4 + i}:30`)),
  play("goal", home, 82, 1, 2, "08:10", "Auston Matthews"), play("goal", away, -80, -3, 3, "02:40", "Brad Marchand"), play("missed-shot", home, 60, 20, 3, "04:00"),
];
const stats = [{ label: "hit", home: 21, away: 14 }, { label: "faceoff", home: 15, away: 11 }];

async function open(page: Page) {
  const snapshot = { season, updatedAt: new Date().toISOString(), source: "fixture", games: [live, final] };
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(`**/api/season/${season}`, (route) => route.fulfill({ json: snapshot }));
  await page.route(`**/data/seasons/${season}.json`, (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/moneypuck/**/shots/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/moneypuck/**", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.route("**/api/game/*", (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const g = id === live.id ? live : final;
    const plays = feedPlays(g.home, g.away);
    return route.fulfill({ json: { ...g, plays, shots: plays, goals: plays.filter((p) => p.type === "goal"), stats } });
  });
  await page.goto("/");
}

// Gauge sizing: a dial is as wide as its variant (compact 120 / standard 190 / expanded 280 px) and never as wide as its parent.
// Every dial's own limit is its resolved --gauge-w (120 / 190 / 280); none may exceed the expanded token.
const EXPANDED = 280;

async function openGame(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await open(page);
  await page.locator(`.sb-row[data-game="${live.id}"] .gc-icon`).click();
  const dialog = page.locator("dialog.game-dialog[open]");
  await expect(dialog.getByTestId("deserved-hero")).toBeVisible({ timeout: 30000 });
  await expect(dialog.locator(".gauge").first()).toBeVisible();
  return dialog;
}

async function measure(dialog: ReturnType<Page["locator"]>) {
  return dialog.evaluate((d) => {
    const dialogW = d.clientWidth;
    const gauges = [...d.querySelectorAll<HTMLElement>(".gauge")].filter((g) => g.getBoundingClientRect().width > 0).map((g) => {
      const r = g.querySelector("svg")!.getBoundingClientRect(), p = g.parentElement!.getBoundingClientRect(), f = g.getBoundingClientRect();
      const max = parseFloat(getComputedStyle(g).getPropertyValue("--gauge-w")), variant = `${g.className} (max ${max})`;
      return { stretch: g.classList.contains("stretch"), variant, max, svgW: r.width, svgH: r.height, parentW: p.width, figW: f.width, label: g.getAttribute("aria-label")?.slice(0, 30) };
    });
    return { dialogW, scrollW: d.scrollWidth, gauges };
  });
}

for (const width of [390, 360, 320, 1440, 1920]) {
  test(`gauges stay within their variant and their parent at ${width}px, with no sideways overflow`, async ({ page }) => {
    const dialog = await openGame(page, width);
    const m = await measure(dialog);
    expect(m.gauges.length).toBeGreaterThan(1);
    for (const g of m.gauges) {
      expect(g.figW, `${g.label} figure vs parent`).toBeLessThanOrEqual(g.parentW + 0.5);
      if (g.stretch) { expect(g.svgW, `${g.label} stretch gauge stays inside its figure`).toBeLessThanOrEqual(g.figW + 0.5); continue; } // a stretch gauge fills its parent by design
      expect(g.svgW, `${g.label} svg vs variant ${g.variant}`).toBeLessThanOrEqual(Math.min(g.max, EXPANDED) + 0.5);
      expect(g.svgH / g.svgW).toBeCloseTo(146 / 200, 1); // aspect is kept
    }
    expect(m.scrollW).toBeLessThanOrEqual(m.dialogW + 1);
  });
}

for (const width of [390, 360]) {
  test(`the two headline dials share one row at ${width}px, each about half the width`, async ({ page }) => {
    const dialog = await openGame(page, width);
    const hero = dialog.getByTestId("deserved-hero");
    await expect(hero.locator(".gr-model .gauge")).toBeVisible();
    const [a, b] = await Promise.all([hero.locator(".gr-deserved .gauge").boundingBox(), hero.locator(".gr-model .gauge").boundingBox()]);
    expect(Math.min(a!.y + a!.height, b!.y + b!.height) - Math.max(a!.y, b!.y), "same row: the dials overlap vertically").toBeGreaterThan(a!.height * 0.8); // a longer heading may sit one dial lower, never in another row
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1); // side by side, not overlapping
    expect(a!.width).toBeLessThan(width / 2);
    expect(a!.height).toBeLessThan(200); // not the ~280px-wide, ~250px-tall stacked dials of before
  });
}

for (const width of [1440, 1920]) {
  test(`no dial fills a wide row on its own at ${width}px`, async ({ page }) => {
    const dialog = await openGame(page, width, 1000);
    const m = await measure(dialog);
    for (const g of m.gauges.filter((x) => !x.stretch)) expect(g.svgW, g.label).toBeLessThanOrEqual(Math.min(g.max, EXPANDED) + 0.5); // dials stay capped; a stretch gauge fills its box on purpose
    const lone = await dialog.evaluate((d) => {
      const h = d.querySelector<HTMLElement>(".gr-hero")!;
      const first = h.querySelector<HTMLElement>(".gauge")!;
      return { stretch: first.classList.contains("stretch"), kids: h.children.length, w: h.getBoundingClientRect().width, g: first.getBoundingClientRect().width };
    });
    if (lone.stretch) expect(lone.g, "a stretch gauge fills its share of the hero").toBeGreaterThan(lone.w * 0.3);
    else expect(lone.g).toBeLessThan(lone.w * (lone.kids === 1 ? 0.5 : 0.7)); // a lone dial is centred and capped, never the whole row
  });
}
