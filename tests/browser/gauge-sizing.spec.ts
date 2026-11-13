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
      const p = g.parentElement!.getBoundingClientRect(), f = g.getBoundingClientRect();
      const vs = g.querySelector<HTMLElement>(".vs"), track = g.querySelector<HTMLElement>(".vs-track");
      return { parentW: p.width, figW: f.width, vsW: vs?.scrollWidth ?? 0, vsClient: vs?.clientWidth ?? 0, trackW: track?.getBoundingClientRect().width ?? 0, label: g.getAttribute("aria-label")?.slice(0, 30) };
    });
    return { dialogW, scrollW: d.scrollWidth, gauges };
  });
}

for (const width of [390, 360, 320, 1440, 1920]) {
  test(`gauges stay inside their parent, with a usable bar, at ${width}px, with no sideways overflow`, async ({ page }) => {
    const dialog = await openGame(page, width);
    const m = await measure(dialog);
    expect(m.gauges.length).toBeGreaterThan(1);
    for (const g of m.gauges) {
      expect(g.figW, `${g.label} figure vs parent`).toBeLessThanOrEqual(g.parentW + 0.5);
      expect(g.vsW, `${g.label} head-to-head row overflows its box`).toBeLessThanOrEqual(g.vsClient + 1);
      expect(g.trackW, `${g.label} bar has room`).toBeGreaterThan(60);
    }
    expect(m.scrollW).toBeLessThanOrEqual(m.dialogW + 1);
  });
}

// The hero card (after the reference design): projected final score on top, deserved to win beneath, each the full width of the card.
for (const width of [390, 360, 320]) {
  test(`the hero card stacks the projected score over deserved to win at ${width}px, both inside the card`, async ({ page }) => {
    const dialog = await openGame(page, width);
    const hero = dialog.getByTestId("deserved-hero");
    await expect(hero.locator(".gr-model .gauge.proj")).toBeVisible();
    const [card, a, b] = await Promise.all([hero.boundingBox(), hero.locator(".gr-model .gauge").boundingBox(), hero.locator(".gr-deserved .gauge").boundingBox()]);
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + 1); // stacked
    for (const r of [a!, b!]) { expect(r.x).toBeGreaterThanOrEqual(card!.x - 0.5); expect(r.x + r.width).toBeLessThanOrEqual(card!.x + card!.width + 0.5); }
    expect(a!.width).toBeGreaterThan(card!.width * 0.7);
  });
}
